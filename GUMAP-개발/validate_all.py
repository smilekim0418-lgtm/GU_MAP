import os
import sys
import re
import subprocess

sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
sys.stderr.reconfigure(encoding='utf-8', errors='backslashreplace')

BASE_DIR = r"c:\Users\dryou\OneDrive\바탕 화면\통합 GUMAP"
os.chdir(BASE_DIR)

print("="*60, flush=True)
print("🔍 [1/5] index.html 정적 리소스(CSS, JS, 이미지) 경로 존재 검증", flush=True)
print("="*60, flush=True)

html_path = os.path.join(BASE_DIR, "index.html")
with open(html_path, "r", encoding="utf-8", errors="ignore") as f:
    html_content = f.read()

links = re.findall(r'<link[^>]+href=["\']([^"\']+)["\']', html_content)
scripts = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html_content)

missing_count = 0
ok_count = 0

for ref in links + scripts:
    clean_ref = ref.split("?")[0]
    if clean_ref.startswith("http://") or clean_ref.startswith("https://") or clean_ref.startswith("//"):
        continue
    local_path = os.path.join(BASE_DIR, clean_ref.replace("/", "\\"))
    if not os.path.exists(local_path):
        print(f"❌ 누락/경로오류: {clean_ref} -> (경로: {local_path})", flush=True)
        missing_count += 1
    else:
        print(f"✅ 정상 연결: {clean_ref}", flush=True)
        ok_count += 1

print(f"\n[HTML 리소스 검증 결과] 정상: {ok_count}개, 누락: {missing_count}개\n", flush=True)

print("="*60, flush=True)
print("🔍 [2/5] JavaScript 파일 문법 및 오류 검증 (Node.js syntax check)", flush=True)
print("="*60, flush=True)

js_dirs = [
    os.path.join(BASE_DIR, "GUMAP-프론트", "js"),
    os.path.join(BASE_DIR, "GUMAP-개발", "tests")
]

js_err_count = 0
js_ok_count = 0

for js_dir in js_dirs:
    if not os.path.exists(js_dir):
        continue
    for root, _, files in os.walk(js_dir):
        for f in files:
            if f.endswith(".js"):
                full_p = os.path.join(root, f)
                rel = os.path.relpath(full_p, BASE_DIR)
                proc = subprocess.run(["node", "--check", full_p], capture_output=True, text=True, encoding="utf-8", errors="ignore")
                if proc.returncode != 0:
                    print(f"❌ JS 문법 오류 발견: {rel}\n{proc.stderr.strip()}", flush=True)
                    js_err_count += 1
                else:
                    print(f"✅ JS 정상: {rel}", flush=True)
                    js_ok_count += 1

print(f"\n[JS 문법 검증 결과] 정상: {js_ok_count}개, 문법 오류: {js_err_count}개\n", flush=True)

print("="*60, flush=True)
print("🔍 [3/5] Python 스크립트 및 서버 모듈 컴파일 검증", flush=True)
print("="*60, flush=True)

py_dirs = [
    os.path.join(BASE_DIR, "GUMAP-서버"),
    os.path.join(BASE_DIR, "GUMAP-실행"),
    BASE_DIR
]

py_files = []
# Root py files
for f in os.listdir(BASE_DIR):
    if f.endswith(".py"):
        py_files.append(os.path.join(BASE_DIR, f))

for p_dir in [os.path.join(BASE_DIR, "GUMAP-서버"), os.path.join(BASE_DIR, "GUMAP-실행")]:
    if os.path.exists(p_dir):
        for f in os.listdir(p_dir):
            if f.endswith(".py"):
                py_files.append(os.path.join(p_dir, f))

py_err_count = 0
py_ok_count = 0

for py_p in py_files:
    rel = os.path.relpath(py_p, BASE_DIR)
    proc = subprocess.run(["py", "-3", "-m", "py_compile", py_p], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    if proc.returncode != 0:
        print(f"❌ Python 문법 오류: {rel}\n{proc.stderr.strip()}", flush=True)
        py_err_count += 1
    else:
        print(f"✅ Python 문법 정상: {rel}", flush=True)
        py_ok_count += 1

print(f"\n[Python 문법 검증 결과] 정상: {py_ok_count}개, 오류: {py_err_count}개\n", flush=True)

print("="*60, flush=True)
print("🔍 [4/5] 백엔드 서버(server.py) 필수 패키지 및 임포트 검증", flush=True)
print("="*60, flush=True)

pkg_test = """
import sys
modules = ['fastapi', 'uvicorn', 'requests', 'aiohttp', 'dotenv', 'pydantic']
missing = []
for m in modules:
    try:
        mod = __import__(m)
        print(f"✅ 패키지 확인: {m} ({getattr(mod, '__version__', 'loaded')})")
    except ImportError:
        print(f"❌ 필수 패키지 미설치: {m}")
        missing.append(m)

if missing:
    print(f"\\n⚠️ 설치 필요: py -3 -m pip install {' '.join(missing)}")
else:
    print("\\n🎉 백엔드 서버에 필요한 모든 핵심 패키지가 설치되어 있습니다.")
"""
proc = subprocess.run(["py", "-3", "-c", pkg_test], capture_output=True, text=True, encoding="utf-8", errors="ignore")
print(proc.stdout, flush=True)

print("="*60, flush=True)
print("🔍 [5/5] 테스트 코드 실행 (GUMAP-개발/tests)", flush=True)
print("="*60, flush=True)

test_files = [f for f in os.listdir(os.path.join(BASE_DIR, "GUMAP-개발", "tests")) if f.endswith(".test.js")]
for tf in test_files:
    tf_path = os.path.join(BASE_DIR, "GUMAP-개발", "tests", tf)
    proc = subprocess.run(["node", tf_path], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    if proc.returncode != 0:
        print(f"⚠️ 테스트 실패 ({tf}):\n{proc.stderr.strip() or proc.stdout.strip()}", flush=True)
    else:
        print(f"✅ 테스트 통과 ({tf}): {proc.stdout.strip() or 'OK'}", flush=True)

print("\n" + "="*60, flush=True)
print("🏁 전체 검증 완료!", flush=True)
print("="*60, flush=True)
