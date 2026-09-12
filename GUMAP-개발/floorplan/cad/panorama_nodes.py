"""360 촬영 지점과 지점 사이 연결을 CAD 에서 자동으로 놓는다.

  python GUMAP-개발/floorplan/cad/panorama_nodes.py

로드뷰처럼 보여주려면 파노라마를 어디서 찍고, 어느 지점에서 어느 지점으로
넘어갈 수 있는지가 있어야 한다. 보통은 이걸 손으로 찍거나 SLAM 으로 푸는데,
우리는 층별 벽선과 호실 구획이 이미 있으니 도면에서 바로 뽑을 수 있다.

놓는 규칙
  · **호실 안에는 놓지 않는다.** 복도·계단·로비만 찍는다. 남의 연구실과 강의실
    안을 360 으로 찍는 건 허락받을 일이 아니라 받지 못할 일이다.
  · 복도는 SPACING 간격 격자. 칸마다 벽에서 가장 먼 자리를 고른다. 호실 폴리곤
    바깥만 쓰므로 계단실·로비·홀이 자연히 여기 들어온다.
  · 문간은 **양쪽이 다 호실 밖일 때만** 놓는다. 복도와 복도를 가르는 방화문,
    계단실 문, 건물 출입문이 여기 해당한다. 호실 문 앞에 서면 문이 열린 동안
    방 안이 그대로 찍히므로 그 자리는 아예 빼 둔다.
  · 지점 사이는 **걸어서 닿으면** 잇는다. 문틀은 벽선에 틈으로 그려져 있으므로
    문을 지나는 연결은 저절로 살아남고, 벽을 뚫는 연결은 저절로 죽는다.

이건 촬영 계획이지 촬영 결과가 아니다. 실제로 찍을 때 삼각대를 여기 그대로
놓을 수 있는지(가구·적재물), 그 복도에 들어가도 되는지는 확인하지 않았다.
"""
from __future__ import annotations

import json
import math
from collections import deque
import sys
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent))

import exterior_doors as X  # noqa: E402
import publish  # noqa: E402

SPACING_M = 3.0        # 복도 촬영 간격
CLEARANCE_M = 0.45     # 벽에서 이만큼은 떨어져야 삼각대가 선다
DOOR_CLEARANCE_M = 0.2  # 문간은 좁다. 여기서는 이만큼만 띄운다
MIN_GAP_M = 2.0        # 지점끼리 이보다 가까우면 하나만 남긴다
LINK_MAX_M = 9.0       # 걸어서 이보다 멀면 잇지 않는다
LINK_MIN_M = 3.5       # 짧은 구간은 좀 돌아가도 이웃으로 본다
DETOUR = 1.7           # 돌아가는 길이 직선거리의 이 배를 넘으면 옆 지점이 아니다
WALK_CELL_M = 0.15     # 연결 판정 격자
WALK_CLEARANCE_M = 0.15  # 지나갈 때 벽에서 띄우는 거리. 문간이 좁아 크게 못 준다
LINK_MAX_PER_NODE = 6
LINK_ANGLE_DEG = 22.0  # 같은 방향으로 겹치는 연결은 가까운 것만 남긴다
BRIDGE_MAX_M = 12.0    # 끊긴 덩어리끼리 이만큼 안이고 벽이 없으면 이어 붙인다
CAMERA_HEIGHT_M = 1.6  # 뷰어가 합성 파노라마를 그릴 때 쓰는 눈높이
PASSAGE_PROBE_M = 0.9  # 문 양쪽을 이만큼 떨어져서 들여다본다 (호실 문인지 가른다)
NEAR_ROOM_M = 2.5      # 지점에서 이 안에 있는 호실 번호를 '여기는 어디' 로 적는다


def open_doorways(raster, walls, doors):
    """문을 열어 둔 벽 래스터.

    도면은 문짝을 **닫힌 자리에 선 하나로** 그린다. 그 선을 벽으로 치면 모든
    문간이 막혀서, 방 안 지점이 복도와 이어지지 않고 통째로 고립된다. 실제로
    1층에서 방 23개가 그렇게 떨어져 나갔다. 촬영 계획에서는 문을 지나갈 수
    있어야 하므로 문턱 가운데를 작은 원만큼 지운다. 문틀 기둥은 문턱에서 문 폭의
    절반만큼 떨어져 있으므로 그 원에 닿지 않는다.
    """
    opened = walls.copy()
    for door in doors:
        radius = min(0.35, door["radius_m"] * 0.4)
        cv2.circle(opened, raster.to_px(door["threshold"]),
                   int(round(radius / X.PX)), 0, -1)
    return opened


def walkable_mask(raster, envelope, walls, clearance=CLEARANCE_M):
    """삼각대를 세울 수 있는 자리. 외피 안이면서 벽에서 clearance 이상 떨어진 곳."""
    blocked = cv2.dilate((walls > 0).astype(np.uint8), X.disk(clearance))
    free = ((envelope == 1) & (blocked == 0)).astype(np.uint8)
    # 벽 틈으로 새어 나간 자잘한 조각은 지점을 놓을 자리가 아니다.
    count, labels, stats, _ = cv2.connectedComponentsWithStats(free, connectivity=4)
    keep = [i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] * X.PX * X.PX >= 2.0]
    return np.isin(labels, keep).astype(np.uint8) if keep else free


def best_spot(raster, walkable, distance, box):
    """상자 안에서 벽에서 가장 먼 자리. 없으면 None."""
    (x0, y0), (x1, y1) = raster.to_px(box[0]), raster.to_px(box[1])
    x0, x1 = sorted((max(0, x0), min(raster.w, x1)))
    y0, y1 = sorted((max(0, y0), min(raster.h, y1)))
    if x1 <= x0 or y1 <= y0:
        return None
    window = distance[y0:y1, x0:x1] * walkable[y0:y1, x0:x1]
    if not window.any():
        return None
    index = int(np.argmax(window))
    return raster.to_m(x0 + index % window.shape[1], y0 + index // window.shape[1])


def clear_line(raster, walls, a, b):
    """두 지점을 잇는 직선이 벽을 지나지 않는가."""
    steps = int(math.dist(a, b) / X.PX) + 1
    for i in range(steps + 1):
        t = i / steps
        point = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        if raster.at(walls, point):
            return False
    return True


def room_mask(raster, data):
    """호실 번호가 붙은 구획을 채운 마스크. 복도 격자를 여기서 빼는 데 쓴다."""
    mask = raster.blank()
    for space in data["spaces"]:
        if not space["properties"]["room_ids"] or space["geometry"]["type"] != "Polygon":
            continue
        ring = space["geometry"]["coordinates"][0]
        cv2.fillPoly(mask, [np.array([raster.to_px(q) for q in ring], np.int32)], 1)
    return mask


def public_doorway(raster, rooms, door):
    """이 문이 **호실로 들어가는 문이 아닌지** 본다.

    문턱 양쪽을 PASSAGE_PROBE_M 만큼 떨어져서 들여다보고, 한쪽이라도 호실
    폴리곤 안이면 호실 문이다. 지나가는 방향은 문틀(문설주)을 잇는 축과 직각인
    쪽이다. opening_axis 가 그 축을 이미 골라 두었다.

    호실 문 앞을 빼는 이유는 사생활이다. 문 앞에 삼각대를 세우면, 그 문이 열려
    있는 동안 방 안이 360 도로 그대로 들어온다. 복도만 찍기로 했으면 문 앞도
    찍지 않는 게 맞다.
    """
    axis = door.get("axis")
    if axis is None:
        return True
    across = (-axis[1], axis[0])
    for sign in (1, -1):
        point = (door["threshold"][0] + across[0] * PASSAGE_PROBE_M * sign,
                 door["threshold"][1] + across[1] * PASSAGE_PROBE_M * sign)
        if raster.at(rooms, point):
            return False
    return True


def place_nodes(raster, doorway, distance, doors, outside_rooms, rooms):
    """복도·계단·로비만 놓는다. 호실 안에는 놓지 않는다.

    문간을 먼저 놓는 이유는 연결 때문이다. 복도와 복도 사이 방화문, 계단실 문은
    격자가 그 자리를 고를 이유가 없는데, 지점이 없으면 문 너머가 통째로 떨어져
    나간다. 대신 **호실로 들어가는 문은 빼고** 양쪽이 다 호실 밖인 문만 남긴다.

    복도 격자는 **호실 폴리곤 밖에만** 놓는다. 처음에는 이 제한이 없어서, 칸마다
    '벽에서 가장 먼 자리' 를 고르는 규칙이 큰 강의실 한가운데를 계속 골랐다.
    강의실 하나에 지점이 여덟 개씩 박히고 정작 복도는 비어서, 1층 지점의 23%
    만 서로 이어졌다. 지금은 그 제한이 사생활 규칙까지 겸한다.
    """
    nodes = []

    def accept(point, kind, mask):
        if point is None or not raster.at(mask, point):
            return False
        gap = 0.9 if kind == "door" else MIN_GAP_M
        if any(math.dist(point, n["at"]) < gap for n in nodes):
            return False
        nodes.append(dict(at=(round(point[0], 2), round(point[1], 2)), kind=kind, room=None))
        return True

    for door in doors:
        if not public_doorway(raster, rooms, door):
            continue
        accept(tuple(door["threshold"]), "door", doorway)

    x0, x1 = X.PLAN["x"]
    y0, y1 = X.PLAN["y"]
    for gy in range(int((y1 - y0) / SPACING_M)):
        for gx in range(int((x1 - x0) / SPACING_M)):
            cx, cy = x0 + gx * SPACING_M, y0 + gy * SPACING_M
            accept(best_spot(raster, outside_rooms, distance,
                             ((cx, cy + SPACING_M), (cx + SPACING_M, cy))),
                   "corridor", outside_rooms)
    return nodes


def label_nodes(nodes, data):
    """지점마다 '여기는 어디' 를 붙인다.

    복도만 찍으면 화면에 나오는 게 다 비슷한 복도라서, 지금 선 자리가 어디인지
    알 길이 없다. 가까운 호실 번호를 적어 두면 '304호 앞 복도' 라고 말할 수 있다.
    호실 안을 찍는다는 뜻이 아니라, 그 문 앞 복도라는 뜻이다.
    """
    spaces, ids = [], []
    for space in data["spaces"]:
        if space["geometry"]["type"] != "Polygon":
            continue
        for room_id in space["properties"]["room_ids"]:
            spaces.append(Polygon(space["geometry"]["coordinates"][0]))
            ids.append(room_id)
    if not spaces:
        return nodes
    index = STRtree(spaces)
    for node in nodes:
        point = Point(node["at"])
        near = []
        for k in index.query(point.buffer(NEAR_ROOM_M)):
            gap = spaces[k].distance(point)
            if gap <= NEAR_ROOM_M:
                near.append((gap, ids[k]))
        near.sort()
        node["near"] = [room_id for _, room_id in near[:3]]
        node["room"] = near[0][1] if near else None
    return nodes


def whole_floor(raster, segments):
    """이 층 벽선이 감싸는 덩어리 전체. 잘라내지 않은 외피다.

    exterior_doors 의 외피는 '이 층 방에서 3 m 안' 으로 한 번 잘린다. 출입문이
    건물 밖으로 나가는지 보는 데는 그게 맞지만, 걸어다니는 데 쓰면 라벨에서 먼
    복도 토막이 통째로 잘려 투어가 거기서 끊긴다. 그래서 이동 판정에는 자르기
    전 덩어리를 쓴다. 지점을 **놓는** 자리는 여전히 잘린 외피 안이다.
    """
    box = [[X.PLAN["x"][0], X.PLAN["y"][0]], [X.PLAN["x"][1], X.PLAN["y"][0]],
           [X.PLAN["x"][1], X.PLAN["y"][1]], [X.PLAN["x"][0], X.PLAN["y"][1]]]
    return X.build_envelope(raster, segments, [box])[0]


def walk_grid(raster, envelope, walls, rooms=None, cell=WALK_CELL_M):
    """사람이 지나갈 수 있는 칸 격자. 연결을 판정할 때 쓴다.

    rooms 를 주면 호실 안을 지워서 **복도로만 걸어다니는** 격자가 된다. 이게
    중요하다. 호실을 넣어 두면 두 복도가 연구실을 가로질러 이어진 것으로 나온다.
    도면에서는 이어져 보이지만 실제로 그 길로 촬영하며 지나갈 수는 없다.
    """
    blocked = cv2.dilate((walls > 0).astype(np.uint8), X.disk(WALK_CLEARANCE_M))
    free = ((envelope == 1) & (blocked == 0)).astype(np.uint8)
    if rooms is not None:
        free = (free & (rooms == 0)).astype(np.uint8)
    step = int(round(cell / X.PX))
    return free[::step, ::step], step


def cell_of(raster, walk, step, point):
    """지점이 앉을 자유공간 칸. 막힌 칸이면 가장 가까운 자유칸으로 붙인다.

    문간 지점은 자유공간 격자에서 한 칸 비켜 있을 수 있다. 붙여 주지 않으면
    막힌 칸에서 퍼뜨리게 되고 그 지점은 통째로 고립된다.
    """
    height, width = walk.shape
    x, y = raster.to_px(point)
    cx = min(width - 1, max(0, x // step))
    cy = min(height - 1, max(0, y // step))
    if walk[cy, cx]:
        return (cx, cy)
    for radius in range(1, 7):
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < width and 0 <= ny < height and walk[ny, nx]:
                    return (nx, ny)
    return (cx, cy)


def flood(walk, sources, parents=False):
    """여러 칸에서 한꺼번에 퍼뜨린다. parents 면 되짚을 수 있게 부모를 남긴다."""
    height, width = walk.shape
    seen = {cell: 0 for cell in sources}
    came = {cell: None for cell in sources} if parents else None
    queue = deque(sources)
    while queue:
        cx, cy = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = cx + dx, cy + dy
            if not (0 <= nx < width and 0 <= ny < height) or (nx, ny) in seen:
                continue
            if not walk[ny, nx]:
                continue
            seen[(nx, ny)] = seen[(cx, cy)] + 1
            if parents:
                came[(nx, ny)] = (cx, cy)
            queue.append((nx, ny))
    return seen, came


def stitch_components(nodes, raster, walk, step, outside_rooms, spacing=SPACING_M):
    """끊긴 덩어리 사이를 **걸어가면서** 지점을 더 놓는다.

    복도는 다 이어져 있는데 지점이 띄엄띄엄해서 끊기는 일이 많다. 1층에서 남쪽
    동과 북쪽 동은 복도로 이어져 있지만 걸어서 90 m 라, 그 사이 어딘가에서 지점
    간격이 LINK_MAX_M 를 넘으면 그래프가 둘로 갈라진다.

    그래서 큰 덩어리에서 자유공간을 퍼뜨려 끊긴 덩어리까지 가는 **실제 도보
    경로**를 찾고, 그 길 위에 spacing 간격으로 지점을 더 놓는다. 사람이 걸어가며
    찍는 것과 같은 순서다. 격자가 호실을 뺀 것이므로 이 길은 복도로만 간다.

    복도로 갈 수 없는 덩어리(도면상 닫힌 계단실·승강로)는 길이 안 나오므로
    그대로 남고, 뒤에서 걸러진다.
    """
    added = 0
    for _ in range(60):
        groups = components(nodes)
        if len(groups) < 2:
            break
        groups.sort(key=len, reverse=True)
        cells = {}
        for i, node in enumerate(nodes):
            cells[i] = cell_of(raster, walk, step, node["at"])
        seen, came = flood(walk, [cells[i] for i in groups[0]], parents=True)
        best = None
        for group in groups[1:]:
            for i in group:
                steps = seen.get(cells[i])
                if steps is not None and (best is None or steps < best[0]):
                    best = (steps, i)
        if best is None:
            break
        # 그 지점에서 큰 덩어리까지 왔던 길을 되짚으며 간격을 메운다.
        path, cell = [], cells[best[1]]
        while cell is not None:
            path.append(raster.to_m(cell[0] * step, cell[1] * step))
            cell = came[cell]
        walked, grew = 0.0, False
        for k in range(1, len(path)):
            walked += math.dist(path[k - 1], path[k])
            if walked < spacing:
                continue
            walked = 0.0
            point = path[k]
            if not raster.at(outside_rooms, point):
                continue
            if any(math.dist(point, n["at"]) < MIN_GAP_M * 0.8 for n in nodes):
                continue
            nodes.append(dict(at=(round(point[0], 2), round(point[1], 2)),
                              kind="corridor", room=None))
            added += 1
            grew = True
        if not grew:
            break
        link_nodes(nodes, raster, walk, step)
    return added


def link_nodes(nodes, raster, walk, step):
    """**걸어서 닿는** 이웃끼리 잇는다.

    처음에는 두 지점을 잇는 직선이 벽을 지나는지만 봤다. 그러면 복도 기둥 하나,
    문틀 하나에 걸려 연결이 끊긴다. 1층에서 지점의 21% 만 한 덩어리로 이어졌고,
    투어가 중간에서 막혔다. 사람은 기둥을 돌아서 간다.

    그래서 자유공간 위에서 지점마다 너비우선으로 퍼뜨려, LINK_MAX_M 안에 닿는
    지점을 이웃으로 삼는다. 돌아가는 길이 직선거리의 DETOUR 배를 넘으면 그건
    '옆방' 이지 '옆 지점' 이 아니므로 버린다.
    """
    height, width = walk.shape
    limit = int(LINK_MAX_M / WALK_CELL_M)

    at_cell = {}
    for i, node in enumerate(nodes):
        node["cell"] = cell_of(raster, walk, step, node["at"])
        at_cell.setdefault(node["cell"], []).append(i)
        node["to"] = []

    for i, node in enumerate(nodes):
        start = node["cell"]
        seen = {start: 0}
        queue = deque([start])
        found = []
        while queue:
            cx, cy = queue.popleft()
            steps = seen[(cx, cy)]
            for j in at_cell.get((cx, cy), []):
                if j != i:
                    found.append((steps * WALK_CELL_M, j))
            if steps >= limit:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = cx + dx, cy + dy
                if not (0 <= nx < width and 0 <= ny < height) or (nx, ny) in seen:
                    continue
                if not walk[ny, nx]:
                    continue
                seen[(nx, ny)] = steps + 1
                queue.append((nx, ny))
        taken = []
        for walked, j in sorted(found):
            if len(taken) >= LINK_MAX_PER_NODE:
                break
            other = nodes[j]["at"]
            straight = math.dist(node["at"], other)
            if walked > max(LINK_MIN_M, straight * DETOUR):
                continue
            bearing = math.atan2(other[1] - node["at"][1], other[0] - node["at"][0])
            if any(abs((bearing - b + math.pi) % (2 * math.pi) - math.pi)
                   < math.radians(LINK_ANGLE_DEG) for b in taken):
                continue
            taken.append(bearing)
            node["to"].append(j)

    # 한쪽에서만 보이는 연결은 양쪽에 다 넣는다. 들어갔다 못 나오면 곤란하다.
    for i, node in enumerate(nodes):
        for j in node["to"]:
            if i not in nodes[j]["to"]:
                nodes[j]["to"].append(i)
    for node in nodes:
        node.pop("cell", None)
    return nodes


def components(nodes):
    seen, groups = set(), []
    for start in range(len(nodes)):
        if start in seen:
            continue
        stack, group = [start], []
        seen.add(start)
        while stack:
            current = stack.pop()
            group.append(current)
            for j in nodes[current]["to"]:
                if j not in seen:
                    seen.add(j)
                    stack.append(j)
        groups.append(group)
    return groups


def bridge_components(nodes, raster, walls):
    """떨어진 덩어리끼리 접합부에서 이어 붙인다.

    동(wing) 안에서는 걸어서 다 닿는데, 동과 동 사이가 끊긴다. 자동문 자리,
    중정을 끼고 도는 연결통로처럼 자유공간이 한 칸 폭으로 좁아지는 곳에서
    격자 탐색이 막히기 때문이다. 사람은 지나간다.

    그래서 마지막에 한 번 더 본다. 서로 다른 덩어리에 속하면서 BRIDGE_MAX_M
    안이고 둘 사이에 벽이 없으면 잇는다. 가까운 쌍부터 하나씩 붙이고, 붙을
    때마다 덩어리를 다시 센다.
    """
    added = 0
    while True:
        groups = components(nodes)
        if len(groups) < 2:
            break
        owner = {}
        for index, group in enumerate(groups):
            for k in group:
                owner[k] = index
        best = None
        for i, node in enumerate(nodes):
            for j, other in enumerate(nodes):
                if j <= i or owner[i] == owner[j]:
                    continue
                gap = math.dist(node["at"], other["at"])
                if gap > BRIDGE_MAX_M or (best and gap >= best[0]):
                    continue
                if not clear_line(raster, walls, node["at"], other["at"]):
                    continue
                best = (gap, i, j)
        if not best:
            break
        _, i, j = best
        nodes[i]["to"].append(j)
        nodes[j]["to"].append(i)
        added += 1
    return added


def keep_reachable_from_rooms(nodes):
    """호실 곁을 한 번도 지나지 않는 덩어리는 버린다.

    지점을 자르지 않은 덩어리 위에 놓으면, 5·6층 도면에 같이 그려진 아래층
    지붕 위에도 지점이 생긴다. 지붕에는 호실이 없으니 label_nodes 가 아무
    번호도 붙이지 못한다. '번호가 하나도 안 붙은 덩어리' 를 통째로 버리면
    깨끗이 사라진다. (label_nodes 를 먼저 돌려야 한다.)
    """
    keep = []
    for group in components(nodes):
        if any(nodes[k]["room"] for k in group):
            keep += group
    if not keep:
        return nodes
    keep = sorted(keep)
    remap = {old: new for new, old in enumerate(keep)}
    result = []
    for old in keep:
        node = dict(nodes[old])
        node["to"] = sorted(remap[j] for j in node["to"] if j in remap)
        result.append(node)
    return result


def number_zones(nodes):
    """이어진 덩어리마다 번호를 매긴다. 큰 덩어리가 0 번이다.

    한 층이 늘 한 덩어리로 이어지지는 않는다. 1층은 북쪽과 남쪽이 복도로는
    이어지지 않고, 사이에 있는 건 연구실이다. 도면상 지나갈 수는 있지만 남의
    연구실을 가로지르는 길이라 촬영 경로가 아니다.

    억지로 이어 붙이는 대신 구역 번호를 붙여 둔다. 뷰어는 구역을 넘어갈 때
    걸어가는 대신 지도에서 눌러 건너뛰게 한다. 실제로 찍을 때는 사람이 밖으로
    돌아 나가거나 다른 층을 거쳐 가므로, 그때 경로가 이어진다.
    """
    order = sorted(components(nodes), key=len, reverse=True)
    for zone, group in enumerate(order):
        for k in group:
            nodes[k]["zone"] = zone
    return len(order)


def build_floor(vectors, plan, floor):
    data = plan["floors"][floor]
    segments = X.floor_segments(vectors, data["origin_dwg_mm"])
    raster = X.Raster(X.WIDE)
    envelope, _, _, walls = X.build_envelope(raster, segments, X.occupied_rings(data))
    # 문간 좌표. exterior_doors 의 판정까지 갈 필요는 없고 문턱 가운데만 있으면 된다.
    doors = X.floor_doors(vectors, data["origin_dwg_mm"])
    lines = [LineString([a, b]) for a, b in segments]
    index = STRtree(lines)
    for door in doors:
        axis, _ = X.opening_axis(door, index, lines)
        door["axis"] = axis
        door["threshold"] = (door["centre"][0] + axis[0] * door["radius_m"] / 2,
                             door["centre"][1] + axis[1] * door["radius_m"] / 2)

    opened = open_doorways(raster, walls, doors)
    # 지점도 자르지 않은 덩어리 위에 놓는다. 좁은 외피를 쓰면 동과 동을 잇는
    # 연결통로가 통째로 잘려서, 각 동이 섬처럼 따로 놀았다(1층 최대 덩어리 30%).
    # 5·6층 도면에 같이 그려진 아래층 지붕은 방과 이어지지 않으므로 마지막에
    # keep_reachable_from_rooms 가 걸러 낸다.
    inside = whole_floor(raster, segments)
    walkable = walkable_mask(raster, inside, opened)
    doorway = walkable_mask(raster, inside, opened, DOOR_CLEARANCE_M)
    distance = cv2.distanceTransform(walkable, cv2.DIST_L2, 5) * X.PX

    rooms = room_mask(raster, data)
    outside_rooms = (walkable & (rooms == 0)).astype(np.uint8)
    # 걸어다니는 격자에서도 호실을 뺀다. 넣어 두면 두 복도가 연구실을 가로질러
    # 이어진 것으로 나오는데, 그 길로는 촬영하며 지나갈 수 없다.
    walk, step = walk_grid(raster, inside, opened, rooms)
    nodes = link_nodes(place_nodes(raster, doorway, distance, doors, outside_rooms, rooms),
                       raster, walk, step)
    stitched = stitch_components(nodes, raster, walk, step, outside_rooms)
    bridged = bridge_components(nodes, raster, opened)
    nodes = keep_reachable_from_rooms(label_nodes(nodes, data))
    nodes, lost = prune(nodes)
    zones = number_zones(nodes)
    largest = max((len(g) for g in components(nodes)), default=0)
    report = dict(nodes=len(nodes),
                  doors=sum(n["kind"] == "door" for n in nodes),
                  corridor=sum(n["kind"] == "corridor" for n in nodes),
                  inside_a_room=sum(1 for n in nodes if raster.at(rooms, n["at"])),
                  links=sum(len(n["to"]) for n in nodes) // 2,
                  zones=zones,
                  stitched=stitched,
                  bridges=bridged,
                  largest_component=largest,
                  connected_pct=round(largest / max(1, len(nodes)) * 100),
                  dropped_isolated=lost["count"],
                  walkable_m2=round(float(walkable.sum()) * X.PX * X.PX, 1))
    return nodes, report


def prune(nodes):
    """아무 데와도 이어지지 않는 지점은 뺀다.

    창고·샤프트처럼 벽으로 완전히 닫힌 자리에 지점이 생긴다. 촬영 계획에 남겨
    두면 '여기도 찍어야 하나' 하고 헷갈리기만 한다. 대신 그 바람에 지점을 잃은
    방 번호는 따로 적어 둔다.
    """
    keep = [i for i, n in enumerate(nodes) if n["to"]]
    dropped = [n for i, n in enumerate(nodes) if not n["to"]]
    remap = {old: new for new, old in enumerate(keep)}
    result = []
    for old in keep:
        node = dict(nodes[old])
        node["to"] = sorted(remap[j] for j in node["to"] if j in remap)
        result.append(node)
    return result, dict(count=len(dropped),
                        rooms=sorted(n["room"] for n in dropped if n["room"]))


def write_viewer(bundle):
    """데이터를 박아 넣은 독립 실행 뷰어. 서버 없이 더블클릭으로 열린다."""
    template = (X.BASE / "panorama_viewer.html").read_text(encoding="utf-8")
    payload = json.dumps(bundle, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    page = X.OUT / "panorama.html"
    page.write_text(template.replace("/*__PANO_DATA__*/ null", payload), encoding="utf-8")

    launcher = X.ROOT / "테크노관-360투어.html"
    launcher.write_text(
        "<meta charset=\"utf-8\"><title>테크노관 실내 360 투어</title>"
        "<meta http-equiv=\"refresh\" content=\"0; url=GUMAP-개발/floorplan/cad/output/panorama.html\">"
        "<p style=\"font:14px system-ui;padding:20px\">테크노관 360 투어를 여는 중… "
        "<a href=\"GUMAP-개발/floorplan/cad/output/panorama.html\">열리지 않으면 여기를 누르세요</a></p>\n",
        encoding="utf-8")
    return page, launcher


TOUR_PAGE = "GUMAP-개발/floorplan/cad/output/panorama.html"
SITE_TARGETS = [
    X.ROOT / "GUMAP-프론트/js/map/map-techno-pano-data.js",
    X.ROOT / "GUMAP-일반지도/map/map-techno-pano-data.js",
]


def publish_site(bundle, georef):
    """메인 지도에 찍을 카메라 자리를 프론트 번들로 내보낸다.

    지도는 위치와 이름만 있으면 된다. 파노라마 자체는 뷰어(panorama.html)가
    들고 있고, 지도는 그걸 작은 창에 iframe 으로 띄운다. 그래서 **지점 번호가
    두 쪽에서 같아야 한다**. 여기 배열의 순서가 곧 뷰어의 지점 번호다.
    """
    floors = []
    for data in bundle["floors"]:
        affine = data["affine"]
        points = []
        for node in data["nodes"]:
            x, y = node["at"]
            lon = affine["lon"][0] * x + affine["lon"][1] * y + affine["lon"][2]
            lat = affine["lat"][0] * x + affine["lat"][1] * y + affine["lat"][2]
            points.append([round(lat, 6), round(lon, 6), node["room"], node["kind"],
                           node.get("zone", 0)])
        floors.append(dict(floor=data["floor"], nodes=points))
    payload = dict(tour=TOUR_PAGE, camera_height_m=CAMERA_HEIGHT_M, spacing_m=SPACING_M,
                   status="capture plan only; no photographs exist yet",
                   floors=floors)
    text = ("window.TECHNO_PANO = "
            + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")
    written = []
    for target in SITE_TARGETS:
        if not target.parent.exists():
            continue
        target.write_text(text, encoding="utf-8")
        written.append(target)
    return written, len(text)


def main() -> int:
    vectors = X.read(X.BASE / "source/vectors.json")
    plan = X.read(X.OUT / "map.json")
    if vectors["source_sha256"] != plan["meta"]["sha256"]:
        raise SystemExit("DWG 해시가 다르다. build.py 를 먼저 실행하라.")
    georef = X.read(X.ROOT / "GUMAP-개발/floorplan/techno_georef.json")

    summary, bundle = {}, dict(
        camera_height_m=CAMERA_HEIGHT_M, spacing_m=SPACING_M,
        source=plan["meta"]["source"], sha256=plan["meta"]["sha256"],
        status="capture plan only; panoramas are synthesised from CAD walls, not photographs",
        floors=[])
    for floor in X.FLOORS:
        nodes, report = build_floor(vectors, plan, floor)
        affine, _ = publish.affine_for(floor, plan, georef)
        bundle["floors"].append(dict(
            floor=floor, affine={k: affine[k] for k in ("lon", "lat")},
            paths=publish.linework(floor, plan)[0],
            nodes=[dict(at=list(n["at"]), kind=n["kind"], room=n["room"],
                        near=n.get("near", []), zone=n.get("zone", 0), to=n["to"])
                   for n in nodes]))
        (X.OUT / f"{floor}.panorama.local.json").write_text(json.dumps(dict(
            floor=floor, spacing_m=SPACING_M, camera_height_m=CAMERA_HEIGHT_M,
            units="CAD local metres, Y up; NOT WGS84",
            status="capture plan from CAD geometry only; no photographs exist yet",
            nodes=nodes), ensure_ascii=False), encoding="utf-8")
        summary[floor] = report
        print(floor, json.dumps(report, ensure_ascii=False), flush=True)

    total = sum(r["nodes"] for r in summary.values())
    print(f"\n촬영 지점 {total}개 · 연결 {sum(r['links'] for r in summary.values())}개 · "
          f"뺀 고립 지점 {sum(r['dropped_isolated'] for r in summary.values())}개 · "
          f"호실 안에 들어간 지점 {sum(r['inside_a_room'] for r in summary.values())}개")
    page, launcher = write_viewer(bundle)
    print(f"\n뷰어: {page}  ({page.stat().st_size / 1048576:.1f} MB)")
    print(f"바로가기: {launcher}")
    written, size = publish_site(bundle, georef)
    for target in written:
        print(f"프론트 번들: {target}  ({size / 1024:.0f} KB)")
    (X.OUT / "panorama_report.json").write_text(json.dumps(dict(
        meta=dict(source=plan["meta"]["source"], sha256=plan["meta"]["sha256"],
                  spacing_m=SPACING_M, clearance_m=CLEARANCE_M,
                  caveat="촬영 계획이다. 가구·적재물·출입 허가는 확인하지 않았다."),
        floors=summary), ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
