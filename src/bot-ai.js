// ─── src/bot-ai.js — AI гравець для хФали ────────────────────────────────────

const SUITS = ['♣', '♠', '♥', '♦'];

function isTrump(card, trump) {
  return card.rank === 'J' || card.suit === trump;
}

function cardPower(card, trump) {
  if (card.rank === '6' && card.suit === trump) return 45; // «мамка» — найсильніша, б'є валетів
  if (card.rank === 'J') return { '♣': 40, '♠': 39, '♥': 38, '♦': 37 }[card.suit];
  if (card.suit === trump) return { 'A': 35, 'K': 34, 'Q': 33, '10': 32, '9': 31, '8': 30, '7': 29 }[card.rank];
  return { 'A': 14, 'K': 13, 'Q': 12, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6 }[card.rank] ?? 0;
}

function canPlayCard(card, hand, trick, trump) {
  if (trick.length === 0) return true;
  const led = trick[0].card;
  const ledTrump = isTrump(led, trump);
  if (ledTrump) {
    const hasTrump = hand.some(c => isTrump(c, trump));
    if (hasTrump) return isTrump(card, trump);
    return true;
  }
  const hasSuit = hand.some(c => !isTrump(c, trump) && c.suit === led.suit);
  if (hasSuit) return !isTrump(card, trump) && card.suit === led.suit;
  return true;
}

// Визначити поточного переможця дачки
function currentWinner(trick, trump) {
  if (trick.length === 0) return null;
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

// Чи є карта переможцем якщо її кинути зараз
function wouldWin(card, trick, trump) {
  const fakeTrick = [...trick, { playerIndex: 99, card }];
  return currentWinner(fakeTrick, trump) === 99;
}

// ── Вибір козиря (для хвалящого бота) ────────────────────────────────────────
function chooseTrump(hand) {
  const suitCount = {};
  for (const suit of SUITS) suitCount[suit] = 0;

  for (const card of hand) {
    if (card.rank === 'J') {
      for (const suit of SUITS) suitCount[suit]++;
    } else {
      suitCount[card.suit]++;
    }
  }

  // Обираємо масть з найбільшою кількістю карт
  let bestSuit = SUITS[0];
  let bestCount = 0;
  for (const suit of SUITS) {
    if (suitCount[suit] > bestCount) {
      bestCount = suitCount[suit];
      bestSuit = suit;
    }
  }
  return bestSuit;
}

// ── Основна логіка ходу ───────────────────────────────────────────────────────
function chooseCard(hand, trick, trump, playerIndex, teamPartnerIndex) {
  const valid = hand.filter(c => canPlayCard(c, hand, trick, trump));
  if (valid.length === 1) return valid[0];

  const trumpCards = valid.filter(c => isTrump(c, trump));
  const nonTrump = valid.filter(c => !isTrump(c, trump));

  // ── Перший хід у дачці ──────────────────────────────────────────
  if (trick.length === 0) {
    // Якщо є сильні не-козирні — ходимо ними
    const strongNonTrump = nonTrump.filter(c => cardPower(c, trump) >= 13); // K або A
    if (strongNonTrump.length > 0) {
      return strongNonTrump.sort((a, b) => cardPower(b, trump) - cardPower(a, trump))[0];
    }
    // Якщо є слабкі козирі — краще позбутися
    const weakTrumps = trumpCards.filter(c => cardPower(c, trump) < 33);
    if (weakTrumps.length > 0 && trumpCards.length > 2) {
      return weakTrumps.sort((a, b) => cardPower(a, trump) - cardPower(b, trump))[0];
    }
    // Кидаємо найслабшу карту
    return valid.sort((a, b) => cardPower(a, trump) - cardPower(b, trump))[0];
  }

  // ── Не перший хід ──────────────────────────────────────────────
  const winnerIdx = currentWinner(trick, trump);
  const partnerWinning = winnerIdx === teamPartnerIndex;

  // Якщо партнер вже виграє — кидаємо найслабшу
  if (partnerWinning) {
    return valid.sort((a, b) => cardPower(a, trump) - cardPower(b, trump))[0];
  }

  // Спробуємо побити поточного переможця
  const winners = valid.filter(c => wouldWin(c, trick, trump));

  if (winners.length > 0) {
    // Бʼємо мінімальною переможною картою
    return winners.sort((a, b) => cardPower(a, trump) - cardPower(b, trump))[0];
  }

  // Не можемо побити — кидаємо найслабшу
  return valid.sort((a, b) => cardPower(a, trump) - cardPower(b, trump))[0];
}

// ── Публічний API ─────────────────────────────────────────────────────────────
const BOT_NAMES = ['🤖 Борис', '🤖 Оксана', '🤖 Микола', '🤖 Галина'];
const BOT_THINK_MS = 800; // затримка "думання"

function createBot(index) {
  return {
    id: `bot_${index}`,
    socketId: `bot_socket_${index}`,
    name: BOT_NAMES[index] || `🤖 Бот ${index + 1}`,
    tgId: `bot_tg_${index}`,
    index,
    isBot: true,
    online: true,
  };
}

function botChooseTrump(hand) {
  return chooseTrump(hand);
}

function botChooseCard(hand, trick, trump, playerIndex, partnerIndex) {
  return chooseCard(hand, trick, trump, playerIndex, partnerIndex);
}

module.exports = { createBot, botChooseTrump, botChooseCard, BOT_THINK_MS };
