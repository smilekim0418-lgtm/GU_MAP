@echo off
cd /d "%~dp0"

where py.exe > nul 2>&1
if %errorlevel% equ 0 (
    py.exe "%~dp0launch_gis_servers.py"
) else (
    where python.exe > nul 2>&1
    if %errorlevel% equ 0 (
        python.exe "%~dp0launch_gis_servers.py"
    ) else (
        echo Python not found. Install Python 3.x.
        pause
        exit /b 1
    )
)
pause