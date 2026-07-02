// ─── src/economy.js — Валюта, скрині (лутбокси) та щоденні квести ─────────
//   Уся ігрова економіка поза столом. Дані живуть у гаманці (wallets.js).
//   Дизайнери правлять таблиці нижче — код чіпати не треба.

// ── Косметичні колоди, які випадають зі скринь (преміум-пул) ──────────────
const PREMIUM_DECKS = ['royal', 'emerald', 'crimson', 'galaxy'];

// ── Типи скринь ───────────────────────────────────────────────────────────
// cost: { coins, gems } — ціна відкриття. free: true → безкоштовна за таймером.
// loot: масив можливих винагород з вагою (weight). Один ролл на скриню.
const CHESTS = {
  wood: {
    id: 'wood', name: 'Дерев\'яна скриня', emoji: '📦', color: '#8d6e63',
    free: true, cooldownMs: 4 * 60 * 60 * 1000, // раз на 4 год
    loot: [
      { type: 'coins', min: 50,  max: 150, weight: 60 },
      { type: 'coins', min: 150, max: 300, weight: 25 },
      { type: 'gems',  min: 1,   max: 3,   weight: 15 },
    ],
  },
  silver: {
    id: 'silver', name: 'Срібна скриня', emoji: '🎁', color: '#b0bec5',
    cost: { coins: 500 },
    loot: [
      { type: 'coins', min: 300, max: 600, weight: 45 },
      { type: 'gems',  min: 3,   max: 8,   weight: 35 },
      { type: 'deck',  weight: 20 },
    ],
  },
  gold: {
    id: 'gold', name: 'Золота скриня', emoji: '👑', color: '#f1c40f',
    cost: { gems: 20 },
    loot: [
      { type: 'coins', min: 1000, max: 2500, weight: 40 },
      { type: 'gems',  min: 10,   max: 30,   weight: 30 },
      { type: 'deck',  weight: 30 },
    ],
  },
};

// ── Пул щоденних квестів. Щодня гравцю видається QUESTS_PER_DAY штук ───────
const QUEST_POOL = [
  { id: 'play3',   type: 'play_games',   target: 3,  reward: { coins: 150 }, text: 'Зіграй 3 гри' },
  { id: 'win1',    type: 'win_game',     target: 1,  reward: { coins: 200, chest: 'wood' }, text: 'Виграй 1 гру' },
  { id: 'win2',    type: 'win_game',     target: 2,  reward: { gems: 5 }, text: 'Виграй 2 гри' },
  { id: 'tricks15',type: 'take_tricks',  target: 15, reward: { coins: 120 }, text: 'Візьми 15 дачок' },
  { id: 'trump5',  type: 'choose_trump', target: 5,  reward: { coins: 80 },  text: 'Обери козир 5 разів' },
  { id: 'cards40', type: 'play_cards',   target: 40, reward: { coins: 60 },  text: 'Зіграй 40 карт' },
];
const QUESTS_PER_DAY = 3;

// ── Утиліти ────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); } // YYYY-MM-DD
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function weightedPick(items) {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let r = Math.random() * total;
  for (const it of items) { if ((r -= it.weight) <= 0) return it; }
  return items[items.length - 1];
}

// ── Щоденні квести ──────────────────────────────────────────────────────────
function ensureDailyQuests(wallet) {
  if (wallet.questDay === today() && Array.isArray(wallet.quests) && wallet.quests.length) return false;
  // Новий день — тасуємо пул і беремо перші N
  const shuffled = [...QUEST_POOL].sort(() => Math.random() - 0.5).slice(0, QUESTS_PER_DAY);
  wallet.quests = shuffled.map(q => ({
    id: q.id, type: q.type, target: q.target, text: q.text, reward: q.reward,
    progress: 0, done: false, claimed: false,
  }));
  wallet.questDay = today();
  return true; // квести оновлено
}

// Просунути прогрес квестів даного типу. Повертає масив квестів, що щойно виконались.
function addQuestProgress(wallet, type, amount = 1) {
  ensureDailyQuests(wallet);
  const completed = [];
  for (const q of wallet.quests) {
    if (q.type !== type || q.done) continue;
    q.progress = Math.min(q.target, q.progress + amount);
    if (q.progress >= q.target) { q.done = true; completed.push(q); }
  }
  return completed;
}

// Забрати винагороду за виконаний квест
function claimQuest(wallet, questId) {
  ensureDailyQuests(wallet);
  const q = wallet.quests.find(x => x.id === questId);
  if (!q) return { ok: false, error: 'Квест не знайдено' };
  if (!q.done) return { ok: false, error: 'Квест ще не виконано' };
  if (q.claimed) return { ok: false, error: 'Вже отримано' };
  q.claimed = true;
  const gained = grantReward(wallet, q.reward);
  return { ok: true, reward: q.reward, gained };
}

// ── Скрині ───────────────────────────────────────────────────────────────────
function canOpenFree(wallet, chestId) {
  const chest = CHESTS[chestId];
  if (!chest || !chest.free) return false;
  return Date.now() >= (wallet.freeChestAt || 0);
}

function openChest(wallet, chestId) {
  const chest = CHESTS[chestId];
  if (!chest) return { ok: false, error: 'Невідома скриня' };

  const owned = (wallet.chests?.[chestId] || 0) > 0;

  if (chest.free && !owned) {
    // Безкоштовна скриня за таймером
    if (!canOpenFree(wallet, chestId)) {
      const waitMs = (wallet.freeChestAt || 0) - Date.now();
      return { ok: false, error: 'Ще рано', cooldownMs: Math.max(0, waitMs) };
    }
    wallet.freeChestAt = Date.now() + chest.cooldownMs;
  } else if (owned) {
    // Витрачаємо скриню з інвентаря
    wallet.chests[chestId]--;
  } else if (chest.cost) {
    // Купуємо відкриття за валюту
    const c = chest.cost;
    if (c.coins && wallet.coins < c.coins) return { ok: false, error: 'Недостатньо монет' };
    if (c.gems && wallet.gems < c.gems) return { ok: false, error: 'Недостатньо 💎' };
    if (c.coins) wallet.coins -= c.coins;
    if (c.gems) wallet.gems -= c.gems;
  } else {
    return { ok: false, error: 'Немає такої скрині' };
  }

  const roll = weightedPick(chest.loot);
  const reward = rollToReward(wallet, roll);
  const gained = grantReward(wallet, reward);
  return { ok: true, chestId, reward, gained };
}

// Перетворює запис лут-таблиці на конкретну винагороду
function rollToReward(wallet, roll) {
  if (roll.type === 'coins') return { coins: randInt(roll.min, roll.max) };
  if (roll.type === 'gems')  return { gems: randInt(roll.min, roll.max) };
  if (roll.type === 'deck') {
    const locked = PREMIUM_DECKS.filter(d => !(wallet.ownedDecks || []).includes(d));
    if (locked.length === 0) return { coins: 500 }; // усі колоди вже є → компенсація
    return { deck: locked[Math.floor(Math.random() * locked.length)] };
  }
  return { coins: 50 };
}

// Нараховує винагороду в гаманець. Повертає нормалізований опис для UI.
function grantReward(wallet, reward) {
  const gained = {};
  if (reward.coins) { wallet.coins += reward.coins; gained.coins = reward.coins; }
  if (reward.gems)  { wallet.gems  += reward.gems;  gained.gems = reward.gems; }
  if (reward.deck) {
    wallet.ownedDecks = wallet.ownedDecks || [];
    if (!wallet.ownedDecks.includes(reward.deck)) wallet.ownedDecks.push(reward.deck);
    gained.deck = reward.deck;
  }
  if (reward.chest) {
    wallet.chests = wallet.chests || {};
    wallet.chests[reward.chest] = (wallet.chests[reward.chest] || 0) + 1;
    gained.chest = reward.chest;
  }
  return gained;
}

// Публічний зріз економіки для клієнта
function economyState(wallet) {
  ensureDailyQuests(wallet);
  return {
    coins: wallet.coins,
    gems: wallet.gems,
    ownedDecks: wallet.ownedDecks,
    chests: wallet.chests,
    quests: wallet.quests,
    freeChestReadyIn: Math.max(0, (wallet.freeChestAt || 0) - Date.now()),
    chestCatalog: Object.values(CHESTS).map(c => ({
      id: c.id, name: c.name, emoji: c.emoji, color: c.color,
      free: !!c.free, cost: c.cost || null,
    })),
  };
}

module.exports = {
  CHESTS, QUEST_POOL, PREMIUM_DECKS,
  ensureDailyQuests, addQuestProgress, claimQuest,
  openChest, economyState, grantReward,
};
