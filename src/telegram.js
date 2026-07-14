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

// Сповіщення користувачу з будь-якого модуля (реферали, продажі на ринку)
let botRef = null;
function notifyUser(tgId, text) {
  if (!botRef) return;
  botRef.sendMessage(tgId, text, { parse_mode: 'Markdown' }).catch(() => {});
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
  botRef = bot; // для notifyUser

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

    // Формат як у «старому» варіанті: Увійти / Поділитися / Код
    const keyboard = [[{ text: '🃏 Увійти в гру', web_app: { url: gameUrl(userName, userId, roomId) } }]];
    if (botUsername) {
      const deep = `https://t.me/${botUsername}?start=join_${roomId}`;
      const share = `https://t.me/share/url?url=${encodeURIComponent(deep)}&text=${encodeURIComponent(`🃏 Заходь до мене в хФали! Стіл ${roomId}`)}`;
      keyboard.push([{ text: '📨 Поділитися кімнатою', url: share }]);
    }
    keyboard.push([{ text: `Код: ${roomId}`, callback_data: `code_${roomId}` }]);
    await bot.sendMessage(chatId,
      `🎮 Кімната *${roomId}* створена!\n\nНадішли цей код друзям або кнопку нижче.\nПотрібно 4 гравці щоб почати.`,
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

    const payload = (match && match[1] || '').trim();
    // Deep-link запрошення до столу: /start join_<КОД>
    if (payload.toLowerCase().startsWith('join_')) {
      return sendJoinInvite(chatId, userId, userName, payload.slice(5).toUpperCase());
    }

    const wallet = getWallet(userId);
    const isNew = wallet.gamesPlayed === 0;

    // Реферал: /start ref_<tgId> — новачок одразу отримує бонус,
    // запрошувач — після ПЕРШОЇ зіграної гри друга (захист від накрутки)
    let refLine = '';
    const refM = payload.match(/^ref_(\d+)$/);
    if (refM && isNew && !wallet.referredBy && refM[1] !== userId) {
      wallet.referredBy = refM[1];
      wallet.coins += 300;
      saveWallets();
      refLine = `\n🎁 *\\+300 монет* — бонус від друга\\!\n`;
      notifyUser(refM[1], `👋 *${userName}* прийняв твоє запрошення! Зіграє першу гру — тобі впаде *+300 💰 і +5 💎*`);
    }

    // Реф-посилання цього гравця (кнопка «Запросити друга»)
    const refDeep = botUsername ? `https://t.me/${botUsername}?start=ref_${userId}` : APP_URL;
    const refShare = `https://t.me/share/url?url=${encodeURIComponent(refDeep)}&text=${encodeURIComponent('🃏 Заходь у хФали — карткова гра прямо в Telegram! Тобі одразу +300 монет 🎁')}`;

    const text = isNew
      ? `🃏 *хФали* — карткова гра в Telegram\\!\n${escMd(refLine)}\nПривіт, *${escMd(userName)}*\\! Починається все просто:\n\n1️⃣ Тисни *«Відкрити гру»*\n2️⃣ Запроси друга — граємо 2 vs 2\n3️⃣ Переможці ділять банк 💰\n\nСтартовий баланс: *${wallet.coins}* 💰\nА ще: Дурак, скіни\\-колекції, ринок і клани\\!`
      : `🃏 *хФали* — з поверненням, *${escMd(userName)}*\\!\n\n💰 Баланс: *${wallet.coins}*\n🎮 Ігор: *${wallet.gamesPlayed}* | 🏆 Перемог: *${wallet.wins}*${wallet.refCount ? `\n👥 Команда: *${wallet.refCount}* друзів` : ''}${wallet.refEarnedGems ? ` | 💎 Зароблено на команді: *${wallet.refEarnedGems}*` : ''}`;

    const kb = [
      [{ text: '🎮 Відкрити гру', web_app: { url: gameUrl(userName, userId) } }],
      [{ text: '📨 Збери команду: 25% + 10% з покупок', url: refShare }],
      [{ text: '🆕 Стіл з друзями', callback_data: 'newgame' }, { text: '📖 Правила', callback_data: 'rules' }],
    ];
    if (process.env.GROUP_LINK) kb.push([{ text: '👥 Спільнота гравців', url: process.env.GROUP_LINK }]);

    await bot.sendMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard: kb },
    });
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = String(query.from.id);
    await bot.answerCallbackQuery(query.id);

    if (query.data === 'newgame') {
      await sendNewGame(chatId, userId, query.from.first_name || 'Гравець');
    }

    if (query.data.startsWith('code_')) {
      // тап по «Код: XXX» — показуємо код, щоб зручно продиктувати/переслати
      await bot.sendMessage(chatId, `Код кімнати: \`${query.data.slice(5)}\`\nДруг вводить його в грі: Кімнати → За кодом`, { parse_mode: 'Markdown' });
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

  // ══ ГРУПОВІ КОМАНДИ: колекція, ринок, запит карти ══════════════════
  // У групах web_app-кнопки не працюють — даємо deep-link на бота.
  const gameLink = () => botUsername ? `https://t.me/${botUsername}?startapp=play` : APP_URL;

  // /collection — моя колекція (працює і в групі: похвалитись)
  bot.onText(/\/collection/, async (msg) => {
    const userId = String(msg.from.id);
    const name = msg.from.first_name || 'Гравець';
    const w = getWallet(userId);
    const { collectionsState } = require('./collections');
    const colls = collectionsState(w);
    const lines = colls.map(c => {
      const bar = c.owned === c.total ? '✅' : `${c.owned}/${c.total}`;
      return `${c.emoji} ${c.name}: *${bar}*`;
    }).join('\n');
    const totalOwned = colls.reduce((s, c) => s + c.owned, 0);
    const total = colls.reduce((s, c) => s + c.total, 0);
    await bot.sendMessage(msg.chat.id,
      `🎴 *Колекція гравця ${escMd(name)}*\n\n${lines}\n\nРазом: *${totalOwned}/${total}* предметів`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🎮 Відкрити гру', url: gameLink() }]] } });
  });

  // /market — топ лотів ринку
  bot.onText(/\/market/, async (msg) => {
    const market = require('./market');
    const list = market.getListings().slice(0, 8);
    const text = list.length
      ? list.map(l => {
          const cur = l.price.coins ? `${l.price.coins} 💰` : `${l.price.gems} 💎`;
          return `• *${escMd(l.def?.name || l.skinId)}* — ${cur} (від ${escMd(l.sellerName)})`;
        }).join('\n')
      : '_Ринок порожній — вистав щось першим!_';
    await bot.sendMessage(msg.chat.id,
      `🛒 *Ринок хФали* (комісія ${market.FEE_PCT}%)\n\n${text}`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🛒 До ринку', url: gameLink() }]] } });
  });

  // /wish <назва карти> — запросити карту в групі («хто продасть?»)
  bot.onText(/\/wish(?:@\w+)?(?:\s+(.+))?/, async (msg, match) => {
    const name = msg.from.first_name || 'Гравець';
    const want = (match && match[1] || '').trim().slice(0, 40);
    if (!want) {
      await bot.sendMessage(msg.chat.id, `Напиши, яку карту шукаєш: \`/wish Мамка-дракон\``, { parse_mode: 'Markdown' });
      return;
    }
    await bot.sendMessage(msg.chat.id,
      `📢 *${escMd(name)}* шукає карту *«${escMd(want)}»*!\n\nМаєш зайву? Вистав на ринок — і забирай монети 💰`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🛒 Виставити на ринок', url: gameLink() }]] } });
  });

  bot.onText(/\/help/, async (msg) => {
    await bot.sendMessage(msg.chat.id,
      `🃏 *Як почати грати*\n\n1️⃣ /start → «Відкрити гру»\n2️⃣ «Зіграти з другом» → обери чат — запрошення полетить само\n3️⃣ Друг тисне кнопку і вже за столом\n\n*Команди:*\n/newgame — стіл для друзів\n/collection — моя колекція карт\n/market — ринок скінів\n/wish — шукаю карту \\(в групі\\)\n/balance — баланс\n/daily — \\+${DAILY_BONUS} монет щодня\n\n💡 Запрошуй друзів через /start → «Запросити друга» — *\\+300 💰 обом*\\!`,
      { parse_mode: 'MarkdownV2' });
  });

  bot.setMyCommands([
    { command: 'start', description: '🎮 Головне меню' },
    { command: 'newgame', description: '🆕 Створити кімнату для друзів' },
    { command: 'collection', description: '🎴 Моя колекція карт' },
    { command: 'market', description: '🛒 Ринок скінів' },
    { command: 'wish', description: '📢 Шукаю карту (в групі)' },
    { command: 'balance', description: '💰 Мій баланс' },
    { command: 'daily', description: '🎁 Щоденна нагорода' },
    { command: 'help', description: '❓ Довідка' },
  ]).catch(() => {});

  log('✅ Telegram бот запущено (polling)');
  return bot;
}

module.exports = { startBot, notifyUser };
