@echo off
cd /d "%~dp0\.."
title GUMAP Online Tunnel
echo Cleaning up previous proxy instances...
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM py.exe >nul 2>&1
echo ========================================================
echo   Starting GUMAP Integrated Server and Online Tunnel...
echo ========================================================
echo.

echo [Step 1] Starting Local Server...
python --version >nul 2>&1
if %errorlevel% equ 0 (
    set PYTHON_CMD=python
) else (
    set PYTHON_CMD=py
)

start /B %PYTHON_CMD% server.py

timeout /t 3 /nobreak >nul

echo.
echo [Step 2] Starting Ngrok Tunnel...
echo ========================================================
echo  Your Permanent Domain: https://custard-channel-desolate.ngrok-free.dev/index.html
echo  DO NOT CLOSE THIS WINDOW
echo ========================================================
echo.

ngrok http 3000 --domain=custard-channel-desolate.ngrok-free.dev

pause
