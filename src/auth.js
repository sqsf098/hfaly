// ─── Перевірка Telegram initData: хто гравець НАСПРАВДІ ──────────────────
// Раніше tgId приходив із клієнта як є — будь-хто міг видати себе за
// будь-кого. Тепер клієнт передає window.Telegram.WebApp.initData, а сервер
// перевіряє підпис HMAC-SHA256 (алгоритм із документації Telegram) і бере
// ID користувача з ПІДПИСАНИХ даних, ігноруючи tgId з payload.
const crypto = require('crypto');
const { BOT_TOKEN, AUTH } = require('./config');
const { log } = require('./logger');

// Повертає { user, authDate } якщо підпис валідний, інакше null
function verifyInitData(initData, maxAgeSec = AUTH.MAX_AGE_SEC) {
  if (!initData || !BOT_TOKEN) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n');

    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

    const a = Buffer.from(calc, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const authDate = Number(params.get('auth_date')) || 0;
    if (maxAgeSec && Date.now() / 1000 - authDate > maxAgeSec) return null; // застарілий підпис

    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !user.id) return null;
    return { user, authDate };
  } catch (e) {
    log('verifyInitData: ' + e.message);
    return null;
  }
}

// Socket.io middleware: перевіряє initData один раз при підключенні.
// Верифікований ID кладеться в socket.data.tgId — обробники беруть його звідти.
function socketAuthMiddleware(socket, next) {
  const initData = socket.handshake.auth && socket.handshake.auth.initData;
  const v = verifyInitData(initData);
  if (v) {
    socket.data.tgId = String(v.user.id);
    socket.data.tgUser = v.user;
    return next();
  }
  if (AUTH.REQUIRE) return next(new Error('Потрібна авторизація через Telegram'));
  return next(); // dev/браузер: пропускаємо без верифікації (гостьовий режим)
}

// Єдине джерело правди про tgId у обробниках:
//  1) верифікований Telegram ID (завжди пріоритет, payload ігнорується)
//  2) якщо auth обов'язковий і його нема — null (відмова)
//  3) інакше (dev) — tgId з payload або анонім за socket.id
function resolveTgId(socket, payloadTgId) {
  if (socket.data && socket.data.tgId) return socket.data.tgId;
  if (AUTH.REQUIRE) return null;
  return String(payloadTgId || 'anon_' + socket.id);
}

module.exports = { verifyInitData, socketAuthMiddleware, resolveTgId };
