// ─── src/game.js — Повна логіка гри хФали ───────────────────────────────────

const SUITS = ['♣', '♠', '♥', '♦'];
const RANKS = ['6', '7', '8', '9', '10', 'Q', 'K', 'A'];
const JACK = 'J';

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    deck.push({ suit, rank: JACK, id: `J${suit}` });
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}${suit}` });
    }
  }
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardPower(card, trump) {
  // «Мамка» — козирна 6 — НАЙСИЛЬНІША карта гри, б'є навіть валетів
  if (card.rank === '6' && card.suit === trump) return 45;
  if (card.rank === JACK) {
    return { '♣': 40, '♠': 39, '♥': 38, '♦': 37 }[card.suit];
  }
  if (card.suit === trump) {
    return { 'A': 35, 'K': 34, 'Q': 33, '10': 32, '9': 31, '8': 30, '7': 29 }[card.rank];
  }
  return { 'A': 14, 'K': 13, 'Q': 12, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6 }[card.rank] ?? 0;
}

function isTrump(card, trump) {
  return card.rank === JACK || card.suit === trump;
}

function trickWinner(trick, trump) {
  let best = 0;
  for (let i = 1; i < trick.length; i++) {
    const a = trick[best].card, b = trick[i].card;
    const aT = isTrump(a, trump), bT = isTrump(b, trump);
    if (aT && !bT) continue;
    if (!aT && bT) { best = i; continue; }
    if (aT && bT) { if (cardPower(b, trump) > cardPower(a, trump)) best = i; continue; }
    if (b.suit === trick[0].card.suit && cardPower(b, trump) > cardPower(a, trump)) best = i;
  }
  return trick[best].playerIndex;
}

function canPlayCard(card, hand, trick, trump) {
  if (trick.length === 0) return true;
  const led = trick[0].card;
  const ledTrump = isTrump(led, trump);
  if (ledTrump) {
    const hasTrump = hand.some(c => isTrump(c, trump));
    if (hasTrump) return isTrump(card, trump);
    return true;
  } else {
    const hasSuit = hand.some(c => !isTrump(c, trump) && c.suit === led.suit);
    if (hasSuit) return !isTrump(card, trump) && card.suit === led.suit;
    return true;
  }
}

// Ціль гри: перша команда, що набере стільки ШТРАФНИХ очок — програла.
const TARGET_SCORE = 24;

function calcRoundScores(trickCount, boasterIndex) {
  const partnerIndex = (boasterIndex + 2) % 4;
  const boasterTeam = [boasterIndex, partnerIndex];
  const otherTeam = [(boasterIndex + 1) % 4, (boasterIndex + 3) % 4];

  const boasterTricks = trickCount[boasterIndex] + trickCount[partnerIndex];
  const otherTricks = 9 - boasterTricks;
  const boasterWon = boasterTricks >= 5; // хвалящий мусить взяти ≥5 дачок

  // Перетягування каната: штрафні очки лише ДОДАЮТЬСЯ (ніколи не мінус).
  // Штраф отримує та команда, що програла раунд. Хто перший набере 24 — програв гру.
  let boasterPenalty = 0, otherPenalty = 0;
  if (boasterWon) {
    // хвалящий виконав — штраф суперникам за недобір дачок
    if (otherTricks === 0) otherPenalty = 12;
    else if (otherTricks === 1) otherPenalty = 6;
    else otherPenalty = 1;
  } else {
    // хвалящий провалив — штраф його команді
    if (boasterTricks === 0) boasterPenalty = 24;      // 0 дачок → одразу програш
    else if (boasterTricks === 1) boasterPenalty = 12;
    else boasterPenalty = 6;                            // 2..4 дачки
  }

  const deltas = [0, 0, 0, 0];
  for (const p of boasterTeam) deltas[p] = boasterPenalty;
  for (const p of otherTeam) deltas[p] = otherPenalty;

  return { deltas, boasterTricks, otherTricks, boasterPenalty, otherPenalty };
}

// ─── Стан кімнати ─────────────────────────────────────────────────────────────

// mode: 'hfaly' (2v2, 4 гравці) | 'khrest' (Хрестовець: кожен за себе, 3 гравці)
function createRoom(roomId, mode = 'hfaly', playersCount) {
  // durak: 2-4 гравці (обирає творець), khrest: 3, hfaly: 4
  const n = mode === 'khrest' ? 3
    : mode === 'durak' ? Math.min(4, Math.max(2, +playersCount || 2))
    : 4;
  return {
    id: roomId,
    mode,
    maxPlayers: n,
    phase: 'waiting',      // waiting | discard(khrest) | choose_trump | play | round_end
    players: [],           // [{id, name, telegramId, index}]
    scores: Array(n).fill(0),
    roundNum: 0,
    boaster: null,
    dealer: null,
    hands: Array.from({ length: n }, () => []),
    trump: null,
    currentPlayer: null,
    trick: [],
    trickCount: Array(n).fill(0),
    ninthCard: null,
    partialHands: null,
    restDeck: null,
    discardDone: [],       // khrest: хто вже скинув 3 карти
    log: [],
    createdAt: Date.now(),
  };
}

function startRound(room) {
  if (room.mode === 'khrest') return startRoundKhrest(room);
  const deck = shuffle(buildDeck());

  // Знімання колоди — гравець зліва від здаючого
  const cutterIndex = (room.dealer + 3) % 4;
  const cutAt = Math.floor(deck.length / 2) + Math.floor(Math.random() * 6) - 3;
  const cut = [...deck.slice(cutAt), ...deck.slice(0, cutAt)];

  // Роздаємо по 3
  const partial = [
    cut.slice(0, 3),
    cut.slice(3, 6),
    cut.slice(6, 9),
    cut.slice(9, 12),
  ];
  const rest = cut.slice(12);

  room.hands = partial.map(h => [...h]);
  room.partialHands = partial.map(h => [...h]);
  room.restDeck = rest;
  room.trick = [];
  room.trickCount = [0, 0, 0, 0];
  room.trump = null;
  room.ninthCard = null;
  room.phase = 'choose_trump';
  room.log.push(`--- Раунд ${room.roundNum}: хвалящий ${room.players[room.boaster]?.name}, здає ${room.players[room.dealer]?.name} ---`);
}

// ── ХРЕСТОВЕЦЬ: 3 гравці, 36 карт по 12; кожен скидає 3 → по 9.
// Хвалящий — у кого J♣ (оголошується ПІСЛЯ скидання), він обирає козир.
// Норма дачок: хвалящий 5, решта по 2. Штраф — КОЖНОМУ окремо, 24 = програв.
function startRoundKhrest(room) {
  const deck = shuffle(buildDeck());
  room.hands = [deck.slice(0, 12), deck.slice(12, 24), deck.slice(24, 36)].map(h => [...h]);
  room.partialHands = null;
  room.restDeck = null;
  room.trick = [];
  room.trickCount = [0, 0, 0];
  room.trump = null;
  room.ninthCard = null;
  room.discardDone = [];
  room.currentPlayer = null;
  room.boaster = room.hands.findIndex(h => h.some(c => c.id === 'J♣'));
  room.phase = 'discard';
  room.log.push(`--- Раунд ${room.roundNum} (Хрестовець): кожен скидає по 3 карти ---`);
}

function discardThree(room, playerIndex, cardIds) {
  if (room.mode !== 'khrest' || room.phase !== 'discard') return { ok: false, error: 'Зараз не фаза скидання' };
  if (room.discardDone.includes(playerIndex)) return { ok: false, error: 'Ти вже скинув 3 карти' };
  if (!Array.isArray(cardIds) || new Set(cardIds).size !== 3) return { ok: false, error: 'Обери рівно 3 карти' };
  if (cardIds.includes('J♣')) return { ok: false, error: 'Хрестового валета скидати не можна' };
  const hand = room.hands[playerIndex];
  if (!cardIds.every(id => hand.some(c => c.id === id))) return { ok: false, error: 'Цих карт немає в руці' };

  room.hands[playerIndex] = hand.filter(c => !cardIds.includes(c.id));
  room.discardDone.push(playerIndex);
  room.log.push(`${room.players[playerIndex]?.name} скинув 3 карти`);

  if (room.discardDone.length === room.maxPlayers) {
    room.phase = 'choose_trump'; // тепер хвалящий (J♣) відкривається і обирає козир
    room.log.push(`Хвалящий — ${room.players[room.boaster]?.name} (J♣)`);
    return { ok: true, allDone: true };
  }
  return { ok: true, allDone: false };
}

function dealFullHands(room) {
  const rest = room.restDeck;
  room.hands = room.partialHands.map((h, i) => [...h, ...rest.slice(i * 6, i * 6 + 6)]);
  const firstPlayer = (room.dealer + 1) % 4;
  room.currentPlayer = firstPlayer;
  room.phase = 'play';
}

function chooseTrump(room, suit) {
  room.trump = suit;
  if (room.mode === 'khrest') {
    room.currentPlayer = room.boaster; // хвалящий і ходить першим
    room.phase = 'play';
  } else {
    dealFullHands(room);
  }
  room.log.push(`Козир: ${suit}`);
}

function showNinthCard(room) {
  const rest = room.restDeck;
  room.ninthCard = rest[rest.length - 1];
  // "На останню": відкрита карта визначає козир автоматично — усі її бачать
  room.trump = room.ninthCard.suit;
  dealFullHands(room);
  room.log.push(`На останню! Відкрита ${room.ninthCard.rank}${room.ninthCard.suit} — козир ${room.trump}`);
}

// Залишено для сумісності; більше не використовується (масть береться з відкритої карти)
function confirmTrumpFromLast(room, suit) {
  room.trump = suit;
  dealFullHands(room);
  room.log.push(`Козир (остання): ${suit}`);
}

function playCard(room, playerIndex, cardId) {
  if (room.currentPlayer !== playerIndex) return { ok: false, error: 'Не твій хід' };
  if (room.phase !== 'play') return { ok: false, error: 'Зараз не фаза гри' };

  const hand = room.hands[playerIndex];
  const card = hand.find(c => c.id === cardId);
  if (!card) return { ok: false, error: 'Картки немає в руці' };
  if (!canPlayCard(card, hand, room.trick, room.trump)) {
    return { ok: false, error: 'Така карта не дозволена за правилами' };
  }

  room.hands[playerIndex] = hand.filter(c => c.id !== cardId);
  room.trick.push({ playerIndex, card });
  room.log.push(`${room.players[playerIndex]?.name}: ${card.rank}${card.suit}`);

  const N = room.maxPlayers || 4;
  if (room.trick.length === N) {
    const winner = trickWinner(room.trick, room.trump);
    room.trickCount[winner]++;
    room.log.push(`Дачку взяв ${room.players[winner]?.name}`);

    // Взятка повна — нічий хід до очистки (закриває вікно "5-ї карти" і дедлок ботів)
    room.currentPlayer = null;

    const totalTricks = room.trickCount.reduce((a, b) => a + b);
    if (totalTricks === 9) {
      return { ok: true, trickDone: true, trickWinner: winner, roundDone: true };
    }
    return { ok: true, trickDone: true, trickWinner: winner, roundDone: false };
  }

  room.currentPlayer = (playerIndex + 1) % N;
  return { ok: true, trickDone: false };
}

function endRound(room) {
  if (room.mode === 'khrest') return endRoundKhrest(room);
  const result = calcRoundScores(room.trickCount, room.boaster);
  room.scores = room.scores.map((s, i) => s + result.deltas[i]);
  room.phase = 'round_end';

  // Рахунок команди = рахунок будь-якого її гравця (партнери завжди однакові)
  const teamA = room.scores[0]; // гравці 0 і 2
  const teamB = room.scores[1]; // гравці 1 і 3
  const gameOver = teamA >= TARGET_SCORE || teamB >= TARGET_SCORE;
  let winningTeam = null, losingTeam = null;
  if (gameOver) {
    // хто набрав більше штрафу (≥24) — програв
    if (teamA >= teamB) { losingTeam = [0, 2]; winningTeam = [1, 3]; }
    else { losingTeam = [1, 3]; winningTeam = [0, 2]; }
    room.phase = 'game_over';
  }
  room.log.push(`Раунд: хвалящий ${result.boasterTricks} дачок. Рахунок A:${teamA} B:${teamB}${gameOver ? ' — ГРА ЗАВЕРШЕНА' : ''}`);
  return { ...result, scores: room.scores, teamA, teamB, target: TARGET_SCORE, gameOver, winningTeam, losingTeam };
}

// Хрестовець: кожен сам за себе. Не взяв норму (5 хвалящому / 2 іншим) —
// +6 штрафу ОСОБИСТО. Хто перший набрав 24 — програв, двоє інших виграли.
function endRoundKhrest(room) {
  const required = room.trickCount.map((_, i) => i === room.boaster ? 5 : 2);
  const deltas = room.trickCount.map((took, i) => took >= required[i] ? 0 : 6);
  room.scores = room.scores.map((s, i) => s + deltas[i]);
  room.phase = 'round_end';

  const mx = Math.max(...room.scores);
  const gameOver = mx >= TARGET_SCORE;
  let loser = null, winners = null;
  if (gameOver) {
    loser = room.scores.indexOf(mx);
    winners = [0, 1, 2].filter(i => i !== loser);
    room.phase = 'game_over';
  }
  room.log.push(`Раунд: дачки ${room.trickCount.join('/')}, штрафи ${deltas.join('/')}${gameOver ? ' — ГРА ЗАВЕРШЕНА' : ''}`);
  return {
    mode: 'khrest', deltas, required, trickCount: [...room.trickCount],
    boaster: room.boaster, scores: room.scores, target: TARGET_SCORE,
    gameOver, loser, winners,
  };
}

function advanceRound(room) {
  if (room.mode === 'khrest') {
    room.roundNum++;      // хвалящий визначається новою роздачею (J♣)
    startRound(room);
    return;
  }
  room.boaster = (room.boaster + 1) % 4;
  room.dealer = (room.boaster + 2) % 4;
  room.roundNum++;
  startRound(room);
}

// Публічний стан для гравця (не показуємо чужі карти)
function publicState(room, viewerIndex) {
  return {
    phase: room.phase,
    mode: room.mode || 'hfaly',
    maxPlayers: room.maxPlayers || 4,
    roundNum: room.roundNum,
    // Хрестовець: до кінця скидання хвалящий (J♣) — таємниця
    boaster: (room.mode === 'khrest' && room.phase === 'discard') ? null : room.boaster,
    discardDone: room.discardDone || [],
    dealer: room.dealer,
    // skins — щоб суперники бачили ТВОЮ сорочку і твої скіни карт у дачці
    players: room.players.map(p => ({ name: p.name, index: p.index, skins: p.skins || null })),
    scores: room.scores,
    trump: room.trump,
    currentPlayer: room.currentPlayer,
    trick: room.trick,
    trickCount: room.trickCount,
    // 9-а карта ("на останню") — відкрита для ВСІХ гравців
    ninthCard: room.ninthCard,
    hand: room.hands[viewerIndex] ?? [],
    // Партіальні карти (перші 3) для вибору козиря — тільки свої
    partialHand: room.partialHands ? room.partialHands[viewerIndex] ?? [] : [],
    handSizes: room.hands.map((h, i) => i === viewerIndex ? null : h.length),
    log: room.log.slice(-20),
  };
}

module.exports = {
  createRoom, startRound, chooseTrump, showNinthCard,
  confirmTrumpFromLast, playCard, endRound, advanceRound, publicState,
  discardThree,
};
