// ─── Telegram бот: команди та меню ──────────────────────────────────────
const TelegramBot = require('node-telegram-bot-api');
const { BOT_TOKEN, APP_URL, BASE_ROOMS, DAILY_BONUS } = require('./config');
const { getWallet, saveWallets } = require('./wallets');
const { rooms } = require('./rooms');
const { log } = require('./logger');

function escMd(text) {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function gameUrl(userName, userId, roomId) {
  let url = `${APP_URL}/?name=${encodeURIComponent(userName)}&tgId=${userId}`;
  if (roomId) url += `&room=${roomId}`;
  return url;
}

function startBot() {
  if (!BOT_TOKEN) {
    log('⚠️  BOT_TOKEN не задано — бот вимкнено');
    return null;
  }

  const bot = new TelegramBot(BOT_TOKEN, { polling: true });

  // Не спамимо однаковими помилками
  let lastPollErr = '';
  bot.on('polling_error', (err) => {
    const msg = String(err?.message || err).slice(0, 120);
    if (msg !== lastPollErr) { log('TG polling: ' + msg); lastPollErr = msg; }
  });

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const userName = msg.from.first_name || 'Гравець';
    const wallet = getWallet(userId);
    const isNew = wallet.gamesPlayed === 0;

    const text = isNew
      ? `🃏 *Ласкаво просимо до хФали\\!*\n\nПривіт, *${escMd(userName)}*\\! Стартовий бонус\\:\n\n💰 *${wallet.coins} монет*\n\n👥 Гра для *4 гравців* \\(2 vs 2\\)\nПереможна команда забирає весь банк\\!`
      : `🃏 *хФали* — з поверненням, *${escMd(userName)}*\\!\n\n💰 Баланс: *${wallet.coins}*\n🎮 Ігор: *${wallet.gamesPlayed}* | 🏆 Перемог: *${wallet.wins}*`;

    await bot.sendMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Відкрити гру', web_app: { url: gameUrl(userName, userId) } }],
          [{ text: '💰 Баланс', callback_data: 'balance' }, { text: '❓ Правила', callback_data: 'rules' }],
        ],
      },
    });
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = String(query.from.id);
    await bot.answerCallbackQuery(query.id);

    if (query.data === 'balance') {
      const w = getWallet(userId);
      const wr = w.gamesPlayed > 0 ? Math.round(w.wins / w.gamesPlayed * 100) : 0;
      await bot.sendMessage(chatId,
        `💰 *Твій рахунок*\n\n┌ Монети: *${w.coins}* 💰\n├ Ігор: *${w.gamesPlayed}*\n├ Перемог: *${w.wins}* 🏆\n└ Вінрейт: *${wr}%*`,
        { parse_mode: 'Markdown' });
    }

    if (query.data === 'rules') {
      await bot.sendMessage(chatId,
        `📖 *Правила хФали*\n\n👥 *4 гравці* — команди 2 vs 2\n🃏 *36 карт*\n\n*Козирі:*\n1\\. Козирна 6 \\(найсильніша\\)\n2\\. Валети: ♣ \\> ♠ \\> ♥ \\> ♦\n3\\. A \\> K \\> Q \\> 10 \\> 9 \\> 8 \\> 7\n\n*Очки хвалящого:*\n≥5 дачок → \\+1 | <5 → \\-6 | 1 → \\-12 | 0 → \\-24\n\n*Банк:* переможна команда ділить депозити всіх\\!`,
        { parse_mode: 'MarkdownV2' });
    }
  });

  bot.onText(/\/balance/, async (msg) => {
    const w = getWallet(String(msg.from.id));
    const wr = w.gamesPlayed > 0 ? Math.round(w.wins / w.gamesPlayed * 100) : 0;
    await bot.sendMessage(msg.chat.id,
      `💰 *Баланс:* ${w.coins}\n🎮 Ігор: ${w.gamesPlayed} | 🏆 ${w.wins} | 📊 ${wr}%`,
      { parse_mode: 'Markdown' });
  });

  bot.onText(/\/join (.+)/, async (msg, match) => {
    const userId = String(msg.from.id);
    const userName = msg.from.first_name || 'Гравець';
    const roomId = match[1].trim().toUpperCase();
    if (!rooms.has(roomId)) {
      await bot.sendMessage(msg.chat.id, `❌ Кімната *${roomId}* не знайдена\\.`, { parse_mode: 'MarkdownV2' });
      return;
    }
    const room = rooms.get(roomId);
    await bot.sendMessage(msg.chat.id,
      `🃏 *Кімната ${escMd(roomId)}*\nГравців: *${room.players.length}/4* | Депозит: *${room.deposit || 0}* 💰`,
      { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: [[{ text: '🃏 Приєднатись', web_app: { url: gameUrl(userName, userId, roomId) } }]] } });
  });

  bot.onText(/\/daily/, async (msg) => {
    const w = getWallet(String(msg.from.id));
    w.coins += DAILY_BONUS;
    saveWallets();
    await bot.sendMessage(msg.chat.id,
      `🎁 *\\+${DAILY_BONUS} монет\\!* Баланс: *${w.coins}* 💰`,
      { parse_mode: 'MarkdownV2' });
  });

  bot.onText(/\/help/, async (msg) => {
    await bot.sendMessage(msg.chat.id,
      `🃏 *Команди*\n\n/start — Меню\n/balance — Баланс\n/join КОД — В кімнату\n/daily — \\+${DAILY_BONUS} монет\n/help — Довідка`,
      { parse_mode: 'MarkdownV2' });
  });

  bot.setMyCommands([
    { command: 'start', description: '🎮 Головне меню' },
    { command: 'balance', description: '💰 Мій баланс' },
    { command: 'daily', description: '🎁 Щоденна нагорода' },
    { command: 'help', description: '❓ Довідка' },
  ]).catch(() => {});

  log('✅ Telegram бот запущено (polling)');
  return bot;
}

module.exports = { startBot };
