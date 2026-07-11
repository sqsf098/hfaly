// ─── Гаманці гравців: баланс + збереження на диск ──────────────────────
const fs = require('fs');
const path = require('path');
const { STARTING_COINS } = require('./config');
const { atomicWriteJSON, readJSONSafe } = require('./store');
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
    // Колекція (косметика; стартовий набір — демо, рідкісне падатиме зі скринь)
    backSkin: 'violet',                                   // активна сорочка
    ownedBackSkins: ['violet', 'navy', 'gold', 'crimson'],
    cardSkins: {},                                        // { 'A♠': 'AS_royal' }
    ownedCardSkins: ['AS_royal', 'QH_rose', 'JC_joker'],
    // Реферали: гра будується на «запроси друга»
    referredBy: null,     // tgId того, хто запросив
    refRewarded: false,   // чи виплачено запрошувачу за першу гру друга
    refCount: 0,          // скільки друзів привів (і вони зіграли)
    // Колесо Фортуни
    spins: 0,             // куплені спіни
    freeSpinAt: 0,        // коли доступний безкоштовний спін
    // Стрик входів
    streakDays: 0, streakDay: null,
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
    const res = readJSONSafe(WALLETS_FILE); // якщо основний файл битий — читає .bak
    if (res) {
      for (const [k, v] of Object.entries(res.data)) playerWallets.set(k, v);
      log(`💾 Завантажено ${playerWallets.size} гаманців${res.from.endsWith('.bak') ? ' (відновлено з бекапу!)' : ''}`);
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
    // Атомарний запис (tmp → rename) + .bak: обрив посеред запису не б'є файл
    atomicWriteJSON(WALLETS_FILE, Object.fromEntries(playerWallets));
  } catch (e) { log('Помилка збереження гаманців: ' + e.message); }
}

module.exports = { playerWallets, getWallet, defaultWallet, migrateWallet, loadWallets, saveWallets, flushWallets };
