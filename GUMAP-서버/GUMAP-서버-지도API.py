# =================================================================================
# 📁 GUMAP-서버-지도API.py
# 📌 역할: VWorld, 주소검색, T-map, ODsay, KRIC 등 지도 관련 API 프록시
# 담당 팀: 지도/길찾기 팀
# 수정 시: 이 파일만 편집하면 됩니다 (지도/검색 관련 모든 엔드포인트)
# =================================================================================
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
import importlib


# ── GUMAP 중앙처리장치 연동 ──────────────────────────
import sys as _sys, os as _os
_cpu_path = _os.path.join(_os.path.dirname(__file__), '..', 'GUMAP-중앙처리장치')
if _cpu_path not in _sys.path:
    _sys.path.insert(0, _cpu_path)
try:
    from GUMAP_중앙처리장치 import report_modification
except ImportError:
    def report_modification(*a, **kw): pass  # 중앙처리장치 없을 때 무시
# ────────────────────────────────────────────────────
router = APIRouter(tags=["지도/검색"])

# 필요한 전역 변수 및 헬퍼 함수
API_KEYS = {}
proxy_request = None
rebuild_qs = None

try:
    from server import (
        API_KEYS as _API_KEYS,
        proxy_request as _proxy_request,
        rebuild_qs as _rebuild_qs,
    )
    API_KEYS = _API_KEYS
    proxy_request = _proxy_request
    rebuild_qs = _rebuild_qs
except ImportError:
    try:
        _main = importlib.import_module("GUMAP-서버-메인")
        API_KEYS = getattr(_main, "API_KEYS", {})
        proxy_request = getattr(_main, "proxy_request", None)
        rebuild_qs = getattr(_main, "rebuild_qs", None)
    except Exception:
        pass


# ==========================================
# 지도/검색 라우트 정의
# ==========================================


@router.get("/vworld-{endpoint}")
async def proxy_vworld(endpoint: str, request: Request):
    """VWorld API 프록시 (국토부 공간정보, 지오코딩 등)
    예: /vworld-search, /vworld-address, /vworld-geocoder
    """
    qs = rebuild_qs(request, {'key': API_KEYS['VWORLD']})
    return await proxy_request(f'https://api.vworld.kr/req/{endpoint}?{qs}', cache_ttl=3600)


@router.get("/juso")
async def proxy_juso(request: Request):
    """도로명 주소 검색 API (행안부 주소 API)"""
    qs = rebuild_qs(request, {'confmKey': API_KEYS['JUSO']})
    return await proxy_request(f'https://business.juso.go.kr/addrlink/addrLinkApi.do?{qs}', cache_ttl=3600)


@router.get("/odsay")
async def proxy_odsay(request: Request):
    """대중교통 경로 탐색 (ODsay 대중교통 API)"""
    qs = rebuild_qs(request, {'apiKey': API_KEYS['ODSAY']})
    return await proxy_request(
        f'https://api.odsay.com/v1/api/searchPubTransPathT?{qs}',
        headers={'Referer': 'http://localhost:5500/'},
        cache_ttl=600
    )


@router.get("/tmap-routes")
async def proxy_tmap_routes_get(request: Request):
    """T-map 자동차/보행 경로 탐색 (GET)"""
    qs = rebuild_qs(request, {}, ['appKey'])
    headers = {'appKey': API_KEYS['TMAP'], 'Accept': 'application/json'}
    return await proxy_request(f'https://apis.openapi.sk.com/tmap/routes?{qs}', headers=headers, cache_ttl=600)


@router.post("/tmap-routes")
async def proxy_tmap_routes_post(request: Request):
    """T-map 경로 탐색 (POST, 보행자/자동차 상세)"""
    data = await request.json()
    version = request.query_params.get('version', '1')
    endpoint = request.query_params.get('endpoint', '')

    url = 'https://apis.openapi.sk.com/tmap/routes'
    if endpoint == 'pedestrian':
        url += '/pedestrian'
    url += f'?version={version}'

    headers = {
        'accept': 'application/json',
        'content-type': 'application/json',
        'appKey': API_KEYS['TMAP']
    }
    return await proxy_request(url, method='POST', data=data, headers=headers, cache_ttl=600)


@router.get("/tmap-pois")
async def proxy_tmap_pois(request: Request):
    """T-map POI(장소) 검색"""
    qs = rebuild_qs(request, {}, ['appKey'])
    headers = {'appKey': API_KEYS['TMAP'], 'Accept': 'application/json'}
    return await proxy_request(f'https://apis.openapi.sk.com/tmap/pois?{qs}', headers=headers, cache_ttl=600)


@router.get("/kric-api")
async def proxy_kric_api(request: Request):
    """한국철도공사(KRIC) API 프록시 (철도 정보)"""
    target_url = request.query_params.get('targetUrl')
    if not target_url:
        return JSONResponse({"error": "targetUrl missing"}, status_code=400)
    qs = rebuild_qs(request, {'serviceKey': API_KEYS['KRIC']}, ['targetUrl'])
    return await proxy_request(f'{target_url}?{qs}', cache_ttl=120)


@router.get("/gumi-data")
async def proxy_gumi_data(request: Request):
    """구미시 공공데이터 API 통합 프록시"""
    target_url = request.query_params.get('targetUrl')
    if not target_url:
        return JSONResponse({"error": "targetUrl missing"}, status_code=400)
    qs = rebuild_qs(request, {'serviceKey': API_KEYS['TAGO']}, ['targetUrl'])
    headers = {"Authorization": f"Infuser {API_KEYS['TAGO']}"}
    return await proxy_request(f'{target_url}?{qs}', headers=headers, cache_ttl=1800)

