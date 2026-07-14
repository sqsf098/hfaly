// ─── Топ рекрутерів тижня: лідерборд + авто-призи топ-3 ──────────────────
//   Хто привів найбільше друзів за тиждень (зараховується, коли друг зіграв
//   ПЕРШУ гру — та сама анти-накрутка, що й у кешбеку). Понеділок 00:00 UTC —
//   новий тиждень: топ-3 минулого автоматично отримують 200/100/50 💎.
const path = require('path');
const { atomicWriteJSON, readJSONSafe } = require('./store');
const { getWallet, saveWallets, playerWallets } = require('./wallets');
const { log } = require('./logger');

const FILE = path.join(__dirname, '../data/reftop.json');
const PRIZES = [200, 100, 50]; // 💎 топ-3 минулого тижня

let state = { week: null, counts: {} };

function isoWeek(d = new Date()) {
  // ISO-тиждень: YYYY-Wnn
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function load() {
  const res = readJSONSafe(FILE);
  if (res && res.data && res.data.counts) state = res.data;
}
function save() { atomicWriteJSON(FILE, state); }

// Перехід тижня: виплатити призи топ-3 і почати з чистого аркуша
function rollover() {
  const cur = isoWeek();
  if (state.week === cur) return;
  if (state.week && Object.keys(state.counts).length) {
    const top = Object.entries(state.counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    top.forEach(([tgId, count], i) => {
      const w = getWallet(tgId);
      w.gems = (w.gems || 0) + PRIZES[i];
      log(`🏅 РЕФ-ТОП ${state.week}: #${i + 1} ${tgId} (${count} друзів) +${PRIZES[i]}💎`);
      try {
        require('./telegram').notifyUser(tgId,
          `🏅 Ти #${i + 1} у топі рекрутерів тижня (${count} друзів)! Приз: *+${PRIZES[i]} 💎*`);
      } catch (e) { /* dev */ }
    });
    saveWallets();
  }
  state = { week: cur, counts: {} };
  save();
}

// Друг зіграв першу гру → +1 рекрутеру в тижневому заліку
function onReferralCounted(inviterId) {
  rollover();
  state.counts[inviterId] = (state.counts[inviterId] || 0) + 1;
  save();
}

// Топ для UI
function top(n = 10) {
  rollover();
  return {
    week: state.week,
    prizes: PRIZES,
    top: Object.entries(state.counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([tgId, count], i) => {
        const w = playerWallets.get(String(tgId));
        return { place: i + 1, name: (w?.name || 'Гравець').slice(0, 20), count, earned: w?.refEarnedGems || 0 };
      }),
  };
}

module.exports = { load, onReferralCounted, top };
