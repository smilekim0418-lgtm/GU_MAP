@echo off
cd /d "%~dp0\.."
title GUMAP CORS Proxy Server
echo Cleaning up previous proxy instances...
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM py.exe >nul 2>&1
echo ========================================================
echo   Starting GUMAP CORS Proxy Server...
echo   Port: 3000
echo ========================================================
echo.

echo [Step 1] Attempting to run proxy via 'py' launcher...
py server.py
if %errorlevel% equ 0 goto SUCCESS

echo.
echo [Step 2] 'py' failed. Attempting to run proxy via 'python'...
python server.py
if %errorlevel% equ 0 goto SUCCESS

echo.
echo [Step 3] 'python' failed. Attempting to run proxy via 'python3'...
python3 server.py
if %errorlevel% equ 0 goto SUCCESS

echo.
echo --------------------------------------------------------
echo [ERROR] Python command not found in your System PATH.
echo Unable to start proxy server.
echo --------------------------------------------------------
echo.
pause
exit

:SUCCESS
echo.
echo Proxy server started successfully!
pause
