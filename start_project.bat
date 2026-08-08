@echo off
setlocal
title QX Trading - Full Project

echo ==========================================
echo  QX Trading Bot - Dashboard Launcher
echo ==========================================
echo.

if not exist "%~dp0quotex_bot\run_web.py" (
  echo [ERROR] quotex_bot\run_web.py not found.
  pause
  exit /b 1
)

echo [1/3] Starting Flask API backend on http://127.0.0.1:8000 ...
start "QX Flask API" cmd /k "cd /d %~dp0quotex_bot && python run_web.py"

echo [2/3] Starting Next.js dashboard on http://localhost:3000 ...
start "QX Next Dashboard" cmd /k "cd /d %~dp0web && npm run dev"

echo [3/3] Opening dashboard...
start "" /min cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:3000"

echo.
echo Both servers are starting. Close their windows to stop them.
echo Dashboard : http://localhost:3000
echo API       : http://127.0.0.1:8000
echo.
pause
