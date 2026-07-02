// ─── Ескроу депозитів: щоб рестарт сервера не «з'їдав» ставки ────────────
// Кімнати живуть у пам'яті. Раніше: гравець вніс депозит → сервер
// перезапустився → кімната зникла разом із банком, монети втрачені.
// Тепер кожен утриманий депозит пишеться на диск; при старті сервера всі
// «осиротілі» записи (їхні кімнати померли з процесом) повертаються гравцям.
const path = require('path');
const { atomicWriteJSON, readJSONSafe } = require('./store');
const { log } = require('./logger');

const FILE = path.join(__dirname, '../data/escrow.json');
let escrow = {}; // "tgId|roomId" → { tgId, roomId, amount, ts }

const keyOf = (tgId, roomId) => `${tgId}|${roomId}`;

function loadEscrow() {
  const res = readJSONSafe(FILE);
  if (res) {
    escrow = res.data || {};
    const n = Object.keys(escrow).length;
    if (n) log(`💼 Ескроу: ${n} незакритих депозитів (${res.from.endsWith('.bak') ? 'з бекапу' : 'основний файл'})`);
  }
}

function saveEscrow() {
  try { atomicWriteJSON(FILE, escrow); }
  catch (e) { log('Помилка збереження ескроу: ' + e.message); }
}

// Гравець вніс депозит у кімнату
function holdDeposit(tgId, roomId, amount) {
  if (!amount || amount <= 0) return;
  escrow[keyOf(tgId, roomId)] = { tgId: String(tgId), roomId, amount, ts: Date.now() };
  saveEscrow();
}

// Депозит закритий: повернений (вихід із кімнати) або зіграний (кінець гри)
function releaseDeposit(tgId, roomId) {
  const k = keyOf(tgId, roomId);
  if (!escrow[k]) return false;
  delete escrow[k];
  saveEscrow();
  return true;
}

// При старті сервера: всі записи — сироти (їхні кімнати померли з процесом).
// Повертаємо монети на гаманці. getWallet передається, щоб уникнути циклу імпортів.
function refundOrphans(getWallet) {
  const entries = Object.values(escrow);
  if (!entries.length) return 0;
  for (const e of entries) {
    const w = getWallet(e.tgId);
    w.coins += e.amount;
    log(`💸 Повернено депозит ${e.amount} гравцю ${e.tgId} (кімната ${e.roomId} не пережила рестарт)`);
  }
  escrow = {};
  saveEscrow();
  return entries.length;
}

module.exports = { loadEscrow, holdDeposit, releaseDeposit, refundOrphans };
