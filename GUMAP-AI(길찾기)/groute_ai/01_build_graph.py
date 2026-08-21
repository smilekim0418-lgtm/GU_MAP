"""
01_build_graph.py
구미시 전체 도로망을 OSM에서 다운로드하여 NetworkX 그래프로 변환 후 저장합니다.
"""
import osmnx as ox
import networkx as nx
import pickle
import os

def main():
    print("[1/4] 구미시 도로 네트워크 다운로드 시작 (오픈스트리트맵 연동)...")
    # 구미시 전체 범위 내 자동차 도로망(drive)만 다운로드 및 교차로 기준 단순화 적용
    try:
        G = ox.graph_from_place(
            "구미시, 경상북도, 대한민국",
            network_type="drive",
            simplify=True
        )
    except Exception as e:
        print(f"[-] 다운로드 실패: {e}")
        print("[*] 대체 방법으로 구미시 중심부 반경 12km 기준으로 네트워크를 수집합니다...")
        # 구미시청 기준 반경 12km 수집 (네트워크 일시 지연 대비)
        G = ox.graph_from_point(
            (36.119485, 128.344573),
            dist=12000,
            network_type="drive",
            simplify=True
        )

    print(f"[2/4] 그래프 구축 성공:")
    print(f"      - 노드(교차로) 수: {G.number_of_nodes():,}")
    print(f"      - 엣지(도로구간) 수: {G.number_of_edges():,}")

    # ── 엣지 속성 추가: 속도 및 이동 시간(초) 계산 ──
    print("[3/4] 도로별 제한속도(maxspeed) 분석 및 통행시간(travel_time) 산출...")
    G = ox.routing.add_edge_speeds(G)         # 도로유형별 제한속도 자동 부여
    G = ox.routing.add_edge_travel_times(G)   # 거리 / 속도 = 기준 통행 시간(초)

    # ── 데이터 디렉토리 생성 및 저장 ──
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(data_dir, exist_ok=True)

    # 표준 GraphML 형식 저장 (다른 지리 도구 및 시각화 소프트웨어 호환용)
    graphml_path = os.path.join(data_dir, "gumi_road_network.graphml")
    ox.save_graphml(G, filepath=graphml_path)

    # 파이썬 피클 포맷 저장 (초고속 바이너리 로드용)
    pkl_path = os.path.join(data_dir, "gumi_road_graph.pkl")
    with open(pkl_path, "wb") as f:
        pickle.dump(G, f)

    print(f"[4/4] 데이터 저장 완료:")
    print(f"      - {graphml_path} ({os.path.getsize(graphml_path)/1024:.1f} KB)")
    print(f"      - {pkl_path} ({os.path.getsize(pkl_path)/1024:.1f} KB)")

if __name__ == "__main__":
    main()
