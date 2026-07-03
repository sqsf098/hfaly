@echo off
chcp 65001 >nul
title hFaly - Game Server
color 0A

REM ── Cloudflare Tunnel замiсть ngrok: БЕЗ екрана "You are about to visit" ──

if not exist "cloudflared.exe" (
    echo Downloading cloudflared...
    powershell -nop -c "iwr https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe -OutFile cloudflared.exe"
)

if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)

REM Звiльняємо порт 3000 (iнакше EADDRINUSE: address already in use)
powershell -nop -c "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
taskkill /f /im cloudflared.exe >nul 2>&1
del tunnel.log >nul 2>&1

echo [1/3] Starting Cloudflare tunnel...
start /min "" cmd /c "cloudflared.exe tunnel --url http://localhost:3000 --no-autoupdate > tunnel.log 2>&1"

echo [2/3] Waiting for HTTPS address...
set TUNNEL_URL=
for /l %%n in (1,1,30) do (
    if not defined TUNNEL_URL (
        timeout /t 1 /nobreak >nul
        for /f "delims=" %%i in ('powershell -nop -c "try{(Select-String -Path tunnel.log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com').Matches.Value | Select-Object -First 1}catch{}"') do set TUNNEL_URL=%%i
    )
)

if not defined TUNNEL_URL (
    echo ERROR: tunnel did not start. Check tunnel.log
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
echo  Встав цей URL у BotFather:
echo  /myapps ^> хФалi ^> Edit Web App URL
echo  (URL новий пiсля кожного запуску)
echo.
echo  Без екрана-попередження ngrok!
echo ================================
echo.

node --watch src/server.js
