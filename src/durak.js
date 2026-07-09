// ─── src/durak.js — Дурак підкидний (2-4 гравці) ─────────────────────────
//   Класичні правила: 36 карт, по 6 у руку, козир — нижня карта колоди.
//   Атака будь-якою; підкидати можна номінали, що вже на столі (всі, крім
//   захисника). Захист — старша тієї ж масті або козир. «Взяти» → стіл у
//   руку, хід через гравця. «Бито» → відбій. Добір до 6 (атакер → інші →
//   захисник). Останній з картами — дурак.
const SUITS = ['♣', '♠', '♥', '♦'];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const POWER = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank, id: `${rank}${suit}` });
  return deck;
}
function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Чи б'є карта b карту a при козирі trump
function beats(b, a, trump) {
  if (b.suit === a.suit) return POWER[b.rank] > POWER[a.rank];
  return b.suit === trump; // інша масть б'є лише козирем
}

function startGame(room) {
  const n = room.players.length;
  const deck = shuffle(buildDeck());
  const hands = [];
  for (let i = 0; i < n; i++) hands.push(deck.splice(0, 6));
  const trumpCard = deck[0]; // нижня карта колоди — відкритий козир
  // козирна карта йде В НИЗ колоди: дістанеться останньою
  const d = {
    deck, trumpCard, trump: trumpCard.suit,
    table: [],            // [{a:card, d:card|null}]
    discard: 0,           // карт у відбої (лічильник для UI)
    took: false,          // захисник вирішив узяти (підкидання завершується)
    passed: new Set(),    // індекси атакерів, що сказали «бито»
    out: [],              // гравці, що вийшли (порожня рука при порожній колоді)
    finished: false, loserIndex: null,
  };
  room.durak = d;
  room.hands = hands;
  room.phase = 'play';
  room.trick = [];
  room.log = room.log || [];

  // Перший атакер — у кого найменший козир (класика)
  let atk = 0, best = 99;
  for (let i = 0; i < n; i++) for (const c of hands[i])
    if (c.suit === d.trump && POWER[c.rank] < best) { best = POWER[c.rank]; atk = i; }
  d.attacker = atk;
  d.defender = (atk + 1) % n;
  room.currentPlayer = atk;
  room.log.push(`Козир: ${d.trump}. Першим атакує ${room.players[atk]?.name}`);
}

const aliveCount = (room) => room.players.length - room.durak.out.length;
const isOut = (room, i) => room.durak.out.includes(i);
function nextAlive(room, i) {
  const n = room.players.length;
  let j = i;
  do { j = (j + 1) % n; } while (isOut(room, j) && j !== i);
  return j;
}

// Ліміт карт атаки: 6, і не більше, ніж у захисника в руці
function attackLimit(room) {
  return Math.min(6, room.hands[room.durak.defender].length + room.durak.table.filter(p => !p.d).length);
}

// ── Дії гравців ────────────────────────────────────────────────────────
function attack(room, idx, cardId) {
  const d = room.durak;
  if (room.phase !== 'play' || d.finished) return { ok: false, error: 'Гра не йде' };
  if (idx === d.defender) return { ok: false, error: 'Ти захищаєшся!' };
  if (isOut(room, idx)) return { ok: false, error: 'Ти вже вийшов' };
  if (d.took) return { ok: false, error: 'Захисник бере — підкидати пізно' };
  const hand = room.hands[idx];
  const ci = hand.findIndex(c => c.id === cardId);
  if (ci < 0) return { ok: false, error: 'Немає такої карти' };
  if (d.table.length >= attackLimit(room)) return { ok: false, error: 'Більше не можна підкидати' };

  const card = hand[ci];
  if (d.table.length === 0) {
    if (idx !== d.attacker) return { ok: false, error: 'Першим ходить атакер' };
  } else {
    // підкидати можна лише номінал, що вже є на столі
    const ranks = new Set();
    for (const p of d.table) { ranks.add(p.a.rank); if (p.d) ranks.add(p.d.rank); }
    if (!ranks.has(card.rank)) return { ok: false, error: 'Такого номіналу нема на столі' };
  }
  hand.splice(ci, 1);
  d.table.push({ a: card, d: null });
  d.passed.clear(); // нова карта — «бито» скасовується
  room.log.push(`${room.players[idx]?.name}: ${card.rank}${card.suit} →`);
  return { ok: true };
}

function defend(room, idx, cardId, targetIdx) {
  const d = room.durak;
  if (room.phase !== 'play' || d.finished) return { ok: false, error: 'Гра не йде' };
  if (idx !== d.defender) return { ok: false, error: 'Ти не захисник' };
  if (d.took) return { ok: false, error: 'Ти вже береш' };
  const hand = room.hands[idx];
  const ci = hand.findIndex(c => c.id === cardId);
  if (ci < 0) return { ok: false, error: 'Немає такої карти' };
  const card = hand[ci];

  // ціль: конкретна пара або перша непобита, яку МОЖНА побити цією картою
  let pair = null;
  if (targetIdx != null && d.table[targetIdx] && !d.table[targetIdx].d) pair = d.table[targetIdx];
  else pair = d.table.find(p => !p.d && beats(card, p.a, d.trump));
  if (!pair) return { ok: false, error: 'Нема що бити цією картою' };
  if (!beats(card, pair.a, d.trump)) return { ok: false, error: `${card.rank}${card.suit} не б'є ${pair.a.rank}${pair.a.suit}` };

  hand.splice(ci, 1);
  pair.d = card;
  room.log.push(`${room.players[idx]?.name}: ${pair.a.rank}${pair.a.suit} ← ${card.rank}${card.suit}`);

  // все побито і в захисника нема карт → автоматичне «бито»
  if (d.table.every(p => p.d) && (hand.length === 0 || d.table.length >= attackLimit(room))) {
    return { ok: true, auto: finishBout(room, false) };
  }
  return { ok: true };
}

function take(room, idx) {
  const d = room.durak;
  if (idx !== d.defender || d.finished) return { ok: false, error: 'Ти не захисник' };
  if (d.table.length === 0) return { ok: false, error: 'Стіл порожній' };
  return { ok: true, auto: finishBout(room, true) };
}

// «Бито» від атакера: коли ВСІ атакери пасують і все побито → кінець кону
function pass(room, idx) {
  const d = room.durak;
  if (d.finished) return { ok: false, error: 'Гра завершена' };
  if (idx === d.defender) return { ok: false, error: 'Захисник не каже «бито»' };
  if (isOut(room, idx)) return { ok: false, error: 'Ти вже вийшов' };
  if (d.table.length === 0) return { ok: false, error: 'Стіл порожній' };
  if (!d.table.every(p => p.d)) return { ok: false, error: 'Ще не все побито' };
  d.passed.add(idx);
  // всі живі, крім захисника, пасонули → бито
  const others = room.players.map((_, i) => i).filter(i => i !== d.defender && !isOut(room, i));
  if (others.every(i => d.passed.has(i))) return { ok: true, auto: finishBout(room, false) };
  return { ok: true };
}

// Кінець кону: took=захисник забирає стіл, інакше відбій. Добір, зсув ролей.
function finishBout(room, took) {
  const d = room.durak;
  const n = room.players.length;

  if (took) {
    const cards = [];
    for (const p of d.table) { cards.push(p.a); if (p.d) cards.push(p.d); }
    room.hands[d.defender].push(...cards);
    room.log.push(`${room.players[d.defender]?.name} бере ${cards.length} карт`);
  } else {
    d.discard += d.table.reduce((s, p) => s + 1 + (p.d ? 1 : 0), 0);
    room.log.push('Бито!');
  }
  d.table = [];
  d.passed.clear();
  d.took = false;

  // Добір до 6: атакер → за годинниковою → захисник останній
  const order = [];
  let i = d.attacker;
  for (let k = 0; k < n; k++) { if (!isOut(room, i) && i !== d.defender) order.push(i); i = (i + 1) % n; }
  if (!isOut(room, d.defender)) order.push(d.defender);
  for (const pi of order) {
    while (room.hands[pi].length < 6 && d.deck.length > 0) room.hands[pi].push(d.deck.shift());
  }

  // Вихід гравців: колода порожня і рука порожня
  if (d.deck.length === 0) {
    for (let p = 0; p < n; p++) {
      if (!isOut(room, p) && room.hands[p].length === 0) {
        d.out.push(p);
        room.log.push(`${room.players[p]?.name} вийшов! 🎉`);
      }
    }
  }

  // Кінець гри: лишився один (або нуль — нічия, всі вийшли одночасно)
  if (aliveCount(room) <= 1) {
    d.finished = true;
    d.loserIndex = room.players.findIndex((_, p) => !isOut(room, p));
    room.phase = 'game_end';
    return { gameOver: true, loserIndex: d.loserIndex };
  }

  // Ролі: побився → захисник атакує; взяв → хід через нього
  let nextAtk;
  if (took) nextAtk = nextAlive(room, d.defender);
  else nextAtk = isOut(room, d.defender) ? nextAlive(room, d.defender) : d.defender;
  d.attacker = nextAtk;
  d.defender = nextAlive(room, nextAtk);
  room.currentPlayer = nextAtk;
  return { gameOver: false };
}

// Публічний стан для конкретного гравця
function publicState(room, viewerIndex) {
  const d = room.durak;
  return {
    phase: room.phase,
    mode: 'durak',
    maxPlayers: room.maxPlayers || 2,
    players: room.players.map(p => ({ name: p.name, index: p.index, skins: p.skins || null })),
    trump: d.trump,
    trumpCard: d.trumpCard,
    deckLeft: d.deck.length,
    discard: d.discard,
    table: d.table,
    attacker: d.attacker,
    defender: d.defender,
    took: d.took,
    out: d.out,
    finished: d.finished,
    loserIndex: d.loserIndex,
    hand: room.hands[viewerIndex] ?? [],
    handSizes: room.hands.map((h, i) => i === viewerIndex ? null : h.length),
    canPass: d.table.length > 0 && d.table.every(p => p.d) && viewerIndex !== d.defender && !d.passed.has(viewerIndex) && !isOut(room, viewerIndex),
    log: (room.log || []).slice(-20),
  };
}

module.exports = { startGame, attack, defend, take, pass, publicState, beats };
