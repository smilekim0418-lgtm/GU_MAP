import sys
import os
import json
import traceback

sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
sys.stderr.reconfigure(encoding='utf-8', errors='backslashreplace')

BASE_DIR = r"c:\Users\dryou\OneDrive\바탕 화면\통합 GUMAP"
os.chdir(BASE_DIR)
sys.path.insert(0, BASE_DIR)

import server
from fastapi.testclient import TestClient

client = TestClient(server.app)

print("="*70)
print("🚀 [G-Route AI 길찾기 & 벤치마크 정밀 호출 검증]")
print("="*70)

# Test 1: groute-api with correct payload
payload1 = {
    "start_lat": 36.1460,
    "start_lng": 128.3920,
    "end_lat": 36.1283,
    "end_lng": 128.3308,
    "mode": "car",
    "profile": "fast"
}
resp1 = client.post("/groute-api", json=payload1)
print(f"1. /groute-api (car/fast) -> [{resp1.status_code}]")
if resp1.status_code == 200:
    data = resp1.json()
    print(f"   - Total Distance: {data.get('total_distance', 0):.2f}m")
    print(f"   - Total Time: {data.get('total_time_sec', 0)/60:.1f}min")
    print(f"   - Coordinates count: {len(data.get('coordinates', []))}")
else:
    print(f"   - Response: {resp1.text}")

# Test 2: groute-benchmark
payload2 = {
    "start_lat": 36.1460,
    "start_lng": 128.3920,
    "end_lat": 36.1283,
    "end_lng": 128.3308
}
resp2 = client.post("/groute-benchmark", json=payload2)
print(f"\n2. /groute-benchmark -> [{resp2.status_code}]")
if resp2.status_code == 200:
    data = resp2.json()
    print(f"   - Keys: {list(data.keys())}")
else:
    print(f"   - Response: {resp2.text}")

# Test 3: Other transport modes (walk, bicycle)
for m in ["walk", "bicycle", "pm"]:
    p = {
        "start_lat": 36.1460,
        "start_lng": 128.3920,
        "end_lat": 36.1283,
        "end_lng": 128.3308,
        "mode": m,
        "profile": "fast"
    }
    r = client.post("/groute-api", json=p)
    print(f"3. /groute-api (mode={m}) -> [{r.status_code}] Distance: {r.json().get('total_distance', 0):.1f}m, Time: {r.json().get('total_time_sec', 0)/60:.1f}min")
