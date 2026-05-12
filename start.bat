@echo off
echo  Stopping any previous server on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo  Starting GitHub City 3D...
echo  Browser will open at http://localhost:3000
echo  Keep this window open. Press Ctrl+C to stop.
echo.
node server.js
pause
