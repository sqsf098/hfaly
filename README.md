# хФали 🃏 — Telegram WebApp

Карткова гра для 4 гравців (2 vs 2) у вигляді Telegram Mini App.

## Структура проєкту

```
hfaly/
├── src/
│   ├── server.js   — Express + Socket.io + Telegram Bot
│   └── game.js     — Вся ігрова логіка
├── public/
│   └── index.html  — Фронтенд (Telegram WebApp)
├── Dockerfile
├── package.json
└── .env.example
```

---

## 🚀 Деплой на Railway (безкоштовно)

### Крок 1 — Створи Telegram бота

1. Відкрий Telegram, знайди **@BotFather**
2. Надішли `/newbot`
3. Придумай ім'я: наприклад `хФали Гра`
4. Придумай username: наприклад `hfaly_game_bot`
5. Скопіюй **токен** — це твій `BOT_TOKEN`

### Крок 2 — Завантаж на GitHub

```bash
git init
git add .
git commit -m "initial"
gh repo create hfaly --public --push
# або через github.com вручну
```

### Крок 3 — Деплой на Railway

1. Зайди на **railway.app** → New Project → Deploy from GitHub
2. Обери свій репозиторій `hfaly`
3. Railway автоматично знайде Dockerfile і побудує проєкт

### Крок 4 — Додай змінні середовища

В Railway → твій проєкт → Variables:

```
BOT_TOKEN=1234567890:ABCdef...    ← від BotFather
APP_URL=https://hfaly-production.up.railway.app   ← твій Railway URL
PORT=3000
```

> APP_URL знаходиш у: Railway → Settings → Domains → Generate Domain

### Крок 5 — Налаштуй Web App у BotFather

1. В BotFather → `/mybots` → твій бот → **Bot Settings** → **Menu Button**
2. Встанови URL: `https://твій-домен.up.railway.app`
3. Встанови назву кнопки: `🃏 Грати`

---

## 🎮 Як грати

1. Напиши боту `/start`
2. Натисни **Нова гра** → отримаєш код кімнати
3. Надішли код друзям: вони пишуть `/join КОД`
4. Коли всі 4 гравці увійшли — гра починається автоматично

---

## 🏗️ Локальний запуск (для розробки)

```bash
npm install
cp .env.example .env
# заповни .env своїми даними
npm run dev
# відкрий http://localhost:3000
```

---

## 📐 Архітектура

```
Telegram Bot (polling)
    │
    ├── /start → inline кнопка "Нова гра"
    ├── /join CODE → кнопка WebApp
    └── callback: new_room → створює кімнату, надсилає WebApp URL

Express Server
    ├── GET / → public/index.html (Telegram WebApp)
    └── GET /health → статус

Socket.io (WebSocket)
    ├── join_room      → гравець приєднується
    ├── choose_trump   → вибір козиря
    ├── show_ninth     → "на останню"
    ├── confirm_trump_last
    ├── play_card      → хід картою
    └── next_round     → наступний раунд
```

---

## 🔮 Наступні кроки (після базового деплою)

- [ ] Redis для збереження стану між рестартами
- [ ] Таймер ходу (30 сек)
- [ ] Автогра (бот-гравець) якщо хтось відключився
- [ ] Статистика / рейтинг гравців
- [ ] Анімації карт
