import sys
import os
import json
import traceback

sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
sys.stderr.reconfigure(encoding='utf-8', errors='backslashreplace')

BASE_DIR = r"c:\Users\dryou\OneDrive\바탕 화면\통합 GUMAP"
os.chdir(BASE_DIR)
sys.path.insert(0, BASE_DIR)

print("🔍 1. server.py 모듈 임포트 테스트 중...")
try:
    import server
    print("✅ server.py 임포트 성공!")
    print(f"📌 등록된 라우트 개수: {len(server.app.routes)}개")
    for r in server.app.routes:
        methods = getattr(r, 'methods', None)
        path = getattr(r, 'path', None)
        name = getattr(r, 'name', None)
        print(f"   - [{','.join(methods) if methods else 'ALL'}] {path} ({name})")
except Exception as e:
    print(f"❌ server.py 임포트 에러 발생: {e}")
    traceback.print_exc()

print("\n🔍 2. FastAPI TestClient를 이용한 핵심 엔드포인트 모의 호출 검증 중...")
try:
    from fastapi.testclient import TestClient
    client = TestClient(server.app)
    
    # Test Root / Health
    endpoints_to_test = [
        ("/", "GET"),
        ("/health", "GET"),
        ("/api/env-config", "GET"),
        ("/api/bus-stops", "GET"),
        ("/api/outdoor-places", "GET"),
        ("/api/cctv", "GET"),
        ("/api/events", "GET"),
        ("/api/rooms", "GET"),
        ("/api/search", "GET"),
        ("/api/bus-realtime", "GET"),
    ]

    for ep, method in endpoints_to_test:
        try:
            if method == "GET":
                resp = client.get(ep)
            else:
                resp = client.post(ep)
            print(f"   [{resp.status_code}] {method} {ep} -> 결과: {resp.text[:120]}...")
        except Exception as err:
            print(f"   ❌ 호출 오류 {method} {ep}: {err}")

except Exception as e:
    print(f"⚠️ TestClient 실행 중 오류: {e}")
    traceback.print_exc()

print("\n🔍 3. .env 환경변수 점검...")
try:
    from dotenv import dotenv_values
    env_vars = dotenv_values(os.path.join(BASE_DIR, ".env"))
    print(f"✅ .env 파일 로드 성공 (키 개수: {len(env_vars)})")
    for k, v in env_vars.items():
        masked = v[:4] + "****" if v and len(v) > 4 else ("(비어있음)" if not v else "****")
        print(f"   - {k}: {masked}")
except Exception as e:
    print(f"⚠️ .env 점검 오류: {e}")
