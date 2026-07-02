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

const { PORT, APP_URL } = require('./config');
const { log } = require('./logger');
const { loadWallets, flushWallets } = require('./wallets');
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

app.use(express.json());
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
initBaseRooms();
startCleanupLoop();
sockets.registerHandlers(io);
bots.init({ io, broadcastState: sockets.broadcastState });
const bot = startBot();

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
