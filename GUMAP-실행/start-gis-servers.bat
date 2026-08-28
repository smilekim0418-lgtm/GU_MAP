@echo off
cd /d "%~dp0"

rem 괄호 블록 안에서 %errorlevel% 은 실행 시점이 아니라 파싱 시점에 값이
rem 박힌다. 그래서 예전 코드는 py.exe 가 없으면, 그 다음 python.exe 를
rem 찾아 놓고도 "Python not found" 로 빠졌다. 블록을 중첩하지 않는다.

set "PYCMD="
where py.exe >nul 2>&1 && set "PYCMD=py.exe"
if not defined PYCMD where python.exe >nul 2>&1 && set "PYCMD=python.exe"
if not defined PYCMD where python3.exe >nul 2>&1 && set "PYCMD=python3.exe"

if not defined PYCMD (
    echo Python not found. Install Python 3.x.
    pause
    exit /b 1
)

echo Using %PYCMD%
%PYCMD% "%~dp0launch_gis_servers.py"
pause
