// ─── Платежі Telegram Stars (⭐): продаж скінів ──────────────────────────
//   Потік: клієнт тисне «Купити» → socket 'buy_skin' → createInvoiceLink
//   (валюта XTR = Stars) → Telegram.WebApp.openInvoice → Telegram шле боту
//   pre_checkout_query (перевіряємо ще раз) → successful_payment → видаємо
//   скін у гаманець. Зірки падають на баланс бота (вивід через @BotFather).
const { getWallet, saveWallets } = require('./wallets');
const { getPurchasable } = require('./skins');
const { log } = require('./logger');

let bot = null;          // інстанс node-telegram-bot-api
let onGranted = null;    // (tgId, kind, skinId, def) → сокет-сповіщення покупцю

const PAYLOAD_PREFIX = 'skin';

function parsePayload(payload) {
  // формат: skin:<kind>:<skinId>:<tgId>
  const p = String(payload || '').split(':');
  if (p.length !== 4 || p[0] !== PAYLOAD_PREFIX) return null;
  return { kind: p[1], skinId: p[2], tgId: p[3] };
}

// Чи вже належить гравцю
function alreadyOwned(wallet, kind, skinId) {
  const bag = kind === 'back' ? wallet.ownedBackSkins : wallet.ownedCardSkins;
  return Array.isArray(bag) && bag.includes(skinId);
}

// Створити інвойс на скін. Повертає { ok, link } або { ok:false, error }
async function createSkinInvoice(tgId, kind, skinId) {
  if (!bot) return { ok: false, error: 'Платежі недоступні (бот вимкнено)' };
  if (kind !== 'back' && kind !== 'card') return { ok: false, error: 'kind: back|card' };
  const def = getPurchasable(kind, skinId);
  if (!def) return { ok: false, error: 'Цей скін не продається' };
  if (alreadyOwned(getWallet(tgId), kind, skinId)) return { ok: false, error: 'Скін вже у тебе' };

  const title = `${def.name}`.slice(0, 32);
  const desc = kind === 'back'
    ? `Сорочка «${def.name}» — її бачитимуть усі за столом`
    : `Скін карти ${def.card} «${def.name}» — видно всім у грі`;
  try {
    const link = await bot.createInvoiceLink(
      title, desc.slice(0, 255),
      `${PAYLOAD_PREFIX}:${kind}:${skinId}:${tgId}`,
      '',            // provider_token порожній для Stars
      'XTR',
      [{ label: title, amount: def.stars }],
    );
    return { ok: true, link, stars: def.stars };
  } catch (e) {
    log('⭐ createInvoiceLink: ' + e.message);
    return { ok: false, error: 'Не вдалося створити рахунок' };
  }
}

// Видати куплений скін у гаманець
function grantSkin(tgId, kind, skinId) {
  const w = getWallet(tgId);
  if (kind === 'back') {
    w.ownedBackSkins = w.ownedBackSkins || [];
    if (!w.ownedBackSkins.includes(skinId)) w.ownedBackSkins.push(skinId);
  } else {
    w.ownedCardSkins = w.ownedCardSkins || [];
    if (!w.ownedCardSkins.includes(skinId)) w.ownedCardSkins.push(skinId);
  }
  // журнал покупок — знадобиться для підтримки/повернень
  w.purchases = w.purchases || [];
  saveWallets();
  return w;
}

function initPayments(botInstance, grantedCallback) {
  bot = botInstance;
  onGranted = grantedCallback || null;
  if (!bot) return;

  // Останній рубіж перед списанням зірок: товар існує і ще не куплений
  bot.on('pre_checkout_query', async (q) => {
    const p = parsePayload(q.invoice_payload);
    let ok = true, error;
    if (!p) { ok = false; error = 'Невідомий товар'; }
    else if (!getPurchasable(p.kind, p.skinId)) { ok = false; error = 'Товар більше не продається'; }
    else if (alreadyOwned(getWallet(p.tgId), p.kind, p.skinId)) { ok = false; error = 'Цей скін вже у тебе'; }
    try {
      await bot.answerPreCheckoutQuery(q.id, ok, ok ? {} : { error_message: error });
    } catch (e) { log('⭐ answerPreCheckoutQuery: ' + e.message); }
  });

  // Оплата пройшла — видаємо скін
  bot.on('message', (msg) => {
    const sp = msg.successful_payment;
    if (!sp) return;
    const p = parsePayload(sp.invoice_payload);
    if (!p) { log('⭐ Оплата з невідомим payload: ' + sp.invoice_payload); return; }
    const w = grantSkin(p.tgId, p.kind, p.skinId);
    w.purchases.push({
      kind: p.kind, skinId: p.skinId, stars: sp.total_amount,
      chargeId: sp.telegram_payment_charge_id, at: Date.now(),
    });
    saveWallets();
    const def = getPurchasable(p.kind, p.skinId) || { name: p.skinId };
    log(`⭐ ПОКУПКА: ${p.tgId} купив ${p.kind}/${p.skinId} за ${sp.total_amount}⭐ (${sp.telegram_payment_charge_id})`);
    bot.sendMessage(msg.chat.id, `✅ «${def.name}» тепер твій! Одягни його: гра → Колекція 🎴`).catch(() => {});
    if (onGranted) onGranted(p.tgId, p.kind, p.skinId, def);
  });
}

module.exports = { initPayments, createSkinInvoice, grantSkin };
