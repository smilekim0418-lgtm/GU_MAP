# 🧠 GUMAP 중앙처리장치

> **모든 GUMAP 모듈의 변경사항을 한 곳에서 추적하는 중앙 보고 시스템**  
> 목적: AI가 각자 담당 파일을 편집할 때, 무엇을 바꿨는지 기록해서 "까먹음" 방지

---

## 📂 파일 구성

| 파일 | 설명 |
|------|------|
| `GUMAP-중앙처리장치.py` | 핵심 시스템 - 보고서 수신/저장/요약 |
| `GUMAP-중앙처리장치-연동.py` | 각 모듈에서 사용할 연동 코드 템플릿 |
| `GUMAP-변경이력-요약.json` | 전체 변경 이력 요약 (자동 생성) |
| `reports/` | 개별 변경 보고서 저장소 (자동 생성) |

---

## 🔧 각 모듈에서 사용하는 방법

### 1. 각 GUMAP-* 파일 상단에 추가 (이미 서버 파일들에는 추가됨)

```python
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
```

### 2. 파일을 수정했을 때 반드시 호출

```python
report_modification(
    module="GUMAP-서버-버스대중교통",   # ← 이 파일 이름
    changes=[
        "bus_arrival LSTM 보정 계수 0.6 → 0.7 변경",
        "shared_mobility 폴백 응답 형식 수정",
    ],
    description="버스 도착 예측 정확도 개선",
    severity="normal"   # normal / important / critical
)
```

---

## 📋 보고서 구조 (JSON)

```json
{
  "report_id": "a1b2c3d4",
  "timestamp": "2026-08-17 22:30:00",
  "module": "GUMAP-서버-버스대중교통",
  "author": "AI",
  "severity": "normal",
  "description": "버스 도착 예측 정확도 개선",
  "changes": [
    "LSTM 보정 계수 0.6 → 0.7",
    "폴백 응답 형식 수정"
  ],
  "change_count": 2
}
```

---

## 📊 전체 요약 보기

```bash
python GUMAP-중앙처리장치.py
```

---

## 🎯 중요도(severity) 기준

| 값 | 의미 | 예시 |
|----|------|------|
| `normal` | 일반 수정 | 버그 수정, 소규모 기능 변경 |
| `important` | 중요 변경 | API 스펙 변경, 주요 로직 수정 |
| `critical` | 긴급/위험 | 보안 수정, 서버 다운 관련 |

---

## 🗂️ GUMAP 모듈별 담당 AI

| 모듈 파일 | 담당 팀 |
|-----------|---------|
| `GUMAP-서버/GUMAP-서버-버스대중교통.py` | 버스/대중교통 AI |
| `GUMAP-서버/GUMAP-서버-교통인프라.py` | CCTV/교통 AI |
| `GUMAP-서버/GUMAP-서버-지도API.py` | 지도/검색 AI |
| `GUMAP-서버/GUMAP-서버-날씨환경.py` | 날씨/환경 AI |
| `GUMAP-서버/GUMAP-서버-AI길찾기.py` | G-Route AI 팀 |
| `GUMAP-프론트/js/GUMAP-버스추적.js` | 프론트 버스 AI |
| `GUMAP-프론트/js/GUMAP-길찾기.js` | 프론트 경로 AI |
| `GUMAP-프론트/js/GUMAP-금오공대탭.js` | 학교지도 AI |
| `GUMAP-AI(길찾기)/groute_ai/` | 딥러닝 학습 AI |
