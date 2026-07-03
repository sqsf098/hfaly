// ─── Точка входу: збирає все докупи. Логіка живе в модулях ──────────────
//   config.js   — налаштування і константи
//   logger.js   — логування
//   wallets.js  — баланси гравців (+ збереження на диск)
//   rooms.js    — кімнати і очистка
//   game.js     — правила гри
//   bot-ai.js   — мозок ботів
//   bots.js     — петля ходів ботів
//   sockets.js  — обробники подій від гравців
//   telegram.js — Telegram бот

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { PORT, APP_URL, AUTH } = require('./config');
const { log } = require('./logger');
const { loadWallets, flushWallets, getWallet } = require('./wallets');
const { loadEscrow, refundOrphans } = require('./escrow');
const { initBaseRooms, startCleanupLoop } = require('./rooms');
const sockets = require('./sockets');
const bots = require('./bots');
const { startBot } = require('./telegram');

// ── Глобальні запобіжники: сервер не падає від помилок ─────────────────
process.on('uncaughtException', (err) => log('FATAL: ' + (err?.stack || err)));
process.on('unhandledRejection', (reason) => log('unhandledRejection: ' + reason));

// ── HTTP + WebSocket ────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json({ limit: '8mb' })); // PNG-скіни приходять як dataURL
app.use((req, res, next) => { res.setHeader('ngrok-skip-browser-warning', 'true'); next(); });
// TON Connect manifest — генерується з APP_URL, щоб домен завжди збігався
app.get('/tonconnect-manifest.json', (_, res) => {
  res.json({
    url: APP_URL,
    name: 'хФали',
    iconUrl: `${APP_URL}/img/icon.png`,
    termsOfUseUrl: APP_URL,
    privacyPolicyUrl: APP_URL,
  });
});

app.use(express.static(path.join(__dirname, '../public')));
app.get('/health', (_, res) => res.json({ ok: true }));

// Ім'я бота для deep-link запрошень (t.me/<bot>?startapp=<roomId>).
// Резолвиться з BOT_USERNAME або через getMe після старту бота (нижче).
let botUsername = process.env.BOT_USERNAME || '';
app.get('/appinfo', (_, res) => res.json({ botUsername, groupLink: process.env.GROUP_LINK || '' }));

// ── Скіни: публічний каталог (клієнт малює з нього) + адмін-панель ──
const { loadSkins, getBackSkins, getCardSkins } = require('./skins');
loadSkins();
app.get('/api/skins', (_, res) => res.json({ backs: getBackSkins(), cards: getCardSkins() }));

// ADMIN_KEY: в .env; якщо нема (dev) — згенеруємо і покажемо в консолі
let ADMIN_KEY = process.env.ADMIN_KEY || '';
if (!ADMIN_KEY && process.env.NODE_ENV !== 'production') {
  ADMIN_KEY = 'dev-' + Math.random().toString(36).slice(2, 10);
  log(`👑 ADMIN_KEY не задано — тимчасовий ключ: ${ADMIN_KEY} (додай ADMIN_KEY у .env для постійного)`);
}
const { createAdminRouter } = require('./admin');
app.use('/api/admin', createAdminRouter({ io, adminKey: ADMIN_KEY }));
app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));

// Метадані NFT-карт (TEP-64, off-chain JSON). Посилання зашивається в NFT.
const { NFT_DECKS } = require('./ton');
app.get('/nft/:id.json', (req, res) => {
  const nft = NFT_DECKS.find(n => n.id === req.params.id);
  if (!nft) return res.status(404).json({ error: 'not found' });
  res.json({
    name: `хФали — ${nft.name}`,
    description: nft.desc,
    image: `${APP_URL}/img/nft/${nft.id}.png`,
    attributes: [
      { trait_type: 'deckId', value: nft.deck },
      { trait_type: 'rarity', value: nft.rarity },
      { trait_type: 'game', value: 'hFaly' },
    ],
  });
});

// ── Ініціалізація ───────────────────────────────────────────────────────
loadWallets();
loadEscrow();
// Кімнати не переживають рестарт — повертаємо «застряглі» депозити гравцям
const refunded = refundOrphans(getWallet);
if (refunded) { flushWallets(); log(`💸 Повернено ${refunded} депозитів після рестарту`); }
log(`🔐 Telegram auth: ${AUTH.REQUIRE ? "обов'язковий" : 'вимкнений (dev), у production з BOT_TOKEN увімкнеться сам'}`);
// Порожніх кімнат-заготовок більше немає: столи створюють гравці (зі ставкою
// і режимом), у списку видно, ХТО набирає гру. initBaseRooms() вимкнено.
startCleanupLoop();
sockets.registerHandlers(io);
bots.init({ io, broadcastState: sockets.broadcastState });
const bot = startBot();
if (bot && !botUsername) {
  bot.getMe().then(me => { botUsername = me.username; log(`🤖 Бот: @${botUsername} (deep-link запрошення активні)`); })
    .catch(() => {});
}

// ── Graceful shutdown ───────────────────────────────────────────────────
function shutdown(sig) {
  log(`${sig} — зберігаю дані і вимикаюсь...`);
  flushWallets();
  if (bot) { try { bot.stopPolling(); } catch (e) {} }
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

httpServer.listen(PORT, () => {
  log(`🚀 Сервер: http://localhost:${PORT}`);
  log(`🌐 APP_URL: ${APP_URL}`);
});
