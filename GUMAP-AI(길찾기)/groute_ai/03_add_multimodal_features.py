"""
03_add_multimodal_features.py
기존 구미시 도로망 그래프에 경사도(Slope), 자전거 도로, 보도 인프라 피처를 결합하여
멀티모달(보행/자전거/PM) AI 훈련에 적합한 데이터셋으로 고도화합니다.
"""
import pickle
import os
import math
import numpy as np

def main():
    print("[*] G-Route AI: 멀티모달 피처 빌더 가동")
    print("=" * 60)

    base_dir = os.path.dirname(__file__)
    input_path = os.path.join(base_dir, "data", "gumi_road_graph_weighted.pkl")
    output_path = os.path.join(base_dir, "data", "gumi_road_graph_multimodal.pkl")

    if not os.path.exists(input_path):
        print(f"[-] 원본 그래프 파일이 존재하지 않습니다: {input_path}")
        return

    with open(input_path, "rb") as f:
        G = pickle.load(f)

    print(f"[*] 원본 그래프 로드 완료: 노드 {len(G.nodes)}개, 엣지 {len(G.edges)}개")

    # ── 1. 노드 경사도(Elevation / Slope) 지형 시뮬레이션 ──
    # 실제 수치지형도(DEM) 데이터 매핑을 모사하여 구미시 낙동강변(평지) 및 금오산/금오공대 언덕 고도 수식 설계
    # 구미역 근처(평지) vs 금오공대(산지) 좌표 가중치 부여
    print("[*] 구미시 지형 데이터(Elevation/Slope) 시뮬레이션 매핑 중...")
    
    # 금오산 중심 기준 고도 감쇄 모델 (간이 DEM)
    center_lat, center_lng = 36.1045, 128.3188 # 금오산 부근 산지 중심
    
    for node, data in G.nodes(data=True):
        lat = data.get("y", 36.119485)
        lng = data.get("x", 128.344573)
        
        # 중심점으로부터의 거리 (도 단위 계산)
        dist = math.sqrt((lat - center_lat)**2 + (lng - center_lng)**2)
        # 거리가 가까울수록 산지이므로 고도가 높음 (최소 50m ~ 최대 380m)
        elevation = 50.0 + max(0.0, 330.0 * (1.0 - (dist / 0.15)))
        
        data["elevation"] = round(elevation, 1)

    # ── 2. 엣지 경사도 및 자전거/도보 전용 도로 인프라 데이터 매핑 ──
    print("[*] 자전거/도보 인프라 전용 도로 매핑 및 엣지 경사도 계산 중...")
    cycleway_count = 0
    sidewalk_count = 0
    
    for u, v, k, data in G.edges(keys=True, data=True):
        # 2-1. 노드 간 고도 차이를 기반으로 경사 백분율(Slope Gradient) 산출
        elev_u = G.nodes[u].get("elevation", 50.0)
        elev_v = G.nodes[v].get("elevation", 50.0)
        
        # 도로 거리 계산 (m)
        length = data.get("length", 100.0)
        # 경사도 (%) = (고도차 / 거리) * 100
        slope_pct = (abs(elev_u - elev_v) / max(10.0, length)) * 100.0
        # 최대 경사 25% 캡핑
        data["slope_gradient"] = round(min(25.0, slope_pct), 2)
        
        # 2-2. OSM 도로 등급(highway) 태그를 분석하여 인도(Sidewalk) 및 자전거도로 유무 마킹
        highway = data.get("highway", "residential")
        
        # 자전거 도로 여부 매핑 (자전거 전용도로, 보행자/자전거 겸용 도로 등)
        # 구미 낙동강 자전거길 및 주요 외곽 국도변 인도 자전거 우선 도로 시뮬레이션
        is_cycleway = False
        if highway in ["cycleway", "living_street", "service"]:
            is_cycleway = True
        elif highway == "track" or ("cycleway" in data):
            is_cycleway = True
        # 임의의 자전거 이용 활성화 도로 확률 매핑
        elif np.random.rand() < 0.12: # 구미 시내 주요 거점 자전거 전용/우선 도로율 약 12%
            is_cycleway = True
            
        # 보행자 보도(Sidewalk) 여부 매핑
        is_sidewalk = True
        if highway in ["motorway", "motorway_link", "trunk", "trunk_link"]:
            is_sidewalk = False # 자동차 전용 도로는 보행 불가
        elif np.random.rand() < 0.05: # 보도 단절 임의 구현 (정밀 안전 탐색용)
            is_sidewalk = False
            
        data["is_cycleway"] = is_cycleway
        data["is_sidewalk"] = is_sidewalk
        
        if is_cycleway: cycleway_count += 1
        if is_sidewalk: sidewalk_count += 1

    # ── 3. 멀티모달 도로망 그래프 파일 저장 ──
    with open(output_path, "wb") as f:
        pickle.dump(G, f)

    print("=" * 60)
    print(f"[+] G-Route AI: 멀티모달 전처리 완료! -> {output_path}")
    print(f"    - 자전거 전용/겸용 도로 엣지 수: {cycleway_count}개")
    print(f"    - 보행 보도 보유 엣지 수: {sidewalk_count}개")
    print("=" * 60)

if __name__ == "__main__":
    main()
