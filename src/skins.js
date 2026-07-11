// ─── Каталог скінів: вбудовані + додані адміном (data/skins-custom.json) ──
// Адмін-панель додає PNG-скіни без зміни коду: файл пишеться в
// public/img/skins/, визначення — у skins-custom.json. Клієнт тягне
// об'єднаний каталог через GET /api/skins.
const path = require('path');
const { atomicWriteJSON, readJSONSafe } = require('./store');
const { log } = require('./logger');

const CUSTOM_FILE = path.join(__dirname, '../data/skins-custom.json');

// Вбудовані (мають візуальні означення і на клієнті в core.js)
const BUILTIN_BACKS = {
  violet:  { name: 'Фіолет',   css: 'linear-gradient(135deg,#9b6bff,#5a2f9e)', border: 'rgba(157,107,255,0.6)' },
  navy:    { name: 'Класика',  css: 'linear-gradient(135deg,#2c3e6b,#141d33)', border: 'rgba(120,150,220,0.5)' },
  gold:    { name: 'Золото',   css: 'linear-gradient(135deg,#c9a84c,#6d5117)', border: 'rgba(255,209,102,0.6)' },
  crimson: { name: 'Багрянець', css: 'linear-gradient(135deg,#8a1e2e,#38080f)', border: 'rgba(255,90,110,0.5)' },
};
const BUILTIN_CARDS = {
  AS_royal: { name: 'Королівський туз', card: 'A♠', emoji: '👑', bg: '#12101f', color: '#ffd166' },
  QH_rose:  { name: 'Дама-троянда',     card: 'Q♥', emoji: '🌹', bg: '#fff5f6', color: '#c0392b' },
  JC_joker: { name: 'Валет-жартун',     card: 'J♣', emoji: '🎭', bg: '#f4fff0', color: '#1b7a3a' },
};

// ── ПРЕМІУМ-каталог (продається за Telegram Stars ⭐) ─────────────────────
// rarity → ціна: common 100⭐ · rare 150⭐ · epic 200⭐
// Скіни видно ВСІМ за столом — сорочку в руках, скіни карт у дачці.
const STARS_BY_RARITY = { common: 100, rare: 150, epic: 200 };
// Гемами трохи дорожче за паритет (1💎≈5⭐): Stars — швидкий шлях,
// але гріндер може НАЗБИРАТИ на скін зі скринь і квестів
const GEMS_BY_RARITY = { common: 25, rare: 40, epic: 60 };

const PREMIUM_BACKS = {
  // «Меценат» — ЛИШЕ за донат (noSale: не продається і не падає зі скринь)
  patron_bk:  { name: 'Меценат ❤️', css: 'linear-gradient(135deg,#3d0d0d 0%,#8a1e2e 40%,#e3bf6a 130%)', border: 'rgba(255,209,102,0.95)', rarity: 'epic', noSale: true },
  galaxy_bk:  { name: 'Галактика', css: 'linear-gradient(135deg,#1a0b2e 0%,#3d1a78 45%,#7b2ff7 100%)', border: 'rgba(160,110,255,0.8)', rarity: 'epic' },
  royal_gold: { name: 'Королівське золото', css: 'linear-gradient(135deg,#f5d061,#a97c1a 55%,#5c3d00)', border: 'rgba(255,220,120,0.9)', rarity: 'epic' },
  ember_bk:   { name: 'Жар', css: 'linear-gradient(135deg,#ff6b35,#b62203 60%,#4a0d00)', border: 'rgba(255,140,80,0.8)', rarity: 'rare' },
  malachite:  { name: 'Малахіт', css: 'linear-gradient(135deg,#12b886,#087f5b 55%,#03352a)', border: 'rgba(60,220,170,0.7)', rarity: 'rare' },
};

const PREMIUM_CARDS = {
  // Мамки (козирні шістки) — найсильніша карта гри → epic
  S6_dragon:  { name: 'Мамка-дракон',   card: '6♠',  emoji: '🐉', bg: '#0d1f12', color: '#7bffa0', rarity: 'epic' },
  H6_phoenix: { name: 'Мамка-фенікс',   card: '6♥',  emoji: '🔥', bg: '#2a0b00', color: '#ffb347', rarity: 'epic' },
  D6_comet:   { name: 'Мамка-комета',   card: '6♦',  emoji: '☄️', bg: '#0b1030', color: '#9fc7ff', rarity: 'epic' },
  C6_hydra:   { name: 'Мамка-гідра',    card: '6♣',  emoji: '🐍', bg: '#101c08', color: '#b6ff6b', rarity: 'epic' },
  // Вальти (хвалящі) → epic
  JC_demon:   { name: 'Валет-демон',    card: 'J♣',  emoji: '😈', bg: '#1c0526', color: '#e07bff', rarity: 'epic' },
  JS_pirate:  { name: 'Валет-пірат',    card: 'J♠',  emoji: '🏴‍☠️', bg: '#0a0f1c', color: '#c8d6f0', rarity: 'epic' },
  JH_knight:  { name: 'Валет-лицар',    card: 'J♥',  emoji: '⚔️', bg: '#26060b', color: '#ff97a3', rarity: 'epic' },
  JD_jester:  { name: 'Валет-блазень',  card: 'J♦',  emoji: '🃏', bg: '#241a00', color: '#ffd166', rarity: 'epic' },
  // Тузи → rare
  AS_death:   { name: 'Туз-жнець',      card: 'A♠',  emoji: '💀', bg: '#0b0b10', color: '#cfd2e0', rarity: 'rare' },
  AH_cupid:   { name: 'Туз-купідон',    card: 'A♥',  emoji: '💘', bg: '#fff0f3', color: '#e0356b', rarity: 'rare' },
  AD_midas:   { name: 'Туз-мідас',      card: 'A♦',  emoji: '🪙', bg: '#1f1503', color: '#ffd700', rarity: 'rare' },
  AC_wolf:    { name: 'Туз-вовк',       card: 'A♣',  emoji: '🐺', bg: '#0e1512', color: '#a8c8b8', rarity: 'rare' },
  // Королі → rare
  KS_shadow:  { name: 'Король тіней',   card: 'K♠',  emoji: '🌑', bg: '#08070f', color: '#8a7fd4', rarity: 'rare' },
  KH_lion:    { name: 'Король-лев',     card: 'K♥',  emoji: '🦁', bg: '#2b1300', color: '#ffb85c', rarity: 'rare' },
  KD_pharaoh: { name: 'Король-фараон',  card: 'K♦',  emoji: '🏛️', bg: '#152238', color: '#e8d28a', rarity: 'rare' },
  KC_viking:  { name: 'Король-вікінг',  card: 'K♣',  emoji: '🪓', bg: '#101a1c', color: '#9fd8e0', rarity: 'rare' },
  // Дами → rare
  QS_witch:   { name: 'Дама-відьма',    card: 'Q♠',  emoji: '🔮', bg: '#160a24', color: '#c99aff', rarity: 'rare' },
  QH_siren:   { name: 'Дама-сирена',    card: 'Q♥',  emoji: '🧜‍♀️', bg: '#03222e', color: '#7fe3ff', rarity: 'rare' },
  QD_ice:     { name: 'Крижана цариця', card: 'Q♦',  emoji: '❄️', bg: '#eaf6ff', color: '#1a6fb5', rarity: 'rare' },
  QC_panther: { name: 'Дама-пантера',   card: 'Q♣',  emoji: '🐆', bg: '#151005', color: '#e8c46a', rarity: 'rare' },
  // Десятки та дрібнота → common
  T10S_storm: { name: 'Грозова десятка', card: '10♠', emoji: '⚡', bg: '#0e1420', color: '#ffe45c', rarity: 'common' },
  T10H_flame: { name: 'Полум\'яна десятка', card: '10♥', emoji: '🔥', bg: '#240800', color: '#ff8a5c', rarity: 'common' },
  T10D_gem:   { name: 'Діамантова десятка', card: '10♦', emoji: '💠', bg: '#eef8ff', color: '#2a7fd4', rarity: 'common' },
  T10C_oak:   { name: 'Дубова десятка', card: '10♣', emoji: '🌳', bg: '#f2fbef', color: '#2c7a3a', rarity: 'common' },
  N9S_raven:  { name: 'Ворон',          card: '9♠',  emoji: '🐦‍⬛', bg: '#101018', color: '#b8bece', rarity: 'common' },
  N9H_rose:   { name: 'Зів\'яла троянда', card: '9♥', emoji: '🥀', bg: '#1c0a10', color: '#e88a9a', rarity: 'common' },
  N9D_star:   { name: 'Зоряна дев\'ятка', card: '9♦', emoji: '⭐', bg: '#141020', color: '#ffd97a', rarity: 'common' },
  N9C_clover: { name: 'Щасливчик',      card: '9♣',  emoji: '🍀', bg: '#f0fff2', color: '#1b8a3a', rarity: 'common' },
  N7S_ghost:  { name: 'Привид',         card: '7♠',  emoji: '👻', bg: '#12121c', color: '#dfe6ff', rarity: 'common' },
  N8D_spark:  { name: 'Іскра',          card: '8♦',  emoji: '✨', bg: '#1c1608', color: '#ffe9a0', rarity: 'common' },
};

// ── «Королівська колода» — 36 векторних карт (tools/gen-royal-deck.js) ──
// Повна заміна вигляду колоди. Шістки (потенційні «мамки») — epic,
// A/K/Q/J — rare, решта — common. Дроп зі скринь ВИМКНЕНО (ексклюзив:
// тільки покупка/ринок) — див. noDrop у collections.js.
const ROYAL_CARDS = (() => {
  const suits = [['♠', 'S'], ['♣', 'C'], ['♥', 'H'], ['♦', 'D']];
  const ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const out = {};
  for (const [suit, key] of suits) {
    for (const rank of ranks) {
      const rarity = rank === '6' ? 'epic' : ['A', 'K', 'Q', 'J'].includes(rank) ? 'rare' : 'common';
      const red = suit === '♥' || suit === '♦';
      out[`royal_${rank}${key}`] = {
        name: `Роял ${rank}${suit}`, card: `${rank}${suit}`,
        img: `/img/skins/royal/${rank}${key}.svg`, rarity,
        // колір КУТОВИХ індексів, які рушій малює поверх арту:
        // яскраве золото / світлий рубін — читається на темному тлі карти
        color: red ? '#ff9aa4' : '#ffe9a8',
        pack: 'royal', // у списку скінів згортається в один «пак»
      };
    }
  }
  return out;
})();

// Проставляє ціну ⭐ за rarity (якщо не задана явно полем stars)
function withStars(defs) {
  const out = {};
  for (const [id, d] of Object.entries(defs)) {
    // noSale (донат-ексклюзиви) не отримують цін — їх не купиш напряму
    out[id] = {
      ...d,
      stars: d.noSale ? 0 : (d.stars || STARS_BY_RARITY[d.rarity] || 0),
      gems: d.noSale ? 0 : (d.gems || GEMS_BY_RARITY[d.rarity] || 0),
    };
  }
  return out;
}

let custom = { backs: {}, cards: {} };

function loadSkins() {
  const res = readJSONSafe(CUSTOM_FILE);
  if (res && res.data) custom = { backs: res.data.backs || {}, cards: res.data.cards || {} };
  const n = Object.keys(custom.backs).length + Object.keys(custom.cards).length;
  if (n) log(`🎴 Кастомних скінів: ${n}`);
}

function saveSkins() { atomicWriteJSON(CUSTOM_FILE, custom); }

function getBackSkins() { return { ...BUILTIN_BACKS, ...withStars(PREMIUM_BACKS), ...withStars(custom.backs) }; }
function getCardSkins() { return { ...BUILTIN_CARDS, ...withStars(PREMIUM_CARDS), ...withStars(ROYAL_CARDS), ...withStars(custom.cards) }; }

// Товар для покупки за ⭐: існує, має ціну і ще не належить гравцю
function getPurchasable(kind, id) {
  const def = (kind === 'back' ? getBackSkins() : getCardSkins())[id];
  if (!def || !def.stars || def.stars <= 0) return null;
  return def;
}

// Додати скін (адмін). def: back {name, img|css, border} / card {name, card, img|bg, color, emoji}
function addSkin(kind, id, def) {
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(id)) return { ok: false, error: 'ID: латиниця/цифри/_- (2-32)' };
  // stars/rarity: адмін може одразу виставити скін на продаж за ⭐
  const rarity = ['common', 'rare', 'epic'].includes(def.rarity) ? def.rarity : undefined;
  const stars = Number.isFinite(+def.stars) && +def.stars > 0 ? Math.floor(+def.stars) : undefined;
  if (kind === 'back') {
    if (!def.name || (!def.img && !def.css)) return { ok: false, error: 'Потрібні name та img/css' };
    custom.backs[id] = { name: def.name, img: def.img, css: def.css, border: def.border || 'rgba(217,185,106,0.5)', rarity, stars };
  } else if (kind === 'card') {
    if (!def.name || !def.card) return { ok: false, error: 'Потрібні name та card (напр. A♠)' };
    if (!def.img && !def.bg) return { ok: false, error: 'Потрібен img або bg' };
    custom.cards[id] = { name: def.name, card: def.card, img: def.img, bg: def.bg, color: def.color, emoji: def.emoji, rarity, stars };
  } else return { ok: false, error: 'kind: back|card' };
  saveSkins();
  return { ok: true };
}

function removeSkin(kind, id) {
  const bag = kind === 'back' ? custom.backs : custom.cards;
  if (!bag[id]) return { ok: false, error: 'Кастомного скіна немає (вбудовані видалити не можна)' };
  delete bag[id];
  saveSkins();
  return { ok: true };
}

module.exports = { loadSkins, getBackSkins, getCardSkins, getPurchasable, addSkin, removeSkin };
