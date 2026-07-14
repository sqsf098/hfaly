// ─── Платежі Telegram Stars (⭐): продаж скінів ──────────────────────────
//   Потік: клієнт тисне «Купити» → socket 'buy_skin' → createInvoiceLink
//   (валюта XTR = Stars) → Telegram.WebApp.openInvoice → Telegram шле боту
//   pre_checkout_query (перевіряємо ще раз) → successful_payment → видаємо
//   скін у гаманець. Зірки падають на баланс бота (вивід через @BotFather).
const { getWallet, saveWallets } = require('./wallets');
const { getPurchasable } = require('./skins');
const { getCollections, grantCollection } = require('./collections');
const { log } = require('./logger');

let bot = null;          // інстанс node-telegram-bot-api
let onGranted = null;    // (tgId, kind, skinId, def) → сокет-сповіщення покупцю

function parsePayload(payload) {
  // формати: skin:<kind>:<skinId>:<tgId> | coll:<collId>:<tgId> | pack:<packId>:<tgId>
  const p = String(payload || '').split(':');
  if (p[0] === 'skin' && p.length === 4) return { type: 'skin', kind: p[1], skinId: p[2], tgId: p[3] };
  if (p[0] === 'coll' && p.length === 3) return { type: 'coll', collId: p[1], tgId: p[2] };
  if (p[0] === 'pack' && p.length === 3) return { type: 'pack', packId: p[1], tgId: p[2] };
  return null;
}

// ── Банк: пакети за Stars (гемы, скрині) ─────────────────────────────────
// reward — формат grantReward з economy.js (gems / chest / coins)
const STAR_PACKS = {
  g20:  { name: '20 💎',  desc: 'Жменька гемів', stars: 100,  reward: { gems: 20 } },
  g65:  { name: '65 💎',  desc: 'Мішечок гемів (+8% бонус)', stars: 300,  reward: { gems: 65 } },
  g240: { name: '240 💎', desc: 'Скарбниця гемів (+20% бонус)', stars: 1000, reward: { gems: 240 } },
  chest_gold: { name: 'Золота скриня', desc: 'Рідкісні та епічні карти всередині', stars: 50, reward: { chest: 'gold' } },
  // Спіни Колеса Фортуни (маржа ~39% на потоці)
  spin1:  { name: '🎡 1 спін',  desc: 'Одне обертання Колеса Фортуни', stars: 25,  reward: { spins: 1 } },
  spin5:  { name: '🎡 5 спінів', desc: '20⭐ за спін (-20%)', stars: 100, reward: { spins: 5 } },
  spin15: { name: '🎡 15 спінів', desc: '16.6⭐ за спін (-33%) — мисливцям за джекпотом', stars: 250, reward: { spins: 15 } },
  // Донати: підтримка гри. «Меценат» дає ексклюзивну сорочку (noSale)
  don50:  { name: '☕ Кава розробнику', desc: 'Дякуємо! +5 💎 на удачу', stars: 50, reward: { gems: 5 } },
  don200: { name: '❤️ Підтримати гру', desc: 'Ексклюзивна сорочка «Меценат» + 20 💎', stars: 200, reward: { back: 'patron_bk', gems: 20 } },
  don500: { name: '👑 Великий меценат', desc: 'Сорочка «Меценат», 60 💎 і 5000 💰', stars: 500, reward: { back: 'patron_bk', gems: 60, coins: 5000 } },
};

// Чи колекція вже зібрана повністю (тоді покупка бандла беззмістовна)
function collectionComplete(wallet, coll) {
  return coll.items.every(it => {
    const bag = it.kind === 'back' ? wallet.ownedBackSkins : wallet.ownedCardSkins;
    return Array.isArray(bag) && bag.includes(it.id);
  });
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
      `skin:${kind}:${skinId}:${tgId}`,
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

// Інвойс на пакет (гемы/скриня за ⭐)
async function createPackInvoice(tgId, packId) {
  if (!bot) return { ok: false, error: 'Платежі недоступні (бот вимкнено)' };
  const pack = STAR_PACKS[packId];
  if (!pack) return { ok: false, error: 'Пакет не знайдено' };
  try {
    const link = await bot.createInvoiceLink(
      pack.name.slice(0, 32), pack.desc.slice(0, 255),
      `pack:${packId}:${tgId}`,
      '', 'XTR',
      [{ label: pack.name.slice(0, 32), amount: pack.stars }],
    );
    return { ok: true, link, stars: pack.stars };
  } catch (e) {
    log('⭐ createPackInvoice: ' + e.message);
    return { ok: false, error: 'Не вдалося створити рахунок' };
  }
}

// Інвойс на ПОВНУ колекцію (бандл зі знижкою)
async function createCollectionInvoice(tgId, collId) {
  if (!bot) return { ok: false, error: 'Платежі недоступні (бот вимкнено)' };
  const coll = getCollections()[collId];
  if (!coll || !coll.priceStars) return { ok: false, error: 'Колекція не продається' };
  if (collectionComplete(getWallet(tgId), coll)) return { ok: false, error: 'Колекція вже зібрана' };
  try {
    const link = await bot.createInvoiceLink(
      `Колекція «${coll.name}»`.slice(0, 32),
      `${coll.items.length} предметів (${coll.desc}). Все, чого бракує, стане твоїм.`.slice(0, 255),
      `coll:${collId}:${tgId}`,
      '', 'XTR',
      [{ label: coll.name.slice(0, 32), amount: coll.priceStars }],
    );
    return { ok: true, link, stars: coll.priceStars };
  } catch (e) {
    log('⭐ createCollectionInvoice: ' + e.message);
    return { ok: false, error: 'Не вдалося створити рахунок' };
  }
}

// ── ДВОРІВНЕВИЙ реф-кешбек (гемами, довічно, з РЕАЛЬНИХ покупок за ⭐):
//    Рівень 1: 25% тому, хто запросив покупця (stars/20 у гемах, 1💎≈5⭐)
//    Рівень 2: 10% тому, хто запросив запрошувача (stars/50)
//    Двох рівнів достатньо (стандарт Hamster) — глибше = дірка в економіці
//    і токсична «піраміда». Фейкові акаунти не дають нічого: платимо лише
//    з реальних платежів.
const REF_LEVELS = [
  { divisor: 20, pct: '25%' },  // рівень 1
  { divisor: 50, pct: '10%' },  // рівень 2
];

function refCashback(buyerTgId, stars) {
  let current = getWallet(buyerTgId);
  for (const lvl of REF_LEVELS) {
    const inviterId = current.referredBy;
    if (!inviterId) break;
    const gems = Math.max(1, Math.round(stars / lvl.divisor));
    const inviter = getWallet(inviterId);
    inviter.gems = (inviter.gems || 0) + gems;
    inviter.refEarnedGems = (inviter.refEarnedGems || 0) + gems;
    log(`👥 КЕШБЕК L${lvl.pct}: ${inviterId} +${gems}💎 (покупка ${buyerTgId} на ${stars}⭐)`);
    if (bot) bot.sendMessage(inviterId,
      `💎 Покупка у твоїй команді — кешбек *+${gems} 💎* (${lvl.pct})! Всього заробив: *${inviter.refEarnedGems} 💎*`,
      { parse_mode: 'Markdown' }).catch(() => {});
    current = inviter; // піднімаємось на рівень вище
  }
  saveWallets();
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
    else if (p.type === 'skin') {
      if (!getPurchasable(p.kind, p.skinId)) { ok = false; error = 'Товар більше не продається'; }
      else if (alreadyOwned(getWallet(p.tgId), p.kind, p.skinId)) { ok = false; error = 'Цей скін вже у тебе'; }
    } else if (p.type === 'coll') {
      const coll = getCollections()[p.collId];
      if (!coll) { ok = false; error = 'Колекції не існує'; }
      else if (collectionComplete(getWallet(p.tgId), coll)) { ok = false; error = 'Колекція вже зібрана'; }
    } else if (p.type === 'pack') {
      if (!STAR_PACKS[p.packId]) { ok = false; error = 'Пакет більше не продається'; }
    }
    try {
      await bot.answerPreCheckoutQuery(q.id, ok, ok ? {} : { error_message: error });
    } catch (e) { log('⭐ answerPreCheckoutQuery: ' + e.message); }
  });

  // Оплата пройшла — видаємо товар
  bot.on('message', (msg) => {
    const sp = msg.successful_payment;
    if (!sp) return;
    const p = parsePayload(sp.invoice_payload);
    if (!p) { log('⭐ Оплата з невідомим payload: ' + sp.invoice_payload); return; }

    if (p.type === 'pack') {
      const pack = STAR_PACKS[p.packId];
      if (!pack) { log('⭐ Оплата невідомого пакета: ' + p.packId); return; }
      const w = getWallet(p.tgId);
      const { grantReward } = require('./economy');
      const gained = grantReward(w, pack.reward);
      w.purchases = w.purchases || [];
      w.purchases.push({
        pack: p.packId, stars: sp.total_amount,
        chargeId: sp.telegram_payment_charge_id, at: Date.now(),
      });
      saveWallets();
      log(`⭐ ПАКЕТ: ${p.tgId} купив ${p.packId} за ${sp.total_amount}⭐ (${sp.telegram_payment_charge_id})`);
      refCashback(p.tgId, sp.total_amount);
      bot.sendMessage(msg.chat.id, `✅ «${pack.name}» зараховано! Заглянь у гру 🎁`).catch(() => {});
      if (onGranted) onGranted(p.tgId, 'pack', p.packId, { name: pack.name, gained });
      return;
    }

    if (p.type === 'coll') {
      const coll = getCollections()[p.collId];
      const w = getWallet(p.tgId);
      const granted = grantCollection(w, p.collId) || [];
      w.purchases = w.purchases || [];
      w.purchases.push({
        coll: p.collId, stars: sp.total_amount,
        chargeId: sp.telegram_payment_charge_id, at: Date.now(),
      });
      saveWallets();
      log(`⭐ КОЛЕКЦІЯ: ${p.tgId} купив «${coll?.name}» за ${sp.total_amount}⭐ (+${granted.length} предметів, ${sp.telegram_payment_charge_id})`);
      refCashback(p.tgId, sp.total_amount);
      bot.sendMessage(msg.chat.id, `🎉 Колекція «${coll?.name}» зібрана! +${granted.length} нових предметів. Одягай: гра → Колекція 🎴`).catch(() => {});
      if (onGranted) onGranted(p.tgId, 'coll', p.collId, { name: coll?.name || p.collId });
      return;
    }

    const w = grantSkin(p.tgId, p.kind, p.skinId);
    w.purchases.push({
      kind: p.kind, skinId: p.skinId, stars: sp.total_amount,
      chargeId: sp.telegram_payment_charge_id, at: Date.now(),
    });
    saveWallets();
    const def = getPurchasable(p.kind, p.skinId) || { name: p.skinId };
    log(`⭐ ПОКУПКА: ${p.tgId} купив ${p.kind}/${p.skinId} за ${sp.total_amount}⭐ (${sp.telegram_payment_charge_id})`);
    refCashback(p.tgId, sp.total_amount);
    bot.sendMessage(msg.chat.id, `✅ «${def.name}» тепер твій! Одягни його: гра → Колекція 🎴`).catch(() => {});
    if (onGranted) onGranted(p.tgId, p.kind, p.skinId, def);
  });
}

module.exports = { initPayments, createSkinInvoice, createCollectionInvoice, createPackInvoice, grantSkin, STAR_PACKS };
