@echo off
cd /d "%~dp0\.."
title GUMAP Local Web Server
echo ========================================================
echo   Starting GUMAP Local Web Server...
echo   Please access: http://localhost:5500/index.html
echo ========================================================
echo.

echo [Step 1] Attempting to run via 'py' launcher...
py -m http.server 5500
if %errorlevel% equ 0 goto SUCCESS

echo.
echo [Step 2] 'py' failed. Attempting to run via 'python'...
python -m http.server 5500
if %errorlevel% equ 0 goto SUCCESS

echo.
echo [Step 3] 'python' failed. Attempting to run via 'python3'...
python3 -m http.server 5500
if %errorlevel% equ 0 goto SUCCESS

echo.
echo --------------------------------------------------------
echo [ERROR] Python command not found in your System PATH.
echo Please install Python and check 'Add python.exe to PATH'.
echo --------------------------------------------------------
echo.
pause
exit

:SUCCESS
echo.
echo Server started successfully!
pause
