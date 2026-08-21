@echo off
title G-Route AI - 도로 그래프 초기화 및 가중치 반영
cd /d "%~dp0"
echo ====================================================
echo   G-Route AI: 구미시 지리 그래프 구축 및 교통상황 연동
echo ====================================================
echo.

if not exist venv (
    echo [-] 가상환경이 존재하지 않습니다. 먼저 pip 설치를 완료해 주세요.
    pause
    exit /b
)

echo [*] 가상환경 활성화 중...
call venv\Scripts\activate

echo.
echo [*] 1단계: 구미시 전체 도로망 그래프 데이터 추출 중 (OSM 연동)...
python 01_build_graph.py
if errorlevel 1 (
    echo.
    echo [-] 1단계 구동 중 에러가 발생했습니다. 네트워크 또는 패키지 상태를 확인하세요.
    pause
    exit /b
)

echo.
echo [*] 2단계: 시간대별 혼잡도 및 정체 핫스팟 가중치 계산 중...
python 02_add_congestion_weights.py
if errorlevel 1 (
    echo.
    echo [-] 2단계 구동 중 에러가 발생했습니다.
    pause
    exit /b
)

echo.
echo ====================================================
echo   [+] 축하합니다! 모든 초기 지리 가중치 그래프가 구축되었습니다.
echo   - 출력경로: data/gumi_road_graph_weighted.pkl
echo ====================================================
echo.
pause
