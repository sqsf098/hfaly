@echo off
title hFaly - Game Server
color 0A

if not exist "ngrok.exe" (
    echo ERROR: ngrok.exe not found!
    pause & exit
)

if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)

taskkill /f /im ngrok.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo [1/3] Starting ngrok...
start /min "" ngrok.exe http 3000
timeout /t 4 /nobreak >nul

echo [2/3] Getting HTTPS address...
for /f "delims=" %%i in ('powershell -command "(Invoke-WebRequest -Uri http://127.0.0.1:4040/api/tunnels -UseBasicParsing | ConvertFrom-Json).tunnels[0].public_url"') do set NGROK_URL=%%i

if "%NGROK_URL%"=="" (
    echo ERROR: Could not get ngrok URL.
    pause & exit
)

echo URL: %NGROK_URL%
powershell -command "(Get-Content .env) -replace 'APP_URL=.*', 'APP_URL=%NGROK_URL%' | Set-Content .env"

echo [3/3] Starting game server with AUTO-RELOAD...
echo.
echo ================================
echo  Server is running!
echo  %NGROK_URL%
echo.
echo  AUTO-RELOAD: edit any file in
echo  src/ - server restarts itself.
echo  Edit public/ - just refresh
echo  the page in Telegram.
echo ================================
echo.

node --watch src/server.js
