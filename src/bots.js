// ─── Петля ходів ботів. init() викликається з server.js ────────────────
const { rooms, resetBaseRoom } = require('./rooms');
const { chooseTrump, confirmTrumpFromLast, playCard, endRound, advanceRound } = require('./game');
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
  _step(roomId, 0);
}

function _step(roomId, depth) {
  if (depth > 50) return; // запобіжник від нескінченної петлі
  const room = rooms.get(roomId);
  if (!room) return;

  const phase = room.phase;

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
      const card = botChooseCard(hand, r.trick, r.trump, idx, (idx + 2) % 4);
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
            }, 2000);
          }
        }, 1400);
      } else {
        setTimeout(() => {
          const r2 = rooms.get(roomId);
          if (!r2) return;
          r2.trick = [];
          r2.currentPlayer = result.trickWinner;
          broadcastState(r2);
          _step(roomId, depth + 1);
        }, 1200);
      }
    }, BOT_THINK_MS);
  }
}

module.exports = { init, runBots, isBot };
