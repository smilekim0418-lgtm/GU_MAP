"""
groute_collector.py
구글 클라우드 VM 또는 백그라운드 환경에서 24시간 연속 가동되며
실시간 버스 위치, 도로 통행 속도, 신호등 및 날씨 API 데이터를 수집하여 SQLite 시계열 DB에 적재합니다.
일일 공공 API 트래픽 한도(1만회)를 넘지 않도록 스태거(Staggered) 방식으로 지연 호출 주기를 엄격히 제어합니다.
"""
import os
import time
import sqlite3
import httpx
import asyncio
import random
import math
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

# .env 환경 변수 로드
load_dotenv()

TAGO_KEY = os.getenv("PUBLIC_DATA_API_KEY", os.getenv("TAGO_API_KEY", ""))
TMAP_KEY = os.getenv("TMAP_API_KEY", "")
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "gumi_realtime_traffic.db")
RESTORED_CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "gumi_restored_bus_ridership.csv")

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

# ── 글로벌 데이터 적재 ──
gumi_stops_coords = {}
gumi_ridership_data = {}

def load_static_restored_data():
    """복원된 승하차 CSV에서 정류장 좌표 및 평균 승하차 인원을 사전 캐싱합니다."""
    global gumi_stops_coords, gumi_ridership_data
    if not os.path.exists(RESTORED_CSV_PATH):
        print(f"[-] Warn: Restored ridership CSV not found at {RESTORED_CSV_PATH}")
        return
        
    try:
        df = pd.read_csv(RESTORED_CSV_PATH)
        for _, row in df.iterrows():
            st_id = str(row['정류장ID'])
            lat = float(row['lat']) if not pd.isna(row.get('lat')) else 36.12
            lng = float(row['lng']) if not pd.isna(row.get('lng')) else 128.34
            
            gumi_stops_coords[st_id] = (lat, lng)
            gumi_ridership_data[st_id] = {
                "boarding": float(row.get("승차인원수", 0)),
                "alighting": float(row.get("복원하차인원수", 0))
            }
        print(f"[+] Loaded {len(gumi_stops_coords)} stop coordinates for speed inference.")
    except Exception as e:
        print(f"[-] Error loading restored static data in collector: {e}")

def haversine_m(lat1, lon1, lat2, lon2):
    """두 위경도 간의 직선거리를 미터(m) 단위로 계산합니다."""
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2.0)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0-a))
    return R * c

def init_db():
    """
    SQLite 데이터베이스 및 시계열 수집 테이블 구조 초기화
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. 실시간 버스 통행 속도 이력 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bus_traffic_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            route_id TEXT,
            node_id TEXT,
            node_order INTEGER,
            arrtime INTEGER,
            arrprevstationcnt INTEGER
        )
    """)
    
    # 2. 실시간 도로 링크 통행 속도 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS road_link_speeds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            link_id TEXT,
            speed INTEGER,
            travel_time INTEGER
        )
    """)
    
    # 3. 실시간 신호등 상태 정보 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS traffic_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            signal_group_id TEXT,
            signal_state TEXT, -- 'RED', 'GREEN', 'YELLOW'
            time_remaining INTEGER
        )
    """)
    
    # 4. 실시간 기상 상태 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS weather_conditions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            temperature REAL,
            precipitation REAL, -- 강수량
            snowfall REAL,      -- 적설량
            sky_condition TEXT  -- 'SUNNY', 'CLOUDY', 'RAINY', 'SNOWY'
        )
    """)
    
    conn.commit()
    conn.close()
    print(f"[*] SQLite Database initialized at: {DB_PATH}")

async def collect_bus_data(client: httpx.AsyncClient):
    """
    구미시 주요 정류소들의 실시간 도착 예정 데이터를 수집하여 기록합니다. (120초 주기 호출)
    """
    if not TAGO_KEY:
        return
        
    test_node_ids = ["GMB82", "GMB104", "GMB201", "GMB208"]
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    for node_id in test_node_ids:
        url = f"https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?serviceKey={TAGO_KEY}&cityCode=37050&nodeId={node_id}&_type=json"
        try:
            response = await client.get(url, timeout=5.0)
            if response.status_code == 200:
                data = response.json()
                items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
                if isinstance(items, dict):
                    items = [items]
                    
                for item in items:
                    route_id = str(item.get("routeid", ""))
                    node_order = int(item.get("arrprevstationcnt", 0))
                    arrtime = int(item.get("arrtime", 0))
                    
                    cursor.execute("""
                        INSERT INTO bus_traffic_history (timestamp, route_id, node_id, node_order, arrtime, arrprevstationcnt)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (timestamp, route_id, node_id, node_order, arrtime, node_order))
            await asyncio.sleep(0.3)
        except Exception:
            pass
            
    conn.commit()
    conn.close()

async def collect_bus_locations(client: httpx.AsyncClient):
    """
    주요 노선의 실시간 버스 위치를 조회하여 이력 DB에 적재합니다. (180초 주기 호출로 한도 보호)
    """
    if not TAGO_KEY:
        return
        
    # 일일 호출량 최적화를 위해 상위 4개 핵심 노선으로 축소 및 주기 연장
    major_routes = ["GMB19610", "GMB34030", "GMB11100", "GMB10000"]
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    for route_id in major_routes:
        url = f"https://apis.data.go.kr/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList?serviceKey={TAGO_KEY}&cityCode=37050&routeId={route_id}&_type=json"
        try:
            response = await client.get(url, timeout=5.0)
            if response.status_code == 200:
                data = response.json()
                items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
                if isinstance(items, dict):
                    items = [items]
                    
                for item in items:
                    node_id = str(item.get("nodeid", ""))
                    node_ord = int(item.get("nodeord", 0))
                    cursor.execute("""
                        INSERT INTO bus_traffic_history (timestamp, route_id, node_id, node_order, arrtime, arrprevstationcnt)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (timestamp, route_id, node_id, node_ord, 0, 0))
            await asyncio.sleep(0.3)
        except Exception:
            pass
            
    conn.commit()
    conn.close()

async def collect_traffic_speeds(client: httpx.AsyncClient):
    """
    T-map Link API를 이용해 도로별 실시간 속도를 샘플링하여 수집합니다. (300초 주기)
    """
    if not TMAP_KEY:
        return
        
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    url = f"https://apis.openapi.sk.com/tmap/traffic?version=1&centerLat=36.12879&centerLon=128.32349&radius=2&reqCoordType=WGS84GEO&resCoordType=WGS84GEO"
    headers = {"appKey": TMAP_KEY}
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        response = await client.get(url, headers=headers, timeout=8.0)
        if response.status_code == 200:
            data = response.json()
            features = data.get("features", [])
            for f in features:
                props = f.get("properties", {})
                link_id = str(props.get("linkId", ""))
                speed = int(props.get("congestionIdx", 30))
                travel_time = int(props.get("congestion", 0))
                
                if link_id:
                    cursor.execute("""
                        INSERT INTO road_link_speeds (timestamp, link_id, speed, travel_time)
                        VALUES (?, ?, ?, ?)
                    """, (timestamp, link_id, speed, travel_time))
    except Exception:
        pass
        
    conn.commit()
    conn.close()

async def collect_traffic_signals(client: httpx.AsyncClient):
    """
    실시간 교통안전 신호등 정보를 수집합니다. (60초 주기, 오프라인 시뮬레이션 기반)
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. API 호출 시도 (시범)
    if TAGO_KEY:
        url = f"http://apis.data.go.kr/1741000/TfcSftySgnal/getTfcSftySgnalList?serviceKey={TAGO_KEY}&_type=json&numOfRows=1"
        try:
            await client.get(url, timeout=3.0)
        except Exception:
            pass
            
    # 2. 구미시 주요 교차로 신호등 시뮬레이션 폴백
    test_intersections = ["SG_GUMI_STATION", "SG_INDONG_SQUARE", "SG_CITY_HALL", "SG_GUMI_IC"]
    for sg_id in test_intersections:
        sec = int(time.time()) % 90
        if sec < 40:
            state, remaining = "GREEN", 40 - sec
        elif sec < 45:
            state, remaining = "YELLOW", 45 - sec
        else:
            state, remaining = "RED", 90 - sec
            
        cursor.execute("""
            INSERT INTO traffic_signals (timestamp, signal_group_id, signal_state, time_remaining)
            VALUES (?, ?, ?, ?)
        """, (timestamp, sg_id, state, remaining))
        
    conn.commit()
    conn.close()

async def collect_weather_conditions(client: httpx.AsyncClient):
    """
    기상청 초단기실황 API를 이용해 구미시 날씨를 수집합니다. (300초 주기)
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    temperature = 22.0
    precipitation = 0.0
    snowfall = 0.0
    sky = "SUNNY"
    
    if TAGO_KEY:
        base_date = datetime.now().strftime("%Y%m%d")
        base_time = datetime.now().strftime("%H00")
        url = f"http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey={TAGO_KEY}&pageNo=1&numOfRows=10&dataType=JSON&base_date={base_date}&base_time={base_time}&nx=80&ny=95"
        try:
            response = await client.get(url, timeout=5.0)
            if response.status_code == 200:
                data = response.json()
                items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
                for item in items:
                    category = item.get("category", "")
                    value = float(item.get("obsrValue", 0))
                    if category == "T1H":
                        temperature = value
                    elif category == "RN1":
                        precipitation = value
        except Exception:
            pass
            
    if precipitation > 0.0:
        sky = "RAINY"
        
    cursor.execute("""
        INSERT INTO weather_conditions (timestamp, temperature, precipitation, snowfall, sky_condition)
        VALUES (?, ?, ?, ?, ?)
    """, (timestamp, temperature, precipitation, snowfall, sky))
    
    conn.commit()
    conn.close()

def infer_highway_speeds():
    """
    실시간 버스 도착 정보 이력을 분석하여 교통속도가 누락된 외곽 4차로 지방도 속도를 역산합니다.
    """
    if not gumi_stops_coords:
        return
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT route_id, node_id, timestamp, arrtime 
        FROM bus_traffic_history 
        WHERE timestamp >= datetime('now', '-15 minutes')
        ORDER BY route_id, timestamp DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    
    if len(rows) < 2:
        return
        
    bus_trips = {}
    for route_id, node_id, ts_str, arrtime in rows:
        try:
            ts_secs = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S").timestamp()
        except:
            continue
        clean_node = "".join([c for c in node_id if c.isdigit()])
        if not clean_node:
            continue
            
        if route_id not in bus_trips:
            bus_trips[route_id] = []
        bus_trips[route_id].append((clean_node, ts_secs, arrtime))
        
    inferred_records = []
    
    for route_id, trips in bus_trips.items():
        if len(trips) < 2:
            continue
            
        for i in range(len(trips) - 1):
            node_a, ts_a, arr_a = trips[i+1]
            node_b, ts_b, arr_b = trips[i]
            
            elapsed = ts_b - ts_a
            if elapsed <= 10.0 or elapsed > 900.0:
                continue
                
            if node_a not in gumi_stops_coords or node_b not in gumi_stops_coords:
                continue
                
            lat_a, lng_a = gumi_stops_coords[node_a]
            lat_b, lng_b = gumi_stops_coords[node_b]
            
            dist_m = haversine_m(lat_a, lng_a, lat_b, lng_b) * 1.25
            if dist_m < 300 or dist_m > 4000:
                continue
                
            boarding = 0.0
            alighting = 0.0
            if node_a in gumi_ridership_data:
                boarding = gumi_ridership_data[node_a]["boarding"]
                alighting = gumi_ridership_data[node_a]["alighting"]
                
            dwell_sec = 2.0 + (boarding + alighting) * 1.5
            net_time = max(10.0, elapsed - dwell_sec)
            
            speed_kph = (dist_m / net_time) * 3.6
            speed_kph = min(70.0, max(8.0, speed_kph))
            
            link_id = f"LINK_{node_a}_{node_b}"
            inferred_records.append((datetime.now().strftime("%Y-%m-%d %H:%M:%S"), link_id, int(speed_kph), int(net_time)))
            
    if inferred_records:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.executemany("""
            INSERT INTO road_link_speeds (timestamp, link_id, speed, travel_time)
            VALUES (?, ?, ?, ?)
        """, inferred_records)
        conn.commit()
        conn.close()
        print(f"[*] Inferred {len(inferred_records)} local highway speeds from bus trajectories.")

async def main():
    print("=" * 60)
    print("[*] G-Route AI 24시간 실시간 트래픽 및 인프라 데이터 수집기 가동 시작 (V2.3)")
    print(f"    - 수집 주기: 신호(60초), 버스도착(120초), 버스위치(180초), 도로/날씨(300초)")
    print("=" * 60)
    
    init_db()
    load_static_restored_data()
    
    async with httpx.AsyncClient(verify=False) as client:
        loop_cnt = 0
        while True:
            # 60초 주기: 신호등 상태 수집
            await collect_traffic_signals(client)
            
            # 120초 주기: 버스 간이 도착이력 수집
            if loop_cnt % 2 == 0:
                await collect_bus_data(client)
                
            # 180초 주기: 버스 실시간 GPS 추적 및 이력화 (한도 보호용 최적화)
            if loop_cnt % 3 == 0:
                await collect_bus_locations(client)
                
            # 지방도 속도 역산은 매 신호/버스 입력 시마다 실행
            infer_highway_speeds()
            
            # 300초(5분) 주기: T-map 도로 속도 및 날씨 수집
            if loop_cnt % 5 == 0:
                await collect_traffic_speeds(client)
                await collect_weather_conditions(client)
                
            loop_cnt += 1
            await asyncio.sleep(60)

if __name__ == "__main__":
    asyncio.run(main())
