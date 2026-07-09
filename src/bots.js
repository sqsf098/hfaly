// ─── Петля ходів ботів. init() викликається з server.js ────────────────
const { rooms, resetBaseRoom } = require('./rooms');
const { chooseTrump, confirmTrumpFromLast, playCard, endRound, advanceRound, discardThree } = require('./game');
const { botChooseTrump, botChooseCard } = require('./bot-ai');
const { BOT_THINK_MS } = require('./config');

let io = null;
let broadcastState = null;

function init(deps) {
  io = deps.io;
  broadcastState = deps.broadcastState;
}

function isBot(room, idx) {
  return room.players[idx]?.isBot === true;
}

// Головний вхід: запускає ходи ботів якщо зараз їхня черга
function runBots(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.phase === 'waiting' || room.phase === 'round_end') return;
  if (room.mode === 'durak' && room.durak) { _durakStep(roomId, 0); return; }
  _step(roomId, 0);
}

// ── Простий бот для Дурака ─────────────────────────────────────────────
const DPOW = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };
const dcost = (c, trump) => DPOW[c.rank] + (c.suit === trump ? 20 : 0); // чим менше — тим охочіше скидаємо
function _durakStep(roomId, depth) {
  if (depth > 60) return;
  const room = rooms.get(roomId);
  if (!room || !room.durak || room.durak.finished) return;
  const durak = require('./durak');
  const d = room.durak;

  // хто з ботів може діяти? захисник з непобитими картами / атакер / підкидачі
  let actor = null, plan = null;
  const uncovered = d.table.filter(p => !p.d);
  if (uncovered.length && isBot(room, d.defender) && !d.out.includes(d.defender)) {
    actor = d.defender;
    const hand = room.hands[actor];
    // мінімальна карта, що б'є першу непобиту
    const target = d.table.findIndex(p => !p.d);
    const options = hand.filter(c => durak.beats(c, d.table[target].a, d.trump))
      .sort((a, b) => dcost(a, d.trump) - dcost(b, d.trump));
    plan = options.length ? { action: 'defend', cardId: options[0].id, targetIdx: target } : { action: 'take' };
  } else {
    // атака/підкид ботами
    for (const p of room.players) {
      if (!p.isBot || p.index === d.defender || d.out.includes(p.index)) continue;
      const idx = p.index, hand = room.hands[idx];
      if (d.table.length === 0) {
        if (idx !== d.attacker) continue;
        const c = [...hand].sort((a, b) => dcost(a, d.trump) - dcost(b, d.trump))[0];
        if (c) { actor = idx; plan = { action: 'attack', cardId: c.id }; break; }
      } else if (!d.took && d.table.every(x => x.d)) {
        // підкинути дешеву карту відповідного номіналу або «бито»
        const ranks = new Set(); d.table.forEach(x => { ranks.add(x.a.rank); if (x.d) ranks.add(x.d.rank); });
        const c = hand.filter(x => ranks.has(x.rank) && x.suit !== d.trump)
          .sort((a, b) => dcost(a, d.trump) - dcost(b, d.trump))[0];
        if (c && room.hands[d.defender].length > 0) { actor = idx; plan = { action: 'attack', cardId: c.id }; break; }
        if (!d.passed.has(idx)) { actor = idx; plan = { action: 'pass' }; break; }
      }
    }
  }
  if (actor === null || !plan) return; // черга людини

  setTimeout(() => {
    const r = rooms.get(roomId);
    if (!r || !r.durak || r.durak.finished) return;
    let res;
    if (plan.action === 'attack') res = durak.attack(r, actor, plan.cardId);
    else if (plan.action === 'defend') res = durak.defend(r, actor, plan.cardId, plan.targetIdx);
    else if (plan.action === 'take') res = durak.take(r, actor);
    else res = durak.pass(r, actor);
    if (!res?.ok) return;
    broadcastState(r);
    if (res.auto?.gameOver) { require('./sockets').durakPayout(r); return; }
    _durakStep(roomId, depth + 1);
  }, BOT_THINK_MS);
}

function _step(roomId, depth) {
  if (depth > 50) return; // запобіжник від нескінченної петлі
  const room = rooms.get(roomId);
  if (!room) return;

  const phase = room.phase;

  // ── Хрестовець: боти скидають по 3 найслабші карти ────────────
  if (phase === 'discard') {
    const bot = room.players.find(p => p.isBot && !room.discardDone.includes(p.index));
    if (!bot) return; // всі боти скинули — чекаємо людей
    setTimeout(() => {
      const r = rooms.get(roomId);
      if (!r || r.phase !== 'discard') { _step(roomId, depth + 1); return; }
      const b = r.players.find(p => p.isBot && !r.discardDone.includes(p.index));
      if (!b) return;
      const RANK_P = { '6': 1, '7': 2, '8': 3, '9': 4, '10': 5, 'Q': 6, 'K': 7, 'A': 8, 'J': 20 };
      // валети — сила, їх тримаємо; J♣ скидати заборонено правилами
      let picks = [...r.hands[b.index]]
        .filter(c => c.id !== 'J♣')
        .sort((a, c) => (RANK_P[a.rank] || 0) - (RANK_P[c.rank] || 0))
        .slice(0, 3);
      const res = discardThree(r, b.index, picks.map(c => c.id));
      if (res.ok) {
        broadcastState(r);
        if (res.allDone) io.to(roomId).emit('discards_done', { boaster: r.boaster, name: r.players[r.boaster]?.name });
      }
      _step(roomId, depth + 1);
    }, BOT_THINK_MS * 0.8);
    return;
  }

  // ── Бот обирає козир ──────────────────────────────────────────
  if (phase === 'choose_trump' || phase === 'show9') {
    if (!isBot(room, room.boaster)) return; // людина — чекаємо її
    setTimeout(() => {
      const r = rooms.get(roomId);
      if (!r || (r.phase !== 'choose_trump' && r.phase !== 'show9')) return;
      const suit = botChooseTrump(r.hands[r.boaster]);
      if (r.phase === 'show9') confirmTrumpFromLast(r, suit);
      else chooseTrump(r, suit);
      io.to(roomId).emit('bot_trump', { name: r.players[r.boaster].name, suit });
      broadcastState(r);
      _step(roomId, depth + 1);
    }, BOT_THINK_MS);
    return;
  }

  // ── Бот кидає карту ───────────────────────────────────────────
  if (phase === 'play') {
    const cp = room.currentPlayer;
    if (cp === undefined || cp === null) return;
    if (!isBot(room, cp)) return; // черга людини

    setTimeout(() => {
      const r = rooms.get(roomId);
      if (!r || r.phase !== 'play') return;
      const idx = r.currentPlayer;
      if (!isBot(r, idx)) return;

      const hand = r.hands[idx];
      if (!hand || hand.length === 0) return;
      // Хрестовець — кожен за себе (партнера немає, -1 вимикає командну логіку)
      const partner = r.mode === 'khrest' ? -1 : (idx + 2) % 4;
      const card = botChooseCard(hand, r.trick, r.trump, idx, partner);
      if (!card) return;

      const result = playCard(r, idx, card.id);
      if (!result.ok) return;
      broadcastState(r);

      if (!result.trickDone) { _step(roomId, depth + 1); return; }

      io.to(roomId).emit('trick_won', {
        winner: result.trickWinner,
        winnerName: r.players[result.trickWinner]?.name,
      });

      if (result.roundDone) {
        setTimeout(() => {
          const r2 = rooms.get(roomId);
          if (!r2) return;
          const roundResult = endRound(r2);
          broadcastState(r2);
          io.to(roomId).emit('round_ended', {
            ...roundResult, scores: r2.scores,
            players: r2.players.map(p => p.name),
          });
          if (roundResult.gameOver) {
            require('./sockets').distributeWinnings(r2); // хтось набрав 24
            return;
          }
          // Стіл без людей продовжує сам
          const hasHuman = r2.players.some(p => !p.isBot && p.online !== false);
          if (!hasHuman) {
            setTimeout(() => {
              const r3 = rooms.get(roomId);
              if (!r3 || r3.phase !== 'round_end') return;
              advanceRound(r3);
              broadcastState(r3);
              runBots(roomId);
            }, 1400);
          }
        }, 1050);
      } else {
        setTimeout(() => {
          const r2 = rooms.get(roomId);
          if (!r2) return;
          r2.trick = [];
          r2.currentPlayer = result.trickWinner;
          broadcastState(r2);
          _step(roomId, depth + 1);
        }, 850);
      }
    }, BOT_THINK_MS);
  }
}

module.exports = { init, runBots, isBot };
