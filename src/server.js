// ─── src/server.js ────────────────────────────────────────────────────────────
require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const {
  createRoom, startRound, chooseTrump, showNinthCard,
  confirmTrumpFromLast, playCard, endRound, advanceRound, publicState,
} = require('./game');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── Стан у пам'яті (для прод замінити на Redis) ──────────────────────────────
const rooms = new Map();          // roomId → room
const socketToPlayer = new Map(); // socketId → {roomId, playerIndex}

// ─── Telegram Bot ─────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

let bot;
if (BOT_TOKEN) {
  bot = new TelegramBot(BOT_TOKEN, { polling: true });

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId,
      `🃏 *хФали* — карткова гра для 4 гравців\n\n` +
      `Команди:\n• Команда A: гравці 1 & 3\n• Команда B: гравці 2 & 4\n\n` +
      `Натисни *Нова гра* щоб створити кімнату і запросити друзів!`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🎮 Нова гра', callback_data: 'new_room' }
          ]]
        }
      }
    );
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const userName = query.from.first_name || `Гравець`;

    if (query.data === 'new_room') {
      const roomId = uuidv4().slice(0, 8).toUpperCase();
      const room = createRoom(roomId);
      rooms.set(roomId, room);

      const gameUrl = `${APP_URL}/?room=${roomId}&name=${encodeURIComponent(userName)}&tgId=${userId}`;
      const inviteUrl = `${APP_URL}/invite.html?room=${roomId}`;

      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId,
        `🎮 Кімната *${roomId}* створена!\n\n` +
        `Надішли цей код друзям або кнопку нижче.\n` +
        `Потрібно 4 гравці щоб почати.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🃏 Увійти в гру', web_app: { url: gameUrl } }],
              [{ text: '📨 Поділитися кімнатою', switch_inline_query: `Приєднуйся до гри хФали! Код: ${roomId}\n${APP_URL}/?room=${roomId}` }],
              [{ text: `Код: ${roomId}`, callback_data: `code_${roomId}` }]
            ]
          }
        }
      );
    }

    if (query.data.startsWith('code_')) {
      await bot.answerCallbackQuery(query.id, { text: `Код кімнати: ${query.data.slice(5)}`, show_alert: true });
    }
  });

  // Команда для приєднання по коду
  bot.onText(/\/join (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'Гравець';
    const roomId = match[1].trim().toUpperCase();

    if (!rooms.has(roomId)) {
      await bot.sendMessage(chatId, `❌ Кімната *${roomId}* не знайдена.`, { parse_mode: 'Markdown' });
      return;
    }

    const gameUrl = `${APP_URL}/?room=${roomId}&name=${encodeURIComponent(userName)}&tgId=${userId}`;
    await bot.sendMessage(chatId, `Входиш у кімнату *${roomId}*:`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🃏 Грати', web_app: { url: gameUrl } }]]
      }
    });
  });

  bot.onText(/\/rooms/, async (msg) => {
    const list = [...rooms.values()]
      .filter(r => r.phase === 'waiting' && r.players.length < 4)
      .slice(0, 5);
    if (!list.length) {
      await bot.sendMessage(msg.chat.id, 'Немає відкритих кімнат. Створи нову через /start');
      return;
    }
    const text = list.map(r => `• Кімната ${r.id} — ${r.players.length}/4 гравців`).join('\n');
    await bot.sendMessage(msg.chat.id, `Відкриті кімнати:\n${text}`);
  });

  console.log('✅ Telegram бот запущено (polling)');
} else {
  console.warn('⚠️  BOT_TOKEN не задано — бот вимкнено');
}

// ─── Socket.io — ігрова логіка в реалтаймі ────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Підключено: ${socket.id}`);

  // Гравець входить у кімнату
  socket.on('join_room', ({ roomId, name, tgId }) => {
    let room = rooms.get(roomId);
    if (!room) {
      // Автоматично створюємо якщо зайшли по посиланню
      room = createRoom(roomId);
      rooms.set(roomId, room);
    }

    // Перевіряємо чи гравець вже є (реконект)
    let existingPlayer = room.players.find(p => p.tgId === tgId || p.socketId === socket.id);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      socketToPlayer.set(socket.id, { roomId, playerIndex: existingPlayer.index });
      socket.join(roomId);
      socket.emit('joined', { playerIndex: existingPlayer.index, roomId });
      broadcastState(room);
      return;
    }

    if (room.players.length >= 4) {
      socket.emit('error', { message: 'Кімната заповнена (4/4)' });
      return;
    }

    if (room.phase !== 'waiting') {
      socket.emit('error', { message: 'Гра вже розпочалась' });
      return;
    }

    const playerIndex = room.players.length;
    const player = { id: socket.id, socketId: socket.id, name: name || `Гравець ${playerIndex + 1}`, tgId, index: playerIndex };
    room.players.push(player);
    socketToPlayer.set(socket.id, { roomId, playerIndex });
    socket.join(roomId);

    socket.emit('joined', { playerIndex, roomId });
    broadcastState(room);

    // Якщо 4 гравці — починаємо
    if (room.players.length === 4) {
      room.boaster = 0;
      room.dealer = 2;
      room.roundNum = 1;
      startRound(room);
      broadcastState(room);
      io.to(roomId).emit('game_started', { message: `Гра розпочалась! Хвалящий: ${room.players[0].name}` });
    }
  });

  // Вибір козиря
  socket.on('choose_trump', ({ suit }) => {
    const meta = socketToPlayer.get(socket.id);
    if (!meta) return;
    const room = rooms.get(meta.roomId);
    if (!room || room.phase !== 'choose_trump') return;
    if (meta.playerIndex !== room.boaster) {
      socket.emit('error', { message: 'Тільки хвалящий обирає козир' });
      return;
    }
    chooseTrump(room, suit);
    broadcastState(room);
  });

  // "На останню"
  socket.on('show_ninth', () => {
    const meta = socketToPlayer.get(socket.id);
    if (!meta) return;
    const room = rooms.get(meta.roomId);
    if (!room || room.phase !== 'choose_trump') return;
    if (meta.playerIndex !== room.boaster) return;
    showNinthCard(room);
    broadcastState(room);
  });

  // Підтвердження козиря після 9-ї карти
  socket.on('confirm_trump_last', ({ suit }) => {
    const meta = socketToPlayer.get(socket.id);
    if (!meta) return;
    const room = rooms.get(meta.roomId);
    if (!room || room.phase !== 'show9') return;
    if (meta.playerIndex !== room.boaster) return;
    confirmTrumpFromLast(room, suit);
    broadcastState(room);
  });

  // Хід картою
  socket.on('play_card', ({ cardId }) => {
    const meta = socketToPlayer.get(socket.id);
    if (!meta) return;
    const room = rooms.get(meta.roomId);
    if (!room) return;

    const result = playCard(room, meta.playerIndex, cardId);
    if (!result.ok) {
      socket.emit('error', { message: result.error });
      return;
    }

    if (result.trickDone) {
      broadcastState(room);
      io.to(meta.roomId).emit('trick_won', { winner: result.trickWinner, winnerName: room.players[result.trickWinner]?.name });

      if (result.roundDone) {
        setTimeout(() => {
          const roundResult = endRound(room);
          broadcastState(room);
          io.to(meta.roomId).emit('round_ended', {
            ...roundResult,
            scores: room.scores,
            players: room.players.map(p => p.name),
          });
        }, 1500);
      } else {
        setTimeout(() => {
          room.trick = [];
          room.currentPlayer = result.trickWinner;
          broadcastState(room);
        }, 1500);
      }
    } else {
      broadcastState(room);
    }
  });

  // Наступний раунд
  socket.on('next_round', () => {
    const meta = socketToPlayer.get(socket.id);
    if (!meta) return;
    const room = rooms.get(meta.roomId);
    if (!room || room.phase !== 'round_end') return;
    // Будь-який гравець може ініціювати (або можна обмежити до одного)
    advanceRound(room);
    broadcastState(room);
  });

  socket.on('disconnect', () => {
    const meta = socketToPlayer.get(socket.id);
    if (meta) {
      const room = rooms.get(meta.roomId);
      if (room) {
        const player = room.players[meta.playerIndex];
        if (player) player.online = false;
        io.to(meta.roomId).emit('player_disconnected', { playerIndex: meta.playerIndex, name: player?.name });
      }
      socketToPlayer.delete(socket.id);
    }
    console.log(`🔌 Відключено: ${socket.id}`);
  });
});

// Розсилає кожному гравцю його персональний стан
function broadcastState(room) {
  for (const player of room.players) {
    const sock = io.sockets.sockets.get(player.socketId);
    if (sock) {
      sock.emit('state', publicState(room, player.index));
    }
  }
}

// ─── HTTP маршрути ────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size }));

// Підключення Telegram WebApp Manifest
app.get('/manifest.json', (_, res) => {
  res.json({
    name: 'хФали',
    short_name: 'хФали',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d1f2d',
    theme_color: '#f9ca24',
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Сервер запущено: http://localhost:${PORT}`);
  console.log(`🌐 APP_URL: ${APP_URL}`);
});
