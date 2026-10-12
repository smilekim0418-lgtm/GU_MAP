"""구미시 정류장별 승하차 CSV → 연구 탭이 읽는 JSON.

연구 탭의 히트맵·수요 리포트·승하차 흐름·노선 점수판은 원래 손으로 적은 숫자와
난수로 그려졌다. 이 스크립트가 공공데이터포털 원자료를 하루 평균으로 줄여
GUMAP-데이터/data/gumi_bus_ridership.json 을 만든다.

    python GUMAP-개발/build_ridership.py

원자료: 경상북도 구미시_버스정류장별 승하차인원정보 (사용일자·시내버스번호·정류장·
좌표·승차·하차, 하루 단위). 이 파일은 '위도' 칸에 경도가, '경도' 칸에 위도가 들어
있어서 값의 범위로 판단한다.
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "GUMAP-데이터" / "data(데이터 파일)" / "reference(전국 참고 데이터)" / \
    "경상북도 구미시_버스정류장별 승하차인원정보_20250831.csv"
OUTPUT = ROOT / "GUMAP-데이터" / "data" / "gumi_bus_ridership.json"


def main():
    df = pd.read_csv(SOURCE, encoding="cp949", dtype={"시내버스번호": str, "정류장ID": str})
    a, b = df["위도"], df["경도"]
    lat, lng = (b, a) if a.mean() > 90 else (a, b)
    df = df.assign(lat=lat, lng=lng)
    days = df["사용일자"].nunique()

    stops = []
    no_coords = 0
    for stop_id, group in df.groupby("정류장ID"):
        first = group.iloc[0]
        lat, lng = group["lat"].median(), group["lng"].median()
        if pd.isna(lat) or pd.isna(lng):
            no_coords += 1      # 좌표가 빈 정류장은 지도에 놓을 수 없다
            continue
        stops.append([
            stop_id,
            str(first["정류장명"]),
            round(float(lat), 6),
            round(float(lng), 6),
            round(group["승차인원수"].sum() / days, 1),
            round(group["하차인원수"].sum() / days, 1),
        ])
    stops.sort(key=lambda s: s[4] + s[5], reverse=True)

    # 노선은 '11', '11-1' 처럼 지선을 '-' 로 나눈다. 점수판은 기본 번호로 묶는다.
    df["route"] = df["시내버스번호"].str.split("-").str[0]
    routes = {}
    for route, group in df.groupby("route"):
        routes[route] = {
            "boardings_per_day": round(group["승차인원수"].sum() / days),
            "stops": int(group["정류장ID"].nunique()),
            "variants": sorted(group["시내버스번호"].unique().tolist()),
        }

    data = {
        "source": "경상북도 구미시_버스정류장별 승하차인원정보 (공공데이터포털)",
        "period": {"from": str(df["사용일자"].min()), "to": str(df["사용일자"].max()), "days": int(days)},
        "units": "하루 평균 인원(명)",
        "stop_fields": ["id", "name", "lat", "lng", "board_per_day", "alight_per_day"],
        "stops": stops,
        "routes": routes,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
                      encoding="utf-8")
    print(f"{OUTPUT.relative_to(ROOT)}: 정류장 {len(stops)}곳(좌표 없는 {no_coords}곳 제외), "
          f"노선 {len(routes)}개, {days}일")


if __name__ == "__main__":
    main()
