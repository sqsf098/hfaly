// ─── Відкритий ринок скінів: гравець ↔ гравець ────────────────────────────
//   Продавець виставляє скін за монети або гемы; при виставленні скін
//   ЗНІМАЄТЬСЯ з його колекції (ескроу — подвійний продаж неможливий).
//   Покупець платить → продавцю падає ціна мінус комісія 10% (дохід гри).
//   Лоти переживають рестарт (data/market.json).
const path = require('path');
const { atomicWriteJSON, readJSONSafe } = require('./store');
const { getWallet, saveWallets } = require('./wallets');
const { getBackSkins, getCardSkins } = require('./skins');
const { log } = require('./logger');

const MARKET_FILE = path.join(__dirname, '../data/market.json');
const FEE_PCT = 10;               // комісія ринку, %
const MAX_LISTINGS_PER_PLAYER = 10;
const MAX_PRICE = 1_000_000;
const LISTING_TTL_MS = 14 * 24 * 60 * 60 * 1000; // лот живе 14 днів

// Стартові скіни продавати не можна — вони є у всіх, це сміття на ринку
const STARTER_BACKS = ['violet', 'navy', 'gold', 'crimson'];
const STARTER_CARDS = ['AS_royal', 'QH_rose', 'JC_joker'];

let listings = []; // {id, seller, sellerName, kind, skinId, price:{coins?|gems?}, at}

function load() {
  const res = readJSONSafe(MARKET_FILE);
  if (res && Array.isArray(res.data)) listings = res.data;
  if (listings.length) log(`🛒 Ринок: ${listings.length} лотів`);
}
function save() { atomicWriteJSON(MARKET_FILE, listings); }

function defOf(kind, skinId) {
  return (kind === 'back' ? getBackSkins() : getCardSkins())[skinId];
}

// Публічний список лотів (свіжі зверху) з даними скінів для рендера
function getListings() {
  const now = Date.now();
  const before = listings.length;
  listings = listings.filter(l => now - l.at < LISTING_TTL_MS ? true : (returnToSeller(l), false));
  if (listings.length !== before) save();
  return listings
    .slice()
    .sort((a, b) => b.at - a.at)
    .map(l => ({ ...l, def: defOf(l.kind, l.skinId) || null }));
}

function returnToSeller(l) {
  const w = getWallet(l.seller);
  const bag = l.kind === 'back' ? 'ownedBackSkins' : 'ownedCardSkins';
  w[bag] = w[bag] || [];
  if (!w[bag].includes(l.skinId)) w[bag].push(l.skinId);
  saveWallets();
}

// Виставити лот. Скін одразу знімається з колекції продавця.
function listSkin(tgId, name, kind, skinId, price) {
  if (kind !== 'back' && kind !== 'card') return { ok: false, error: 'kind: back|card' };
  const def = defOf(kind, skinId);
  if (!def) return { ok: false, error: 'Скіна не існує' };
  if ((kind === 'back' ? STARTER_BACKS : STARTER_CARDS).includes(skinId))
    return { ok: false, error: 'Стартові скіни не продаються' };

  // ціна: РІВНО одна валюта, ціле, в межах
  const coins = Math.floor(+price?.coins || 0), gems = Math.floor(+price?.gems || 0);
  if ((coins > 0) === (gems > 0)) return { ok: false, error: 'Ціна: монети АБО гемы' };
  const amount = coins || gems;
  if (amount < 1 || amount > MAX_PRICE) return { ok: false, error: `Ціна: 1..${MAX_PRICE}` };

  if (listings.filter(l => l.seller === tgId).length >= MAX_LISTINGS_PER_PLAYER)
    return { ok: false, error: `Максимум ${MAX_LISTINGS_PER_PLAYER} лотів` };

  const w = getWallet(tgId);
  const bag = kind === 'back' ? 'ownedBackSkins' : 'ownedCardSkins';
  const idx = (w[bag] || []).indexOf(skinId);
  if (idx < 0) return { ok: false, error: 'У тебе немає цього скіна' };

  // ескроу: скін знімається одразу (і роздягаємо, якщо був одягнутий)
  w[bag].splice(idx, 1);
  if (kind === 'back' && w.backSkin === skinId) w.backSkin = 'violet';
  if (kind === 'card' && def.card && w.cardSkins?.[def.card] === skinId) delete w.cardSkins[def.card];
  saveWallets();

  const l = {
    id: Math.random().toString(36).slice(2, 10),
    seller: String(tgId), sellerName: String(name || 'Гравець').slice(0, 24),
    kind, skinId, price: coins ? { coins } : { gems }, at: Date.now(),
  };
  listings.push(l);
  save();
  log(`🛒 ЛОТ: ${tgId} виставив ${kind}/${skinId} за ${amount} ${coins ? '💰' : '💎'}`);
  return { ok: true, listing: l };
}

// Зняти свій лот — скін повертається
function cancelListing(tgId, listingId) {
  const i = listings.findIndex(l => l.id === listingId);
  if (i < 0) return { ok: false, error: 'Лот не знайдено' };
  if (listings[i].seller !== String(tgId)) return { ok: false, error: 'Це не твій лот' };
  const [l] = listings.splice(i, 1);
  save();
  returnToSeller(l);
  return { ok: true };
}

// Купити лот. Гроші покупця → продавцю мінус 10%; скін → покупцю.
function buyListing(tgId, listingId) {
  const i = listings.findIndex(l => l.id === listingId);
  if (i < 0) return { ok: false, error: 'Лот вже проданий або знятий' };
  const l = listings[i];
  if (l.seller === String(tgId)) return { ok: false, error: 'Свій лот купувати не можна (зніми його)' };

  const buyer = getWallet(tgId);
  const cur = l.price.coins ? 'coins' : 'gems';
  const amount = l.price[cur];
  if ((buyer[cur] || 0) < amount) return { ok: false, error: cur === 'coins' ? 'Недостатньо монет' : 'Недостатньо 💎' };

  // якщо покупець ВЖЕ має такий скін — не дамо витратити гроші даремно
  const bag = l.kind === 'back' ? 'ownedBackSkins' : 'ownedCardSkins';
  buyer[bag] = buyer[bag] || [];
  if (buyer[bag].includes(l.skinId)) return { ok: false, error: 'Цей скін вже у тебе' };

  listings.splice(i, 1);
  save();

  buyer[cur] -= amount;
  buyer[bag].push(l.skinId);

  const seller = getWallet(l.seller);
  const payout = Math.floor(amount * (100 - FEE_PCT) / 100);
  seller[cur] = (seller[cur] || 0) + payout;
  saveWallets();

  log(`🛒 ПРОДАЖ: ${l.kind}/${l.skinId} ${l.seller} → ${tgId} за ${amount} ${cur} (продавцю ${payout}, комісія ${amount - payout})`);
  return { ok: true, listing: l, name: defOf(l.kind, l.skinId)?.name || l.skinId, amount, cur, payout, sellerId: l.seller };
}

module.exports = { load, getListings, listSkin, cancelListing, buyListing, FEE_PCT };
