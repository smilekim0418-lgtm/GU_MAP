"""
02_add_congestion_weights.py
시간대별 혼잡도 가중치를 도로 그래프에 적용하여 딥러닝 학습용 가중치 그래프를 구축합니다.
"""
import pickle
import json
import os

def main():
    base_dir = os.path.dirname(__file__)
    pkl_in = os.path.join(base_dir, "data", "gumi_road_graph.pkl")
    pkl_out = os.path.join(base_dir, "data", "gumi_road_graph_weighted.pkl")
    profile_out = os.path.join(base_dir, "data", "congestion_profile.json")

    if not os.path.exists(pkl_in):
        print(f"[-] 원본 그래프 파일이 없습니다. 01_build_graph.py를 먼저 실행하세요: {pkl_in}")
        return

    print("[*] 원본 도로 그래프 파일 로딩 중...")
    with open(pkl_in, "rb") as f:
        G = pickle.load(f)

    # ── 1. 시간대별 공통 혼잡 계수 정의 (24시간) ──
    # 1.0 = 기본 속도, 2.0 = 2배 지연, 3.0 = 극심한 차량 정체
    HOURLY_CONGESTION = {
        0: 0.9, 1: 0.9, 2: 0.9, 3: 0.9, 4: 0.9, 5: 0.95,
        6: 1.2,   # 교대근무 및 출근 시작
        7: 1.8,   # 1차 출근 피크
        8: 2.2,   # 8시 등교 및 출근 최고 혼잡 시간대
        9: 1.5,
        10: 1.1, 11: 1.0, 12: 1.2,  # 점심 유동인구
        13: 1.1, 14: 1.0, 15: 1.0, 16: 1.1,
        17: 1.8,  # 퇴근 차량 유입
        18: 2.4,  # 공단 1차 퇴근 최고 혼잡 시간대
        19: 1.9,  # 퇴근 완화
        20: 1.3, 21: 1.1, 22: 1.0, 23: 0.95
    }

    # ── 2. 구미시 주요 병목 핫스팟 가중치 가산점 정의 ──
    # 해당 키워드를 포함하는 도로명인 경우 기본 혼잡도에 곱해지는 누적 패널티
    CONGESTION_HOTSPOTS = {
        "인동네거리": 1.6,
        "인동광장": 1.5,
        "공단로": 1.4,
        "금오산사거리": 1.35,
        "구미역": 1.25,
        "옥계": 1.3,
        "신평": 1.2
    }

    print("[*] 엣지별 시간대별 실시간 소통 가중치 매트릭스 계산 중...")
    
    # 그래프 내 모든 도로(Edge)를 순회하며 가중치 산정
    for u, v, k, data in G.edges(keys=True, data=True):
        base_time = data.get("travel_time", 60.0) # 기본 소요시간 (초)
        road_name = data.get("name", "")
        
        # 도로명 리스트인 경우 단일 스트링으로 병합
        if isinstance(road_name, list):
            road_name = " ".join(road_name)
            
        # 핫스팟 패널티 가중치 추출
        spot_multiplier = 1.0
        for keyword, mult in CONGESTION_HOTSPOTS.items():
            if keyword in road_name:
                spot_multiplier = max(spot_multiplier, mult)

        # 24시간 전체에 대해 소요시간(초) 산출 및 매핑
        weighted_times = {}
        for hour, factor in HOURLY_CONGESTION.items():
            # 최종 통행시간 = 기준 소요시간 * 시간대 혼잡율 * 도로별 정체 가중치
            final_time = round(base_time * factor * spot_multiplier, 1)
            weighted_times[hour] = final_time
            
        # 에지 속성에 24시간 실시간 시간표 저장
        data["travel_time_by_hour"] = weighted_times

    # ── 3. 가중치 그래프 및 프로필 저장 ──
    with open(pkl_out, "wb") as f:
        pickle.dump(G, f)
        
    with open(profile_out, "w", encoding="utf-8") as f:
        # JSON 형식으로도 통계 프로필 저장 (디버깅용)
        json_data = {
            "hourly_factors": HOURLY_CONGESTION,
            "hotspot_multipliers": CONGESTION_HOTSPOTS
        }
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    print("[+] 시간대별 교통 가중치 부여 완료!")
    print(f"    - 저장 대상: {pkl_out}")
    print(f"    - 프로필 정보: {profile_out}")

if __name__ == "__main__":
    main()
