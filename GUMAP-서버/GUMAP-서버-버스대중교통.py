# =================================================================================
# 📁 GUMAP-서버-버스대중교통.py
# 📌 역할: 버스 도착 정보, 혼잡도, 공유 킥보드 등 대중교통 관련 API 프록시
# 담당 팀: 버스/대중교통 팀
# =================================================================================
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
import json
import numpy as np
import os
import sys
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
router = APIRouter(tags=["버스/대중교통"])
limiter = Limiter(key_func=get_remote_address)

# 필요한 전역 변수들은 server main에서 import됨
# from GUMAP-서버-메인 import API_KEYS, proxy_request, rebuild_qs, bus_lstm_session, gumi_route_congestion

# 전역 변수 참조 헬퍼 (동적 바인딩 지원)
API_KEYS = {}
proxy_request = None
rebuild_qs = None
bus_lstm_session = None
gumi_route_congestion = {}

try:
    from server import (
        API_KEYS as _API_KEYS,
        proxy_request as _proxy_request,
        rebuild_qs as _rebuild_qs,
        bus_lstm_session as _bus_lstm_session,
        gumi_route_congestion as _gumi_route_congestion
    )
    API_KEYS = _API_KEYS
    proxy_request = _proxy_request
    rebuild_qs = _rebuild_qs
    bus_lstm_session = _bus_lstm_session
    gumi_route_congestion = _gumi_route_congestion
except ImportError:
    try:
        _main = importlib.import_module("GUMAP-서버-메인")
        API_KEYS = getattr(_main, "API_KEYS", {})
        proxy_request = getattr(_main, "proxy_request", None)
        rebuild_qs = getattr(_main, "rebuild_qs", None)
        bus_lstm_session = getattr(_main, "bus_lstm_session", None)
        gumi_route_congestion = getattr(_main, "gumi_route_congestion", {})
    except Exception:
        pass


# ==========================================
# 버스 / 대중교통 라우트 정의
# ==========================================

@router.get("/bus-arrival")
@limiter.limit("120/minute")
async def proxy_bus_arrival(request: Request):
    """
    실시간 버스 도착 정보 조회 및 LSTM 신경망 도착 예정 시간 보정
    """
    global bus_lstm_session, proxy_request, rebuild_qs, API_KEYS
    if proxy_request is None or rebuild_qs is None:
        try:
            from server import proxy_request as _pr, rebuild_qs as _rq, API_KEYS as _ak, bus_lstm_session as _bls
            proxy_request, rebuild_qs, API_KEYS, bus_lstm_session = _pr, _rq, _ak, _bls
        except Exception:
            pass

    qs = rebuild_qs(request, {'serviceKey': API_KEYS['TAGO']})
    
    # 1. 공공데이터포털 실시간 정보 중계
    response = await proxy_request(f'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?{qs}', cache_ttl=10)
    
    if response.status_code != 200 or not bus_lstm_session:
        return response
        
    try:
        # 응답 Body 바이트 데이터를 JSON 디코딩
        res_data = json.loads(response.body.decode('utf-8'))
        if not isinstance(res_data, dict):
            return response
        resp = res_data.get("response", {})
        if not isinstance(resp, dict):
            return response
        body = resp.get("body", {})
        if not isinstance(body, dict):
            return response
        items = body.get("items", {})
        if not isinstance(items, dict):
            return response
        item_list = items.get("item", [])
        
        if not item_list:
            return response
            
        if isinstance(item_list, dict):
            item_list = [item_list]
            
        now = datetime.now()
        hour = now.hour
        day = now.weekday()
        rain = 0.0 # 기상조건 평시 기본값
        
        # 2. 버스 예정 시각 LSTM 신경망 보정 루프
        for item in item_list:
            tago_arrtime = float(item.get("arrtime", 180.0))
            node_order = float(item.get("arrprevstationcnt", 3))
            
            # LSTM Sequence Input Feature 빌드: (1, 5, 5) -> [hour, day, rain, stop_index, tago_time]
            seq_data = []
            for step in range(1, 6):
                seq_data.append([
                    float(hour), 
                    float(day), 
                    rain, 
                    node_order, 
                    tago_arrtime * (step / 5.0)
                ])
            input_data = np.array([seq_data], dtype=np.float32)
            
            # ONNX Inference
            input_name = bus_lstm_session.get_inputs()[0].name
            ort_outs = bus_lstm_session.run(None, {input_name: input_data})
            predicted_time = float(ort_outs[0][0][0])
            
            # 물리 한계 캡핑 (안전 계수: TAGO 시간의 0.6배 ~ 1.7배 범위 한정)
            min_time = max(15.0, tago_arrtime * 0.6)
            max_time = tago_arrtime * 1.7
            final_arrtime = max(min_time, min(max_time, predicted_time))
            
            # 도착 소요 시간 덮어쓰기
            item["arrtime"] = int(final_arrtime)
            item["groute_corrected"] = True
            item["tago_original_arrtime"] = int(tago_arrtime)
            
        items["item"] = item_list
        body["items"] = items
        resp["body"] = body
        res_data["response"] = resp
        
        return JSONResponse(res_data)
    except Exception as e:
        print(f"[-] G-Route AI: Bus arrival LSTM pipeline failure: {e}")
        return response


@router.get("/bus-congestion")
@limiter.limit("300/minute")
async def proxy_bus_congestion(request: Request):
    """
    구미시 버스 노선별 혼잡도 레벨 조회
    """
    global gumi_route_congestion
    if not gumi_route_congestion:
        try:
            from server import gumi_route_congestion as _grc
            gumi_route_congestion = _grc
        except Exception:
            pass

    route_id = request.query_params.get("routeId", "")
    clean_id = route_id.replace("GMB", "")
    matched_level = 1
    
    for i in range(len(clean_id), 0, -1):
        sub = clean_id[:i]
        hyphen_sub = sub
        if len(sub) > 2:
            hyphen_sub = sub[:-1] + "-" + sub[-1]
            
        if sub in gumi_route_congestion:
            matched_level = gumi_route_congestion[sub]
            break
        elif hyphen_sub in gumi_route_congestion:
            matched_level = gumi_route_congestion[hyphen_sub]
            break
            
    return JSONResponse({
        "response": {
            "header": {"resultCode": "00", "resultMsg": "NORMAL SERVICE"},
            "body": {
                "items": {
                    "item": [
                        {
                            "congestionLevel": matched_level,
                            "routeId": route_id
                        }
                    ]
                },
                "numOfRows": 10,
                "pageNo": 1,
                "totalCount": 1
            }
        }
    })


@router.get("/bus-passenger")
@limiter.limit("60/minute")
async def proxy_bus_passenger(request: Request):
    """
    노선별 재차인원 / 승객 탑승 정보 프록시
    """
    global proxy_request, rebuild_qs, API_KEYS
    if proxy_request is None or rebuild_qs is None:
        try:
            from server import proxy_request as _pr, rebuild_qs as _rq, API_KEYS as _ak
            proxy_request, rebuild_qs, API_KEYS = _pr, _rq, _ak
        except Exception:
            pass

    qs = rebuild_qs(request, {'serviceKey': API_KEYS['TAGO']})
    return await proxy_request(f'https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteAcctoVhcleOccpancyInfo?{qs}', cache_ttl=120)


@router.get("/bus-stop-usage")
@limiter.limit("60/minute")
async def proxy_bus_stop_usage(request: Request):
    """
    정류소별 특정 노선 버스 도착 예정 정보 목록 조회
    """
    global proxy_request, rebuild_qs, API_KEYS
    if proxy_request is None or rebuild_qs is None:
        try:
            from server import proxy_request as _pr, rebuild_qs as _rq, API_KEYS as _ak
            proxy_request, rebuild_qs, API_KEYS = _pr, _rq, _ak
        except Exception:
            pass

    qs = rebuild_qs(request, {'serviceKey': API_KEYS['TAGO']})
    return await proxy_request(f'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnAcctoSpcifyRouteBusArvlPrearngeInfoList?{qs}', cache_ttl=120)


@router.get("/shared-mobility")
@limiter.limit("30/minute")
async def proxy_shared_mobility(request: Request):
    """
    공유 전동 킥보드 / PM 위치 정보 조회 (API 장애 시 더미 폴백 데이터 반환)
    """
    global proxy_request, rebuild_qs, API_KEYS
    if proxy_request is None or rebuild_qs is None:
        try:
            from server import proxy_request as _pr, rebuild_qs as _rq, API_KEYS as _ak
            proxy_request, rebuild_qs, API_KEYS = _pr, _rq, _ak
        except Exception:
            pass

    qs = rebuild_qs(request, {'serviceKey': API_KEYS['TAGO']})
    try:
        response = await proxy_request(f'https://apis.data.go.kr/1613000/SharePmInfoService/getPmPositionList?{qs}', cache_ttl=30)
        if response.status_code == 200:
            # Check if response is valid JSON and not an XML error block
            try:
                data = json.loads(response.body)
                if "response" in data and "body" in data["response"]:
                    return response
            except:
                pass
    except Exception as e:
        print("[shared-mobility] Proxy failed, falling back to dummy data wrapper:", e)
        
    fallback_data = {
        "response": {
            "header": {
                "resultCode": "00",
                "resultMsg": "FALLBACK SERVICE (API OFFLINE)."
            },
            "body": {
                "items": "",
                "numOfRows": 50,
                "pageNo": 1,
                "totalCount": 0
            }
        }
    }
    return JSONResponse(content=fallback_data, status_code=200)


@router.get("/tago-api")
@limiter.limit("120/minute")
async def proxy_tago_direct(request: Request):
    """
    TAGO 공공데이터포털 범용 API 프록시
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
    return await proxy_request(f'{target_url}?{qs}', cache_ttl=5)

