# =================================================================================
# 📁 GUMAP-서버-교통인프라.py
# 📌 역할: ITS 교통 정보, CCTV 스트림 프록시, 구미시 데이터 등 교통 인프라 API 연동
# 담당 팀: 교통인프라 팀
# =================================================================================
from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
import os
import sys
import httpx
import importlib
from urllib.parse import urlparse, quote


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
router = APIRouter(tags=["교통인프라"])
limiter = Limiter(key_func=get_remote_address)

# 필요한 전역 변수 및 헬퍼 함수
API_KEYS = {}
proxy_request = None
rebuild_qs = None
http_client = None

try:
    from server import (
        API_KEYS as _API_KEYS,
        proxy_request as _proxy_request,
        rebuild_qs as _rebuild_qs,
        http_client as _http_client
    )
    API_KEYS = _API_KEYS
    proxy_request = _proxy_request
    rebuild_qs = _rebuild_qs
    http_client = _http_client
except ImportError:
    try:
        _main = importlib.import_module("GUMAP-서버-메인")
        API_KEYS = getattr(_main, "API_KEYS", {})
        proxy_request = getattr(_main, "proxy_request", None)
        rebuild_qs = getattr(_main, "rebuild_qs", None)
        http_client = getattr(_main, "http_client", None)
    except Exception:
        pass


# ==========================================
# 교통 인프라 라우트 정의
# ==========================================

@router.get("/its-cctv")
@limiter.limit("60/minute")
async def proxy_its_cctv(request: Request):
    """
    국가교통정보센터(ITS) 실시간 CCTV 정보 조회
    """
    global proxy_request, rebuild_qs, API_KEYS
    if proxy_request is None or rebuild_qs is None:
        try:
            from server import proxy_request as _pr, rebuild_qs as _rq, API_KEYS as _ak
            proxy_request, rebuild_qs, API_KEYS = _pr, _rq, _ak
        except Exception:
            pass

    qs = rebuild_qs(request, {'apiKey': API_KEYS['ITS'], 'getType': 'json'}, ['key', 'apiKey'])
    return await proxy_request(f'https://openapi.its.go.kr:9443/cctvInfo?{qs}', headers={'Referer': 'http://localhost:5500/'}, cache_ttl=60)


@router.get("/its-event")
@limiter.limit("60/minute")
async def proxy_its_event(request: Request):
    """
    국가교통정보센터(ITS) 도로 돌발상황 / 사고 정보 조회
    """
    global proxy_request, rebuild_qs, API_KEYS
    if proxy_request is None or rebuild_qs is None:
        try:
            from server import proxy_request as _pr, rebuild_qs as _rq, API_KEYS as _ak
            proxy_request, rebuild_qs, API_KEYS = _pr, _rq, _ak
        except Exception:
            pass

    qs = rebuild_qs(request, {'apiKey': API_KEYS['ITS'], 'getType': 'json'}, ['key', 'apiKey'])
    return await proxy_request(f'https://openapi.its.go.kr:9443/eventInfo?{qs}', headers={'Referer': 'http://localhost:5500/'}, cache_ttl=60)


@router.get("/its-traffic")
@limiter.limit("60/minute")
async def proxy_its_traffic(request: Request):
    """
    국가교통정보센터(ITS) 실시간 도로 소통 정보 조회
    """
    global proxy_request, rebuild_qs, API_KEYS
    if proxy_request is None or rebuild_qs is None:
        try:
            from server import proxy_request as _pr, rebuild_qs as _rq, API_KEYS as _ak
            proxy_request, rebuild_qs, API_KEYS = _pr, _rq, _ak
        except Exception:
            pass

    qs = rebuild_qs(request, {'apiKey': API_KEYS['ITS'], 'getType': 'json'}, ['key', 'apiKey'])
    return await proxy_request(f'https://openapi.its.go.kr:9443/trafficInfo?{qs}', headers={'Referer': 'http://localhost:5500/'}, cache_ttl=60)


@router.get("/gumi-data")
@limiter.limit("150/minute")
async def proxy_gumi_data(request: Request):
    """
    구미시 공공데이터 포털 API 프록시
    """
    global proxy_request, rebuild_qs, API_KEYS
    if proxy_request is None or rebuild_qs is None:
        try:
            from server import proxy_request as _pr, rebuild_qs as _rq, API_KEYS as _ak
            proxy_request, rebuild_qs, API_KEYS = _pr, _rq, _ak
        except Exception:
            pass

    target_url = request.query_params.get('targetUrl')
    if not target_url:
        return JSONResponse({"error": "targetUrl missing"}, status_code=400)
    qs = rebuild_qs(request, {'serviceKey': API_KEYS['TAGO']}, ['targetUrl'])
    headers = {"Authorization": f"Infuser {API_KEYS['TAGO']}"}
    return await proxy_request(f'{target_url}?{qs}', headers=headers, cache_ttl=1800)


@router.get("/cctv-proxy")
@limiter.limit("200/minute")
async def proxy_cctv_stream(request: Request, url: str):
    """
    CCTV 영상 스트림 프록시 및 HLS (m3u8) 경로 재작성 중계
    """
    if not url:
        return JSONResponse({"error": "url missing"}, status_code=400)
    
    parsed = urlparse(url)
    cctv_allowed_env = os.getenv("CCTV_ALLOWED_DOMAINS")
    if cctv_allowed_env:
        allowed_domains = [d.strip() for d in cctv_allowed_env.split(",") if d.strip()]
    else:
        allowed_domains = ["ktict.co.kr", "its.go.kr", "road.re.kr"]
        
    netloc_host = parsed.netloc.split(':')[0]
    if not any(netloc_host == d or netloc_host.endswith('.' + d) for d in allowed_domains):
        return JSONResponse({"error": f"Domain {parsed.netloc} not allowed for CCTV proxy"}, status_code=403)
        
    global http_client
    if http_client is None:
        try:
            from server import http_client as _hc
            http_client = _hc
        except Exception:
            pass
            
    if http_client is None:
        verify_ssl = os.getenv('VERIFY_SSL', 'true').lower() == 'true'
        http_client = httpx.AsyncClient(timeout=15.0, verify=verify_ssl, follow_redirects=True)
        
    try:
        response = await http_client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        content = response.content
        content_type = response.headers.get('content-type', '')
        
        # Rewriting m3u8 playlist to use the proxy recursively
        final_url = str(response.url)
        if ".m3u8" in final_url or "application/vnd.apple.mpegurl" in content_type or "application/x-mpegurl" in content_type:
            try:
                text_content = content.decode('utf-8', errors='ignore')
                base_url = final_url.rsplit('/', 1)[0] + '/'
                lines = text_content.split('\n')
                new_lines = []
                for line in lines:
                    line_strip = line.strip()
                    if line_strip and not line_strip.startswith('#'):
                        if line_strip.startswith('http://') or line_strip.startswith('https://'):
                            full_url = line_strip
                        else:
                            full_url = base_url + line_strip
                        proxied_url = f"/cctv-proxy?url={quote(full_url)}"
                        new_lines.append(proxied_url)
                    else:
                        new_lines.append(line)
                content = '\n'.join(new_lines).encode('utf-8')
            except Exception as parse_err:
                print("m3u8 rewriting failed:", parse_err)
                
        return Response(
            content=content,
            status_code=response.status_code,
            media_type=content_type or 'application/octet-stream'
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

