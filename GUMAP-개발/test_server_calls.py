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
print("🚀 [서버 API 엔드포인트 실제 호출 및 응답 검증]")
print("="*70)

test_cases = [
    ("GET", "/", None, {}),
    ("GET", "/test_map.html", None, {}),
    ("GET", "/juso", {"keyword": "구미시청"}, {}),
    ("GET", "/weather-info", {}, {}),
    ("GET", "/dust-info", {}, {}),
    ("GET", "/shared-mobility", {}, {}),
    ("GET", "/gumi-data", {"type": "tour"}, {}),
    ("POST", "/groute-api", None, {
        "start": {"lat": 36.1460, "lng": 128.3920},
        "end": {"lat": 36.1283, "lng": 128.3308},
        "profile": "car"
    }),
    ("POST", "/groute-benchmark", None, {
        "start": {"lat": 36.1460, "lng": 128.3920},
        "end": {"lat": 36.1283, "lng": 128.3308}
    }),
    ("GET", "/opinet-around", {"x": "128.3920", "y": "36.1460", "radius": "3000"}, {}),
    ("GET", "/its-cctv", {"minX": "128.30", "maxX": "128.45", "minY": "36.10", "maxY": "36.20"}, {}),
    ("GET", "/its-event", {"minX": "128.30", "maxX": "128.45", "minY": "36.10", "maxY": "36.20"}, {}),
    ("GET", "/tmap-pois", {"searchKeyword": "구미역"}, {}),
]

for method, path, params, body in test_cases:
    try:
        if method == "GET":
            resp = client.get(path, params=params)
        elif method == "POST":
            resp = client.post(path, json=body)
        
        status = resp.status_code
        status_sym = "✅" if 200 <= status < 400 else "⚠️"
        content_preview = resp.text[:100].replace("\n", " ")
        print(f"{status_sym} [{status}] {method} {path} (params={params or '-'}) -> {content_preview}...")
    except Exception as e:
        print(f"❌ [에러] {method} {path}: {e}")

print("\n" + "="*70)
print("🔍 [프론트엔드 API 클라이언트 설정(GUMAP-설정.js) 동기화 검증]")
print("="*70)

# Check GUMAP-설정.js
config_js_path = os.path.join(BASE_DIR, "GUMAP-프론트", "js", "GUMAP-설정.js")
if os.path.exists(config_js_path):
    with open(config_js_path, "r", encoding="utf-8") as f:
        cfg = f.read()
    print("✅ GUMAP-설정.js 파일 로드 성공")
    if "PROXY_URL" in cfg:
        print("   - PROXY_URL 설정 항목 존재")
else:
    print("❌ GUMAP-설정.js 파일 없음")
