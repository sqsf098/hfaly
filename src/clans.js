// ─── Клани: створення, вступ, чат, топ ────────────────────────────────────
//   Клан = спільнота гравців з тегом. Створення коштує монет (сінк валюти).
//   Чат клану — останні 50 повідомлень у пам'яті клану (переживає рестарт).
//   Топ — за сумою перемог учасників.
const path = require('path');
const { atomicWriteJSON, readJSONSafe } = require('./store');
const { getWallet, saveWallets, playerWallets } = require('./wallets');
const { log } = require('./logger');

const CLANS_FILE = path.join(__dirname, '../data/clans.json');
const CREATE_COST = 1000;          // монет за створення
const MAX_MEMBERS = 30;
const MAX_CHAT = 50;

let clans = {}; // { tag: {tag, name, emoji, owner, members:[tgId], chat:[{tgId,name,text,ts}], createdAt} }

function load() {
  const res = readJSONSafe(CLANS_FILE);
  if (res && res.data) clans = res.data;
  const n = Object.keys(clans).length;
  if (n) log(`🛡 Кланів: ${n}`);
}
function save() { atomicWriteJSON(CLANS_FILE, clans); }

function clanOf(tgId) {
  const id = String(tgId);
  return Object.values(clans).find(c => c.members.includes(id)) || null;
}

function createClan(tgId, name, emoji) {
  const id = String(tgId);
  if (clanOf(id)) return { ok: false, error: 'Ти вже у клані (спершу вийди)' };
  name = String(name || '').trim().slice(0, 24);
  if (name.length < 3) return { ok: false, error: 'Назва: мінімум 3 символи' };
  const tag = name.toUpperCase().replace(/[^A-ZА-ЯІЇЄҐ0-9]/gi, '').slice(0, 5);
  if (tag.length < 2) return { ok: false, error: 'У назві мають бути літери/цифри' };
  if (clans[tag]) return { ok: false, error: `Тег [${tag}] зайнятий — інша назва` };
  const w = getWallet(id);
  if (w.coins < CREATE_COST) return { ok: false, error: `Створення: ${CREATE_COST} 💰` };
  w.coins -= CREATE_COST;
  saveWallets();
  clans[tag] = {
    tag, name, emoji: String(emoji || '🛡').slice(0, 4), owner: id,
    members: [id], chat: [], createdAt: Date.now(),
  };
  save();
  log(`🛡 КЛАН: ${id} створив [${tag}] ${name}`);
  return { ok: true, clan: publicClan(clans[tag]) };
}

function joinClan(tgId, tag) {
  const id = String(tgId);
  if (clanOf(id)) return { ok: false, error: 'Ти вже у клані' };
  const c = clans[String(tag || '').toUpperCase()];
  if (!c) return { ok: false, error: 'Клан не знайдено' };
  if (c.members.length >= MAX_MEMBERS) return { ok: false, error: 'Клан повний' };
  c.members.push(id);
  save();
  return { ok: true, clan: publicClan(c) };
}

function leaveClan(tgId) {
  const id = String(tgId);
  const c = clanOf(id);
  if (!c) return { ok: false, error: 'Ти не у клані' };
  c.members = c.members.filter(m => m !== id);
  if (c.members.length === 0) { delete clans[c.tag]; save(); return { ok: true, disbanded: true }; }
  if (c.owner === id) c.owner = c.members[0]; // лідерство переходить найстаршому
  save();
  return { ok: true };
}

function clanChat(tgId, text) {
  const id = String(tgId);
  const c = clanOf(id);
  if (!c) return { ok: false, error: 'Ти не у клані' };
  const clean = String(text || '').slice(0, 160).trim();
  if (!clean) return { ok: false, error: 'Порожнє повідомлення' };
  const w = getWallet(id);
  const msg = { tgId: id, name: (w.name || 'Гравець').slice(0, 24), text: clean, ts: Date.now() };
  c.chat.push(msg);
  while (c.chat.length > MAX_CHAT) c.chat.shift();
  save();
  return { ok: true, msg, members: c.members };
}

// Статистика: сума перемог/ігор учасників
function clanStats(c) {
  let wins = 0, games = 0;
  for (const m of c.members) {
    const w = playerWallets.get(m);
    if (w) { wins += w.wins || 0; games += w.gamesPlayed || 0; }
  }
  return { wins, games };
}

function publicClan(c, withChat = true) {
  const names = c.members.map(m => {
    const w = playerWallets.get(m);
    return { tgId: m, name: (w?.name || 'Гравець').slice(0, 24), wins: w?.wins || 0, isOwner: m === c.owner };
  });
  return {
    tag: c.tag, name: c.name, emoji: c.emoji, owner: c.owner,
    members: names, count: c.members.length, max: MAX_MEMBERS,
    ...clanStats(c),
    chat: withChat ? c.chat.slice(-MAX_CHAT) : undefined,
    createdAt: c.createdAt,
  };
}

// Топ кланів за перемогами
function topClans(limit = 20) {
  return Object.values(clans)
    .map(c => ({ tag: c.tag, name: c.name, emoji: c.emoji, count: c.members.length, ...clanStats(c) }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, limit);
}

function clanState(tgId) {
  const c = clanOf(tgId);
  return { my: c ? publicClan(c) : null, top: topClans(), createCost: CREATE_COST };
}

module.exports = { load, createClan, joinClan, leaveClan, clanChat, clanOf, clanState, topClans };
