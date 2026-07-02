// ─── Гаманці гравців: баланс + збереження на диск ──────────────────────
const fs = require('fs');
const path = require('path');
const { STARTING_COINS } = require('./config');
const { log } = require('./logger');

const DATA_DIR = path.join(__dirname, '../data');
const WALLETS_FILE = path.join(DATA_DIR, 'wallets.json');

const playerWallets = new Map();

// Дефолтна схема гаманця. Нові поля додаються сюди — старі гаманці
// автоматично доповнюються при завантаженні (міграція нижче).
function defaultWallet() {
  return {
    coins: STARTING_COINS,
    gems: 0,                 // преміум-валюта 💎
    gamesPlayed: 0, wins: 0, totalWon: 0, totalLost: 0,
    ownedDecks: ['classic', 'dark', 'gold', 'neon'], // косметика (колоди)
    chests: {},              // { chestId: count } — нерозкриті скрині
    quests: [],              // щоденні квести [{id, type, target, progress, done, claimed}]
    questDay: null,          // рядок дати, коли квести видані
    freeChestAt: 0,          // timestamp коли можна взяти безкоштовну скриню
    tonAddress: null,        // прив'язаний TON-гаманець (raw, напр. "0:abc...")
    tonVerified: false,      // чи пройшов TON Connect proof
    nftDecks: [],            // NFT-колоди, підтверджені on-chain володінням
  };
}

// Доповнює гаманець відсутніми полями (для гравців зі старим форматом)
function migrateWallet(w) {
  const def = defaultWallet();
  for (const k of Object.keys(def)) {
    if (w[k] === undefined) w[k] = def[k];
  }
  return w;
}

function getWallet(tgId) {
  const key = String(tgId);
  if (!playerWallets.has(key)) {
    playerWallets.set(key, defaultWallet());
  }
  return migrateWallet(playerWallets.get(key));
}

function loadWallets() {
  try {
    if (fs.existsSync(WALLETS_FILE)) {
      const data = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) playerWallets.set(k, v);
      log(`💾 Завантажено ${playerWallets.size} гаманців`);
    }
  } catch (e) { log('Помилка завантаження гаманців: ' + e.message); }
}

let saveTimer = null;
function saveWallets() {
  if (saveTimer) return; // debounce — не частіше раз на 3 сек
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushWallets();
  }, 3000);
}

function flushWallets() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(WALLETS_FILE, JSON.stringify(Object.fromEntries(playerWallets), null, 1));
  } catch (e) { log('Помилка збереження гаманців: ' + e.message); }
}

module.exports = { playerWallets, getWallet, defaultWallet, migrateWallet, loadWallets, saveWallets, flushWallets };
