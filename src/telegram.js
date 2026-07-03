// ─── Telegram бот: команди та меню ──────────────────────────────────────
const TelegramBot = require('node-telegram-bot-api');
const { BOT_TOKEN, APP_URL, BASE_ROOMS, DAILY_BONUS } = require('./config');
const { getWallet, saveWallets } = require('./wallets');
const { rooms } = require('./rooms');
const { createRoom } = require('./game');
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

  // Ім'я бота — для deep-link запрошень t.me/<бот>?startapp=<код>
  let botUsername = process.env.BOT_USERNAME || '';
  if (!botUsername) bot.getMe().then(me => { botUsername = me.username; }).catch(() => {});

  // Кнопка меню (☰ «Грати») оновлюється САМА на свіжий APP_URL при кожному
  // старті — не треба лізти в BotFather після перезапуску тунеля.
  // (Пряме посилання Mini App у /myapps БотFather оновити через API не можна.)
  if (APP_URL && APP_URL.startsWith('https://')) {
    const https = require('https');
    const payload = JSON.stringify({ menu_button: { type: 'web_app', text: '🎮 Грати', web_app: { url: APP_URL } } });
    const req = https.request({
      host: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/setChatMenuButton`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => { log(res.statusCode === 200 ? `📱 Кнопка меню бота → ${APP_URL}` : `⚠️ setChatMenuButton: HTTP ${res.statusCode}`); });
    req.on('error', () => {});
    req.end(payload);
  }

  // Не спамимо однаковими помилками
  let lastPollErr = '';
  bot.on('polling_error', (err) => {
    const msg = String(err?.message || err).slice(0, 120);
    if (msg !== lastPollErr) { log('TG polling: ' + msg); lastPollErr = msg; }
  });

  // ── Нова гра: кімната створюється тут, КОД зашитий у посилання ──
  // Друг тапає посилання t.me/<бот>?start=join_<КОД> → бот шле йому
  // «окно» з кнопкою «Увійти в гру» → кнопка закидає ОДРАЗУ за стіл.
  // Працює з будь-яким поточним APP_URL — BotFather чіпати не треба.
  async function sendNewGame(chatId, userId, userName) {
    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
    const room = createRoom(roomId);
    room.deposit = 0; room.pot = 0; room.isPublic = true;
    room.hostName = userName; room.createdAt = Date.now();
    rooms.set(roomId, room);

    const keyboard = [[{ text: '🎮 Увійти в гру', web_app: { url: gameUrl(userName, userId, roomId) } }]];
    if (botUsername) {
      const deep = `https://t.me/${botUsername}?start=join_${roomId}`;
      const share = `https://t.me/share/url?url=${encodeURIComponent(deep)}&text=${encodeURIComponent(`🃏 Заходь до мене в хФали! Стіл ${roomId}`)}`;
      keyboard.push([{ text: '📨 Поділитися кімнатою', url: share }]);
    }
    await bot.sendMessage(chatId,
      `🃏 Кімната *${roomId}* створена!\n\nНадішли друзям кнопкою нижче — вони отримають запрошення і зайдуть *одразу за стіл*, без коду.`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
  }

  bot.onText(/\/newgame/, (msg) =>
    sendNewGame(msg.chat.id, String(msg.from.id), msg.from.first_name || 'Гравець'));

  // Запрошення: другу приходить окреме повідомлення з кнопкою прямо в стіл
  async function sendJoinInvite(chatId, userId, userName, roomId) {
    const room = rooms.get(roomId);
    if (!room) {
      await bot.sendMessage(chatId, `❌ Стіл *${roomId}* вже не існує (застарів або гру зіграно).\nСтвори новий: /newgame`, { parse_mode: 'Markdown' });
      return;
    }
    const maxP = room.maxPlayers || 4;
    await bot.sendMessage(chatId,
      `🃏 Тебе запрошено до столу *${roomId}*!\n`
      + (room.hostName ? `👤 Хост: *${room.hostName}*\n` : '')
      + `👥 Гравців: *${room.players.length}/${maxP}*`
      + (room.deposit ? ` · Ставка: *${room.deposit}* 💰` : '')
      + `\n\nТисни кнопку — і ти одразу за столом 👇`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🎮 Увійти в гру', web_app: { url: gameUrl(userName, userId, roomId) } }]] } });
  }

  bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const userName = msg.from.first_name || 'Гравець';

    // Deep-link запрошення: /start join_<КОД>
    const payload = (match && match[1] || '').trim();
    if (payload.toLowerCase().startsWith('join_')) {
      return sendJoinInvite(chatId, userId, userName, payload.slice(5).toUpperCase());
    }

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
          [{ text: '🆕 Нова гра з друзями', callback_data: 'newgame' }],
          [{ text: '💰 Баланс', callback_data: 'balance' }, { text: '❓ Правила', callback_data: 'rules' }],
        ],
      },
    });
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = String(query.from.id);
    await bot.answerCallbackQuery(query.id);

    if (query.data === 'newgame') {
      await sendNewGame(chatId, userId, query.from.first_name || 'Гравець');
    }

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
      `🃏 *Команди*\n\n/start — Меню\n/newgame — Кімната для друзів\n/balance — Баланс\n/join КОД — В кімнату\n/daily — \\+${DAILY_BONUS} монет\n/help — Довідка`,
      { parse_mode: 'MarkdownV2' });
  });

  bot.setMyCommands([
    { command: 'start', description: '🎮 Головне меню' },
    { command: 'newgame', description: '🆕 Створити кімнату для друзів' },
    { command: 'balance', description: '💰 Мій баланс' },
    { command: 'daily', description: '🎁 Щоденна нагорода' },
    { command: 'help', description: '❓ Довідка' },
  ]).catch(() => {});

  log('✅ Telegram бот запущено (polling)');
  return bot;
}

module.exports = { startBot };
