@echo off
REM ── Тунель БЕЗ екрана-попередження (заміна ngrok) ────────────────────
REM Cloudflare Quick Tunnel: безкоштовно, без акаунта, чистий URL.
REM 1) Запусти сервер:  npm start  (порт 3000)
REM 2) Запусти цей файл — у консолі з'явиться https://XXXX.trycloudflare.com
REM 3) Постав цей URL у BotFather (Menu Button) і в .env APP_URL
cloudflared.exe tunnel --url http://localhost:3000
