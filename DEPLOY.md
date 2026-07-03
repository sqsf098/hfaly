# Деплой хФали на постійний URL (Railway)

Навіщо: безкоштовні тунелі (ngrok/cloudflare) дають НОВИЙ URL після кожного
запуску. Через це «вмирають» кнопки у старих повідомленнях бота, посилання
та Menu Button (помилки ERR_NGROK_3200 / Cloudflare 1033). Постійний URL
прибирає весь цей клас проблем назавжди: BotFather налаштовується ОДИН раз,
сервер працює 24/7 без твого ноутбука.

## Кроки (≈10 хвилин, один раз)

1. **Акаунт**: https://railway.app → Login with GitHub.

2. **Проєкт**: New Project → Deploy from GitHub repo → обери `sqsf098/hfaly`.
   Railway сам побачить Dockerfile і збілдить.

3. **Диск для даних** (гаманці/скіни/ескроу переживають рестарти):
   у сервісі → вкладка Volumes → New Volume → Mount path: `/app/data`.

4. **Змінні** (вкладка Variables):
   ```
   BOT_TOKEN   = токен від BotFather
   ADMIN_KEY   = свій пароль для /admin
   NODE_ENV    = production
   GROUP_LINK  = https://t.me/твоя_група   (опційно)
   ```

5. **Домен**: Settings → Networking → Generate Domain →
   отримаєш щось типу `hfaly-production.up.railway.app`.
   Додай змінну: `APP_URL = https://hfaly-production.up.railway.app`
   (сервіс перезапуститься сам).

6. **BotFather** (один раз і назавжди):
   - `/myapps` → хФалі → Edit Web App URL → встав APP_URL.
   - Кнопка меню (☰ Грати) оновиться сама при старті сервера.

7. Перевір: відкрий бота → ☰ Грати. Готово.

## Після деплою
- Локальний `start.bat` більше не потрібен для друзів — тільки для розробки.
- Оновлення гри: `git push` → Railway передеплоїть сам.
- Дані: `data/` живуть на volume; бекап — скачай wallets.json з волюма
  або тимчасово через `/api/admin/players`.

## Якщо Railway не підходить
Аналогічно працюють Render.com (безкоштовний tier засинає без трафіку і НЕ
має постійного диска — гаманці зникатимуть при редеплої) та Fly.io
(volume є, налаштування складніше). Рекомендація — Railway.
