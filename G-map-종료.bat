@echo off
chcp 65001 >nul
echo ====================================================
echo   G-map Server Stopper
echo ====================================================
echo.
echo 백그라운드에서 실행 중인 G-map 서버를 모두 종료합니다...
echo.

FOR %%p IN (3000 8765 8766 8767) DO (
    FOR /F "tokens=5" %%a IN ('netstat -ano ^| findstr :%%p ^| findstr LISTENING') DO (
        if "%%a" NEQ "0" (
            echo 포트 %%p (PID: %%a) 종료 중...
            taskkill /F /PID %%a /T >nul 2>&1
        )
    )
)

echo.
echo 모든 서버가 안전하게 종료되었습니다!
echo.
pause
