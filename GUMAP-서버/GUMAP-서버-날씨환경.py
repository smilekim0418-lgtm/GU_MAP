# =================================================================================
# 📁 GUMAP-서버-날씨환경.py
# 📌 역할: 날씨, 미세먼지, 유가 정보 API 프록시
# 담당 팀: 날씨/환경 팀
# 수정 시: 이 파일만 편집하면 됩니다 (날씨/환경 관련 모든 엔드포인트)
# =================================================================================
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
import importlib
from datetime import datetime


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
router = APIRouter(tags=["날씨/환경"])
limiter = Limiter(key_func=get_remote_address)

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
# 날씨/환경 라우트 정의
# ==========================================


@router.get("/weather-radar")
@limiter.limit("30/minute")
async def proxy_weather_radar(request: Request):
    """기상 레이더 이미지 API 프록시"""
    qs = rebuild_qs(request, {'serviceKey': API_KEYS['TAGO']})
    return await proxy_request(f'https://apis.data.go.kr/1360000/RadarImgInfoService/getCmpImg?{qs}', cache_ttl=300)


@router.get("/weather-info")
@limiter.limit("60/minute")
async def proxy_weather_info(request: Request):
    """현재 날씨 정보 (Open-Meteo API, 실패 시 기본값 반환)"""
    try:
        qs = rebuild_qs(request, {})
        response = await proxy_request(f'https://api.open-meteo.com/v1/forecast?{qs}', cache_ttl=1800)
        if response.status_code != 200:
            raise Exception(f"Open-Meteo failed with status {response.status_code}")
        return response
    except Exception as e:
        print(f"[-] Weather API failure ({e}). Serving dummy fallback weather.")
        fallback_weather = {
            "latitude": 36.119485,
            "longitude": 128.344573,
            "generationtime_ms": 0.1,
            "utc_offset_seconds": 32400,
            "timezone": "Asia/Seoul",
            "timezone_abbreviation": "KST",
            "elevation": 50.0,
            "current_weather": {
                "temperature": 21.5,
                "windspeed": 5.4,
                "winddirection": 180,
                "weathercode": 1,
                "is_day": 1,
                "time": datetime.now().strftime("%Y-%m-%dT%H:00")
            }
        }
        return JSONResponse(fallback_weather)


@router.get("/dust-info")
@limiter.limit("60/minute")
async def proxy_dust_info(request: Request):
    """미세먼지/대기질 정보 (Open-Meteo Air Quality API, 실패 시 기본값 반환)"""
    try:
        qs = rebuild_qs(request, {})
        response = await proxy_request(f'https://air-quality-api.open-meteo.com/v1/air-quality?{qs}', cache_ttl=1800)
        if response.status_code != 200:
            raise Exception(f"Air quality API failed with status {response.status_code}")
        return response
    except Exception as e:
        print(f"[-] Dust API failure ({e}). Serving dummy fallback air quality.")
        fallback_dust = {
            "latitude": 36.119485,
            "longitude": 128.344573,
            "generationtime_ms": 0.1,
            "utc_offset_seconds": 32400,
            "timezone": "Asia/Seoul",
            "timezone_abbreviation": "KST",
            "elevation": 50.0,
            "current": {
                "pm2_5": 18.0,
                "pm10": 32.0,
                "us_aqi": 52
            }
        }
        return JSONResponse(fallback_dust)


@router.get("/opinet-around")
@limiter.limit("30/minute")
async def proxy_opinet_around(request: Request):
    """주변 주유소 가격 정보 (Opinet API)"""
    qs = rebuild_qs(request, {'code': API_KEYS['OPINET']})
    return await proxy_request(f'http://www.opinet.co.kr/api/aroundAll.do?{qs}', cache_ttl=1800)


@router.get("/opinet-detail")
@limiter.limit("60/minute")
async def proxy_opinet_detail(request: Request):
    """특정 주유소 상세 가격 (Opinet API)"""
    qs = rebuild_qs(request, {'code': API_KEYS['OPINET']})
    return await proxy_request(f'http://www.opinet.co.kr/api/detailById.do?{qs}', cache_ttl=1800)

