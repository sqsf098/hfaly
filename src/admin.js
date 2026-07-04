// ─── Адмін-панель: REST API (захищено ключем ADMIN_KEY) ──────────────────
// UI: public/admin.html (відкривається на /admin). Кожен запит несе
// заголовок x-admin-key. Всі дії пишуться в лог сервера.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { playerWallets, getWallet, saveWallets, flushWallets } = require('./wallets');
const { rooms } = require('./rooms');
const { releaseDeposit } = require('./escrow');
const { getBackSkins, getCardSkins, addSkin, removeSkin } = require('./skins');
const { atomicWriteJSON, readJSONSafe } = require('./store');
const { log } = require('./logger');

const SKIN_IMG_DIR = path.join(__dirname, '../public/img/skins');
const TOURN_FILE = path.join(__dirname, '../data/tournaments.json');

function createAdminRouter({ io, adminKey }) {
  const r = express.Router();

  // ── Авторизація ─────────────────────────────────────────────
  r.use((req, res, next) => {
    if (!adminKey) return res.status(403).json({ error: 'ADMIN_KEY не задано — панель вимкнена' });
    if (req.get('x-admin-key') !== adminKey) return res.status(401).json({ error: 'Невірний ключ' });
    next();
  });

  const sendWalletIfOnline = (tgId) => {
    // якщо гравець онлайн — миттєво оновлюємо його баланс на екрані
    for (const [, s] of io.sockets.sockets) {
      if (s.data && s.data.tgId === String(tgId)) { s.emit('wallet', getWallet(tgId)); return; }
    }
  };

  // ── Огляд ────────────────────────────────────────────────────
  r.get('/stats', (_, res) => {
    let coins = 0, gems = 0, games = 0;
    for (const w of playerWallets.values()) { coins += w.coins || 0; gems += w.gems || 0; games += w.gamesPlayed || 0; }
    res.json({
      players: playerWallets.size,
      totalCoins: coins, totalGems: gems, totalGames: games,
      rooms: [...rooms.values()].map(rm => ({ id: rm.id, mode: rm.mode, phase: rm.phase, players: rm.players.length, pot: rm.pot || 0 })),
    });
  });

  // ── Гравці ───────────────────────────────────────────────────
  r.get('/players', (req, res) => {
    const q = String(req.query.q || '').toLowerCase();
    const list = [...playerWallets.entries()]
      .map(([id, w]) => ({ tgId: id, name: w.name || '', coins: w.coins, gems: w.gems, games: w.gamesPlayed, wins: w.wins,
        backSkin: w.backSkin, ownedBackSkins: w.ownedBackSkins, ownedCardSkins: w.ownedCardSkins }))
      .filter(p => !q || p.tgId.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 100);
    res.json(list);
  });

  // Нарахувати/списати валюту: {tgId, coins?, gems?}
  r.post('/grant', (req, res) => {
    const { tgId, coins = 0, gems = 0 } = req.body || {};
    if (!tgId) return res.status(400).json({ error: 'tgId обовʼязковий' });
    const w = getWallet(String(tgId));
    w.coins = Math.max(0, (w.coins || 0) + Number(coins || 0));
    w.gems = Math.max(0, (w.gems || 0) + Number(gems || 0));
    saveWallets(); flushWallets();
    sendWalletIfOnline(tgId);
    log(`👑 ADMIN: ${tgId} ${coins >= 0 ? '+' : ''}${coins}💰 ${gems >= 0 ? '+' : ''}${gems}💎 → ${w.coins}/${w.gems}`);
    res.json({ ok: true, coins: w.coins, gems: w.gems });
  });

  // ── Скіни ────────────────────────────────────────────────────
  r.get('/skins', (_, res) => res.json({ backs: getBackSkins(), cards: getCardSkins() }));

  // Додати скін. PNG приходить як dataURL (imgData) → пишемо в /img/skins/<id>.png
  // body: {kind:'back'|'card', id, name, card?, imgData?, css?, bg?, color?, emoji?, grantAll?}
  r.post('/skins', (req, res) => {
    const { kind, id, name, card, imgData, css, bg, color, emoji, grantAll } = req.body || {};
    let img;
    if (imgData) {
      const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(imgData);
      if (!m) return res.status(400).json({ error: 'imgData: очікую dataURL png/jpg/webp' });
      if (!fs.existsSync(SKIN_IMG_DIR)) fs.mkdirSync(SKIN_IMG_DIR, { recursive: true });
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const file = `${id}.${ext}`;
      fs.writeFileSync(path.join(SKIN_IMG_DIR, file), Buffer.from(m[2], 'base64'));
      img = `/img/skins/${file}`;
    }
    const result = addSkin(kind, id, { name, card, img, css, bg, color, emoji });
    if (!result.ok) return res.status(400).json(result);
    if (grantAll) {
      const field = kind === 'back' ? 'ownedBackSkins' : 'ownedCardSkins';
      for (const w of playerWallets.values()) { w[field] = w[field] || []; if (!w[field].includes(id)) w[field].push(id); }
      saveWallets(); flushWallets();
    }
    log(`👑 ADMIN: новий скін ${kind}/${id} «${name}»${grantAll ? ' (видано всім)' : ''}`);
    res.json({ ok: true, img });
  });

  r.delete('/skins/:kind/:id', (req, res) => {
    const result = removeSkin(req.params.kind, req.params.id);
    if (!result.ok) return res.status(400).json(result);
    log(`👑 ADMIN: видалено скін ${req.params.kind}/${req.params.id}`);
    res.json({ ok: true });
  });

  // Видати скін конкретному гравцю
  r.post('/skin-grant', (req, res) => {
    const { tgId, kind, skinId } = req.body || {};
    const catalog = kind === 'back' ? getBackSkins() : getCardSkins();
    if (!catalog[skinId]) return res.status(400).json({ error: 'Скіна не існує' });
    const w = getWallet(String(tgId));
    const field = kind === 'back' ? 'ownedBackSkins' : 'ownedCardSkins';
    w[field] = w[field] || [];
    if (!w[field].includes(skinId)) w[field].push(skinId);
    saveWallets(); flushWallets();
    sendWalletIfOnline(tgId);
    log(`👑 ADMIN: скін ${kind}/${skinId} → гравцю ${tgId}`);
    res.json({ ok: true });
  });

  // Міграція: залити гаманці зі старого сервера (тіло = вміст wallets.json).
  // Існуючі гравці НЕ перезаписуються, якщо в них уже більший прогрес.
  r.post('/import-wallets', (req, res) => {
    const data = req.body || {};
    let imported = 0, skipped = 0;
    for (const [id, w] of Object.entries(data)) {
      if (!w || typeof w !== 'object') continue;
      const existing = playerWallets.get(id);
      if (existing && (existing.gamesPlayed || 0) >= (w.gamesPlayed || 0) && (existing.coins || 0) >= (w.coins || 0)) { skipped++; continue; }
      playerWallets.set(id, w);
      imported++;
    }
    flushWallets();
    log(`👑 ADMIN: імпорт гаманців — ${imported} залито, ${skipped} пропущено`);
    res.json({ ok: true, imported, skipped, total: playerWallets.size });
  });

  // ── Кімнати ──────────────────────────────────────────────────
  r.get('/rooms', (_, res) => {
    res.json([...rooms.values()].map(rm => ({
      id: rm.id, mode: rm.mode || 'hfaly', phase: rm.phase, host: rm.hostName || '',
      deposit: rm.deposit || 0, pot: rm.pot || 0,
      players: rm.players.map(p => ({ name: p.name, isBot: !!p.isBot, tgId: p.tgId })),
    })));
  });

  // Закрити кімнату: повертаємо депозити реальним гравцям, стіл зникає
  r.post('/rooms/close', (req, res) => {
    const { roomId } = req.body || {};
    const room = rooms.get(roomId);
    if (!room) return res.status(404).json({ error: 'Кімнати немає' });
    let refunded = 0;
    if (room.deposit > 0) {
      for (const p of room.players) {
        if (p.isBot || !p.tgId || String(p.tgId).startsWith('bot')) continue;
        const w = getWallet(p.tgId);
        w.coins += room.deposit; refunded++;
        releaseDeposit(p.tgId, room.id);
        const s = p.socketId && io.sockets.sockets.get(p.socketId);
        if (s) s.emit('wallet', w);
      }
      saveWallets(); flushWallets();
    }
    io.to(roomId).emit('error', { message: 'Кімнату закрито адміністратором. Депозит повернено.' });
    rooms.delete(roomId);
    log(`👑 ADMIN: кімнату ${roomId} закрито, повернень: ${refunded}`);
    res.json({ ok: true, refunded });
  });

  // ── Турніри (базова версія: створення й список анонсів) ─────
  r.get('/tournaments', (_, res) => {
    const data = readJSONSafe(TOURN_FILE);
    res.json((data && data.data) || []);
  });
  r.post('/tournaments', (req, res) => {
    const { title, startAt, deposit = 0, mode = 'hfaly', prize = '' } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title обовʼязковий' });
    const data = readJSONSafe(TOURN_FILE);
    const list = (data && data.data) || [];
    const t = { id: 'T' + Date.now().toString(36).toUpperCase(), title, startAt: startAt || null, deposit, mode, prize, createdAt: Date.now() };
    list.push(t);
    atomicWriteJSON(TOURN_FILE, list);
    log(`👑 ADMIN: турнір «${title}»`);
    res.json({ ok: true, tournament: t });
  });

  return r;
}

module.exports = { createAdminRouter };
