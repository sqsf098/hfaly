// ─── Налаштування гри. Міняй значення тут — не лізь у код ──────────────
try { require('dotenv').config(); } catch (e) { /* dotenv опційний */ }

module.exports = {
  PORT: process.env.PORT || 3000,
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  BOT_TOKEN: process.env.BOT_TOKEN,

  // Економіка
  STARTING_COINS: 500,
  DAILY_BONUS: 100,

  // ── Авторизація (Telegram initData) ─────────────────────────────
  AUTH: {
    // Вимагати підписаний Telegram initData для всіх дій із гаманцем.
    // За замовчуванням: увімкнено в production, якщо є BOT_TOKEN.
    // Перекрити вручну: REQUIRE_TG_AUTH=true|false у .env
    REQUIRE: process.env.REQUIRE_TG_AUTH != null
      ? process.env.REQUIRE_TG_AUTH === 'true'
      : (!!process.env.BOT_TOKEN && process.env.NODE_ENV === 'production'),
    MAX_AGE_SEC: 24 * 60 * 60, // підпис initData старший за добу — недійсний
  },

  // ── Блокчейн (TON) для NFT-карт ──────────────────────────────────
  TON: {
    NETWORK: process.env.TON_NETWORK || 'testnet',        // testnet | mainnet
    COLLECTION_ADDRESS: process.env.NFT_COLLECTION_ADDRESS || '', // адреса розгорнутої NFT-колекції
    TONAPI_KEY: process.env.TONAPI_KEY || '',             // опційно (вищі ліміти tonapi.io)
    MINTER_MNEMONIC: process.env.MINTER_MNEMONIC || '',   // 24 слова кошелька-мінтера (server mint)
    // Вимагати криптографічний TON Connect proof при прив'язці гаманця.
    // В dev можна лишити false; у проді — true.
    REQUIRE_PROOF: process.env.TON_REQUIRE_PROOF === 'true',
    MINT_PRICE_TON: process.env.NFT_MINT_PRICE_TON || '1', // ціна мінту для гравця (в TON)
  },

  // Кімнати
  ROOM_TTL_MS: 2 * 60 * 60 * 1000,        // приватна кімната живе 2 год
  EMPTY_ROOM_TTL_MS: 10 * 60 * 1000,      // порожня — 10 хв
  CLEANUP_INTERVAL_MS: 10 * 60 * 1000,    // перевірка кожні 10 хв

  BASE_ROOMS: [
    { id: 'STARTER', name: 'Стартер', emoji: '🌱', deposit: 50,   minCoins: 0,    color: '#27ae60', desc: 'Для новачків' },
    { id: 'BRONZE',  name: 'Бронза',  emoji: '🥉', deposit: 200,  minCoins: 100,  color: '#cd7f32', desc: 'Звичайна гра' },
    { id: 'SILVER',  name: 'Срібло',  emoji: '🥈', deposit: 500,  minCoins: 300,  color: '#95a5a6', desc: 'Середній рівень' },
    { id: 'GOLD',    name: 'Золото',  emoji: '🥇', deposit: 1500, minCoins: 1000, color: '#f1c40f', desc: 'Для досвідчених' },
  ],

  // Боти
  BOT_THINK_MS: 550, // швидший темп ходів — гра не відчувається «підвислою»
};
