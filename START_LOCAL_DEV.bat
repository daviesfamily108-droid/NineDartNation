@echo off
REM Start Nine Dart Nation Local Development Environment

echo.
echo ========================================
echo  Starting Nine Dart Nation Development
echo ========================================
echo.

REM Check if Node is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)

echo [1/3] Starting Backend Server on port 8787...
start "NDN Backend Server" cmd /k "cd /d c:\Users\Family\Desktop\Nine-Dart-Nation\server && set DEBUG_SINGLE_WORKER=1 && node server.cjs"

echo [2/3] Waiting for backend to start (5 seconds)...
timeout /t 5 /nobreak

echo [3/3] Starting Frontend Dev Server on port 5173...
start "NDN Frontend Dev Server" cmd /k "cd /d c:\Users\Family\Desktop\Nine-Dart-Nation && npm run dev"

echo.
echo ========================================
echo  Development Environment Started!
echo ========================================
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:8787
echo.
echo Press CTRL+C in each terminal to stop.
echo.
pause
