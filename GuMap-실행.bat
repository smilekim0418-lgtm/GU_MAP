@echo off
chcp 65001 >nul
title GuMap Launcher (Port 3000)

echo ========================================================
echo   GuMap 스마트 모빌리티 통합 플랫폼 실행기
echo ========================================================
echo.

echo [1/3] 기존 포트 3000 정리 중...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

if exist ".venv\Scripts\python.exe" (
    set "PYCMD=.venv\Scripts\python.exe"
) else (
    set "PYCMD=python"
)

echo [2/3] GuMap 서버 구동 중 (%PYCMD%)...
start "GuMap-Server" %PYCMD% server.py

echo [3/3] AI 엔진 및 지도 타일 로딩 대기 중...
:WAIT_SERVER
ping -n 2 127.0.0.1 >nul
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if errorlevel 1 (
    echo   - 지도 엔진 로딩 중...
    goto WAIT_SERVER
)

echo.
echo ========================================================
echo   [성공] 서버 준비 완료! 브라우저(http://localhost:3000)를 엽니다.
echo ========================================================
echo.
ping -n 2 127.0.0.1 >nul
start http://localhost:3000

:LOOP
echo.
set /p CMD="명령 선택 (R: 브라우저 재실행 / Q: 서버 종료): "
if /i "%CMD%"=="R" (
    start http://localhost:3000
    goto LOOP
)
if /i "%CMD%"=="Q" (
    echo GuMap 서버를 안전하게 종료합니다...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
    exit /b 0
)
goto LOOP
