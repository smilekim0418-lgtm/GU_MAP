@echo off
cd /d "%~dp0"

echo Stopping GuMap server and ngrok background processes...
taskkill /F /IM ngrok.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo All GuMap processes stopped.
timeout /t 2 /nobreak >nul
