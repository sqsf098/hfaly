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
  if (card.rank === JACK) {
    return { '♣': 40, '♠': 39, '♥': 38, '♦': 37 }[card.suit];
  }
  if (card.suit === trump) {
    return { '6': 36, 'A': 35, 'K': 34, 'Q': 33, '10': 32, '9': 31, '8': 30, '7': 29 }[card.rank];
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

function calcRoundScores(trickCount, boasterIndex) {
  const partnerIndex = (boasterIndex + 2) % 4;
  const boasterTeam = [boasterIndex, partnerIndex];
  const otherTeam = [(boasterIndex + 1) % 4, (boasterIndex + 3) % 4];

  const boasterTricks = trickCount[boasterIndex] + trickCount[partnerIndex];
  const otherTricks = 9 - boasterTricks;

  let bScore, oScore;
  if (boasterTricks >= 5) bScore = 1;
  else if (boasterTricks > 1) bScore = -6;
  else if (boasterTricks === 1) bScore = -12;
  else bScore = -24;

  if (otherTricks === 0) oScore = -12;
  else if (otherTricks === 1) oScore = -6;
  else oScore = -1;

  const deltas = [0, 0, 0, 0];
  for (const p of boasterTeam) deltas[p] = bScore;
  for (const p of otherTeam) deltas[p] = oScore;

  return { deltas, boasterTricks, otherTricks, bScore, oScore };
}

// ─── Стан кімнати ─────────────────────────────────────────────────────────────

function createRoom(roomId) {
  return {
    id: roomId,
    phase: 'waiting',      // waiting | choose_trump | show9 | play | round_end
    players: [],           // [{id, name, telegramId, index}]
    scores: [0, 0, 0, 0],
    roundNum: 0,
    boaster: null,
    dealer: null,
    hands: [[], [], [], []],
    trump: null,
    currentPlayer: null,
    trick: [],
    trickCount: [0, 0, 0, 0],
    ninthCard: null,
    partialHands: null,
    restDeck: null,
    log: [],
    createdAt: Date.now(),
  };
}

function startRound(room) {
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

function dealFullHands(room) {
  const rest = room.restDeck;
  room.hands = room.partialHands.map((h, i) => [...h, ...rest.slice(i * 6, i * 6 + 6)]);
  const firstPlayer = (room.dealer + 1) % 4;
  room.currentPlayer = firstPlayer;
  room.phase = 'play';
}

function chooseTrump(room, suit) {
  room.trump = suit;
  dealFullHands(room);
  room.log.push(`Козир: ${suit}`);
}

function showNinthCard(room) {
  const rest = room.restDeck;
  room.ninthCard = rest[rest.length - 1];
  room.phase = 'show9';
}

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

  if (room.trick.length === 4) {
    const winner = trickWinner(room.trick, room.trump);
    room.trickCount[winner]++;
    room.log.push(`Дачку взяв ${room.players[winner]?.name}`);

    const totalTricks = room.trickCount.reduce((a, b) => a + b);
    if (totalTricks === 9) {
      return { ok: true, trickDone: true, trickWinner: winner, roundDone: true };
    }
    return { ok: true, trickDone: true, trickWinner: winner, roundDone: false };
  }

  room.currentPlayer = (playerIndex + 1) % 4;
  return { ok: true, trickDone: false };
}

function endRound(room) {
  const result = calcRoundScores(room.trickCount, room.boaster);
  room.scores = room.scores.map((s, i) => s + result.deltas[i]);
  room.phase = 'round_end';
  room.log.push(`Результат: хвалящий ${result.boasterTricks} дачок (${result.bScore > 0 ? '+' : ''}${result.bScore})`);
  return result;
}

function advanceRound(room) {
  room.boaster = (room.boaster + 1) % 4;
  room.dealer = (room.boaster + 2) % 4;
  room.roundNum++;
  startRound(room);
}

// Публічний стан для гравця (не показуємо чужі карти)
function publicState(room, viewerIndex) {
  return {
    phase: room.phase,
    roundNum: room.roundNum,
    boaster: room.boaster,
    dealer: room.dealer,
    players: room.players.map(p => ({ name: p.name, index: p.index })),
    scores: room.scores,
    trump: room.trump,
    currentPlayer: room.currentPlayer,
    trick: room.trick,
    trickCount: room.trickCount,
    ninthCard: room.ninthCard,
    hand: room.hands[viewerIndex] ?? [],
    // Кількість карт у руках інших гравців
    handSizes: room.hands.map((h, i) => i === viewerIndex ? null : h.length),
    log: room.log.slice(-20),
  };
}

module.exports = {
  createRoom, startRound, chooseTrump, showNinthCard,
  confirmTrumpFromLast, playCard, endRound, advanceRound, publicState,
};
