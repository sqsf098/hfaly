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

let custom = { backs: {}, cards: {} };

function loadSkins() {
  const res = readJSONSafe(CUSTOM_FILE);
  if (res && res.data) custom = { backs: res.data.backs || {}, cards: res.data.cards || {} };
  const n = Object.keys(custom.backs).length + Object.keys(custom.cards).length;
  if (n) log(`🎴 Кастомних скінів: ${n}`);
}

function saveSkins() { atomicWriteJSON(CUSTOM_FILE, custom); }

function getBackSkins() { return { ...BUILTIN_BACKS, ...custom.backs }; }
function getCardSkins() { return { ...BUILTIN_CARDS, ...custom.cards }; }

// Додати скін (адмін). def: back {name, img|css, border} / card {name, card, img|bg, color, emoji}
function addSkin(kind, id, def) {
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(id)) return { ok: false, error: 'ID: латиниця/цифри/_- (2-32)' };
  if (kind === 'back') {
    if (!def.name || (!def.img && !def.css)) return { ok: false, error: 'Потрібні name та img/css' };
    custom.backs[id] = { name: def.name, img: def.img, css: def.css, border: def.border || 'rgba(217,185,106,0.5)' };
  } else if (kind === 'card') {
    if (!def.name || !def.card) return { ok: false, error: 'Потрібні name та card (напр. A♠)' };
    if (!def.img && !def.bg) return { ok: false, error: 'Потрібен img або bg' };
    custom.cards[id] = { name: def.name, card: def.card, img: def.img, bg: def.bg, color: def.color, emoji: def.emoji };
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

module.exports = { loadSkins, getBackSkins, getCardSkins, addSkin, removeSkin };
