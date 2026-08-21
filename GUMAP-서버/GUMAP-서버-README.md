# 🖥️ GUMAP 서버 모듈 구조

> `server.py` (1,757줄 단일 파일)을 **도메인별로 분리**한 모듈 구조입니다.  
> 각 팀이 독립적으로 편집할 수 있습니다.

---

## 📁 파일 구성

| 파일 | 담당 팀 | 엔드포인트 |
|------|---------|-----------|
| `GUMAP-서버-메인.py` | 전체/공통 | 앱 설정, 공통 함수, AI 모델 로드, 정적파일 |
| `GUMAP-서버-버스대중교통.py` | 버스/대중교통 팀 | `/bus-arrival`, `/bus-congestion`, `/bus-passenger`, `/bus-stop-usage`, `/shared-mobility`, `/tago-api` |
| `GUMAP-서버-교통인프라.py` | 교통인프라/CCTV 팀 | `/its-cctv`, `/its-event`, `/its-traffic`, `/cctv-proxy` |
| `GUMAP-서버-지도API.py` | 지도/검색 팀 | `/vworld-*`, `/juso`, `/odsay`, `/tmap-routes`, `/tmap-pois`, `/kric-api`, `/gumi-data` |
| `GUMAP-서버-날씨환경.py` | 날씨/환경 팀 | `/weather-radar`, `/weather-info`, `/dust-info`, `/opinet-around`, `/opinet-detail` |
| `GUMAP-서버-AI길찾기.py` | AI/길찾기 팀 | `/groute-api`, `/groute-benchmark`, `/transit`, `/gemini-api` |

---

## 🚀 실행 방법

```bash
# 메인 서버 실행 (모든 라우터 자동 포함)
python GUMAP-서버-메인.py

# 또는 uvicorn으로 직접
uvicorn GUMAP-서버-메인:app --reload --host 0.0.0.0 --port 3000
```

---

## 🔧 각 팀별 수정 방법

### 버스/대중교통 팀이 버스 도착 정보를 수정하려면:
```
GUMAP-서버-버스대중교통.py → proxy_bus_arrival() 함수 수정
```

### AI 팀이 G-Route 경로 알고리즘을 수정하려면:
```
GUMAP-서버-AI길찾기.py → groute_inference() 함수 수정
또는 groute_ai/ 폴더의 학습 스크립트 수정
```

### 날씨 팀이 날씨 API를 추가하려면:
```
GUMAP-서버-날씨환경.py → 새 @router.get() 함수 추가
```

---

## ⚠️ 주의사항

- 각 라우터 파일은 **단독으로 실행되지 않습니다**
- 반드시 `GUMAP-서버-메인.py`에서 import하여 사용합니다
- API 키는 `.env` 파일에서 관리 → `GUMAP-API키/` 폴더 참고
- 공통 함수(`proxy_request`, `rebuild_qs` 등)는 메인 파일에 있습니다
