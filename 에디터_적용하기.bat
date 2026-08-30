@echo off
cd /d "%~dp0GUMAP-개발\floorplan"
echo =======================================
echo   에디터 수정사항 본 서버 적용 스크립트
echo =======================================
echo.
echo [1/2] 겹치는 복도를 하나의 다각형으로 병합합니다...
python run_merger.py
echo.
echo [2/2] 메인 지도 데이터(IMDF)를 새로 구워서 적용합니다...
python 04_build_imdf.py --write
echo.
echo =======================================
echo   적용 완료! (GitHub 푸시는 별도로 해주세요)
echo =======================================
pause
