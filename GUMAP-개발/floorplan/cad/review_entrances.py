"""외부 출입문 판정을 눈으로 대조할 그림을 층마다 만든다.

  python GUMAP-개발/floorplan/cad/review_entrances.py

output/entrance-review-*.png 에 저장한다. 초록 = 이 층 건물 외피, 흰 선 = CAD
원본 선형, 굵은 빨강 = 나가면 트이는 외부 문, 가는 분홍 = 나가자마자 막히는
후보, 주황 = 문짝 없는 개방 출입구, 파랑 = 실내 문, 노란 별 = 기존 이미지
기반 지도가 '외부' 라고 적어 둔 문(판정에는 쓰지 않는다).
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import LineString
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent))

import exterior_doors as X  # noqa: E402


def draw(floor, vectors, plan):
    data = plan["floors"][floor]
    origin = data["origin_dwg_mm"]
    segments = X.floor_segments(vectors, origin)
    lines = [LineString([a, b]) for a, b in segments]
    index = STRtree(lines)
    doors = X.floor_doors(vectors, origin)
    for door in doors:
        door["axis"], door["jamb_gap_m"] = X.opening_axis(door, index, lines)

    occupied = X.occupied_rings(data)
    raster = X.Raster(X.WIDE)
    envelope, outdoors, courtyard, walls = X.build_envelope(raster, segments, occupied)
    for door in doors:
        door["placement"], door["outside_point"] = X.classify(
            raster, door, envelope, outdoors, courtyard, walls)
    gaps = X.find_open_gaps(raster, envelope, walls, doors)

    canvas = np.zeros((raster.h, raster.w, 3), np.uint8)
    canvas[envelope > 0] = (36, 62, 36)
    canvas[courtyard > 0] = (70, 55, 25)
    canvas[walls > 0] = (215, 215, 215)
    for door in doors:
        point = raster.to_px(door["threshold"])
        if door["placement"] == "interior":
            cv2.circle(canvas, point, 4, (255, 170, 60), -1)
            continue
        # 트인 곳은 굵은 빨강, 나가자마자 막히는 후보는 가는 분홍으로 그린다.
        wide = door["certainty"] == "high"
        colour = (60, 60, 255) if wide else (140, 130, 235)
        cv2.circle(canvas, point, 13 if wide else 9, colour, 3 if wide else 2)
        cv2.putText(canvas, f'{door["handle"][-4:]} {door["outside_run_m"]}m',
                    (point[0] + 16, point[1] + 6), cv2.FONT_HERSHEY_SIMPLEX,
                    0.7 if wide else 0.55, colour, 2)
    for i, gap in enumerate(gaps, start=1):
        point = raster.to_px(gap["point"])
        cv2.drawMarker(canvas, point, (0, 140, 255), cv2.MARKER_TILTED_CROSS, 30, 3)
        cv2.putText(canvas, f'G{i} {gap["width_m"]}m', (point[0] + 16, point[1] - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 140, 255), 2)
    for point in X.legacy_exterior(floor, data["report"].get("alignment")):
        cv2.drawMarker(canvas, raster.to_px(point), (120, 255, 120), cv2.MARKER_STAR, 34, 2)

    box = np.array([raster.to_px((X.PLAN["x"][0], X.PLAN["y"][1])),
                    raster.to_px((X.PLAN["x"][1], X.PLAN["y"][0]))])
    crop = canvas[box[0][1]:box[1][1], box[0][0]:box[1][0]]
    cv2.putText(crop, floor, (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (0, 220, 255), 3)
    path = X.OUT / f"entrance-review-{floor}.png"
    # 경로에 한글이 있으면 cv2.imwrite 는 조용히 실패한다. 직접 써야 한다.
    path.write_bytes(cv2.imencode(".png", crop)[1].tobytes())
    return path, sum(d["placement"] != "interior" for d in doors), len(gaps)


def main() -> int:
    vectors = X.read(X.BASE / "source/vectors.json")
    plan = X.read(X.OUT / "map.json")
    for floor in X.FLOORS:
        path, exterior, gaps = draw(floor, vectors, plan)
        print(f"{floor}: 외부문 {exterior}개 · 개방 출입구 {gaps}개 -> {path.name}", flush=True)
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
