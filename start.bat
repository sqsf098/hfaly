@echo off
title hFaly - Game Server
color 0A

REM == Cloudflare Tunnel instead of ngrok: NO "You are about to visit" page ==

if not exist "cloudflared.exe" (
    echo Downloading cloudflared...
    powershell -nop -c "iwr https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe -OutFile cloudflared.exe"
)

if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)

REM Free port 3000 (fixes EADDRINUSE: address already in use)
powershell -nop -c "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
taskkill /f /im cloudflared.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo [1/3] Starting Cloudflare tunnel...
start /min "" cloudflared.exe tunnel --url http://localhost:3000 --metrics localhost:33445 --no-autoupdate
timeout /t 6 /nobreak >nul

echo [2/3] Getting HTTPS address...
set TUNNEL_URL=
for /f "delims=" %%i in ('powershell -nop -ExecutionPolicy Bypass -File tools\get-tunnel-url.ps1') do set TUNNEL_URL=%%i

if "%TUNNEL_URL%"=="" (
    timeout /t 5 /nobreak >nul
    for /f "delims=" %%i in ('powershell -nop -ExecutionPolicy Bypass -File tools\get-tunnel-url.ps1') do set TUNNEL_URL=%%i
)

if "%TUNNEL_URL%"=="" (
    echo ERROR: Could not get tunnel URL. Is cloudflared running?
    pause & exit
)

echo URL: %TUNNEL_URL%
powershell -nop -c "(Get-Content .env) -replace 'APP_URL=.*', 'APP_URL=%TUNNEL_URL%' | Set-Content .env"

echo [3/3] Starting game server with AUTO-RELOAD...
echo.
echo ================================
echo  Server is running!
echo  %TUNNEL_URL%
echo.
echo  Paste this URL in BotFather:
echo  /myapps - Edit Web App URL
echo  (new URL after every restart)
echo.
echo  NO ngrok warning page!
echo ================================
echo.

node --watch src/server.js
