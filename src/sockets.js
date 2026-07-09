// ─── Socket.io: всі обробники подій від гравців ─────────────────────────
const { rooms, socketToPlayer, resetBaseRoom } = require('./rooms');
const { getWallet, saveWallets, playerWallets } = require('./wallets');
const { createRoom, startRound, chooseTrump, showNinthCard, confirmTrumpFromLast, playCard, endRound, advanceRound, publicState, discardThree } = require('./game');
const { createBot } = require('./bot-ai');
const { runBots } = require('./bots');
const { openChest, claimQuest, economyState, addQuestProgress } = require('./economy');
const { linkWallet, unlinkWallet, syncNfts, requestMint, tonState } = require('./ton');
const { socketAuthMiddleware, resolveTgId } = require('./auth');
const { holdDeposit, releaseDeposit } = require('./escrow');
const { getBackSkins, getCardSkins } = require('./skins');
const { createSkinInvoice, createCollectionInvoice } = require('./payments');
const { collectionsState } = require('./collections');
const market = require('./market');
const durak = require('./durak');
const clans = require('./clans');
const { log } = require('./logger');

let io = null;

// Надіслати актуальний стан економіки конкретному сокету
function sendEconomy(socket, tgId) {
  socket.emit('economy', economyState(getWallet(String(tgId))));
}

// Нарахувати прогрес щоденних квестів реальному гравцю (боти ігноруються)
function questProgress(room, playerIndex, type, amount = 1) {
  const player = room.players[playerIndex];
  if (!player || player.isBot) return;
  const tgId = room.playerTgIds?.[playerIndex] || player.tgId;
  if (!tgId || String(tgId).startsWith('bot_')) return;
  const w = getWallet(tgId);
  const done = addQuestProgress(w, type, amount);
  saveWallets();
  const sock = io.sockets.sockets.get(player.socketId);
  if (sock) {
    sock.emit('economy', economyState(w));
    for (const q of done) sock.emit('quest_done', { text: q.text });
  }
}

function broadcastState(room) {
  const stateFn = room.mode === 'durak' && room.durak ? durak.publicState : publicState;
  for (const player of room.players) {
    if (player.isBot) continue; // ботам стан не потрібен; гравцю, що вийшов — тим паче
    const sock = io.sockets.sockets.get(player.socketId);
    if (sock) sock.emit('state', stateFn(room, player.index));
  }
}

// Обгортка: помилка в обробнику не валить сервер
function safeOn(socket, event, handler) {
  socket.on(event, (...args) => {
    try { handler(...args); }
    catch (e) { log(`Помилка в '${event}': ${e.message}`); }
  });
}

function tryStartGame(room) {
  if (room.players.length !== (room.maxPlayers || 4)) return;
  if (room.mode === 'durak') {
    durak.startGame(room);
  } else {
    if (room.mode !== 'khrest') { room.boaster = 0; room.dealer = 2; }
    room.roundNum = 1;
    startRound(room); // khrest сам ставить boaster (J♣) і фазу discard
  }
  broadcastState(room);
  io.to(room.id).emit('game_started', { message: `Гра розпочалась! Банк: ${room.pot || 0} 💰` });
  setTimeout(() => runBots(room.id), 600);
}

// ── Дурак: виплата — програв лише «дурак», решта ділять банк ──────────
function durakPayout(room) {
  if (room.payoutDone) return;
  room.payoutDone = true;
  const d = room.durak;
  const n = room.players.length;
  const isReal = (tgId) => tgId && !String(tgId).startsWith('bot_') && !String(tgId).startsWith('bot_tg_');
  const winners = room.players.map((_, i) => i).filter(i => i !== d.loserIndex);
  const pot = room.pot || 0;
  const share = winners.length ? Math.floor(pot / winners.length) : 0;
  const payouts = {};
  for (let i = 0; i < n; i++) {
    const tgId = room.playerTgIds?.[i];
    if (!isReal(tgId)) continue;
    const w = getWallet(tgId);
    if (i === d.loserIndex) {
      w.gamesPlayed++; if (room.deposit) w.totalLost += room.deposit;
      payouts[i] = { delta: -(room.deposit || 0), coins: w.coins };
    } else {
      if (share > 0) { w.coins += share; w.totalWon += share; }
      w.wins++; w.gamesPlayed++;
      payouts[i] = { delta: +share, coins: w.coins };
      questProgress(room, i, 'win_game');
    }
    const sock = io.sockets.sockets.get(room.players[i]?.socketId);
    if (sock) sock.emit('wallet', w);
  }
  for (const tgId of room.playerTgIds || []) if (isReal(tgId)) releaseDeposit(tgId, room.id);
  saveWallets();
  for (let i = 0; i < n; i++) questProgress(room, i, 'play_games');
  io.to(room.id).emit('game_finished', {
    mode: 'durak', loserIndex: d.loserIndex,
    loserName: room.players[d.loserIndex]?.name || '—',
    winTeam: winners, loseTeam: [d.loserIndex], pot, share, payouts,
  });
  if (room.isBaseRoom) setTimeout(() => resetBaseRoom(room.id), 4000);
}

function distributeWinnings(room) {
  if (room.payoutDone) return;
  room.payoutDone = true;

  // хФали: рахунок команди = рахунок її гравця, МЕНШИЙ штраф → переможець.
  // Хрестовець: програв той, хто набрав 24; двоє інших ділять банк.
  let winTeam, loseTeam, scoreA, scoreB;
  if (room.mode === 'khrest') {
    const mx = Math.max(...room.scores);
    const loser = room.scores.indexOf(mx);
    winTeam = [0, 1, 2].filter(i => i !== loser);
    loseTeam = [loser];
    scoreA = room.scores[winTeam[0]]; scoreB = mx;
  } else {
    scoreA = room.scores[0];
    scoreB = room.scores[1];
    winTeam = scoreA <= scoreB ? [0, 2] : [1, 3];
    loseTeam = scoreA <= scoreB ? [1, 3] : [0, 2];
  }
  const pot = room.pot || 0;
  const share = Math.floor(pot / 2);
  const payouts = {};

  const isReal = (tgId) => tgId && !String(tgId).startsWith('bot_') && !String(tgId).startsWith('bot_tg_');

  for (const idx of winTeam) {
    const tgId = room.playerTgIds?.[idx];
    if (!isReal(tgId)) continue;
    const w = getWallet(tgId);
    if (share > 0) { w.coins += share; w.totalWon += share; }
    w.wins++; w.gamesPlayed++;
    payouts[idx] = { delta: +share, coins: w.coins };
    const sock = io.sockets.sockets.get(room.players[idx]?.socketId);
    if (sock) sock.emit('wallet', w);
  }
  for (const idx of loseTeam) {
    const tgId = room.playerTgIds?.[idx];
    if (!isReal(tgId)) continue;
    const w = getWallet(tgId);
    w.gamesPlayed++; if (room.deposit) w.totalLost += room.deposit;
    payouts[idx] = { delta: -(room.deposit || 0), coins: w.coins };
    const sock = io.sockets.sockets.get(room.players[idx]?.socketId);
    if (sock) sock.emit('wallet', w);
  }

  // Гра завершена — депозити зіграні, закриваємо ескроу-записи
  for (const tgId of room.playerTgIds || []) {
    if (isReal(tgId)) releaseDeposit(tgId, room.id);
  }

  saveWallets();

  // Квести: зіграв гру — усі реальні гравці; виграв — переможці
  for (let i = 0; i < 4; i++) questProgress(room, i, 'play_games');
  for (const idx of winTeam) questProgress(room, idx, 'win_game');

  io.to(room.id).emit('game_finished', { winTeam, loseTeam, pot, share, payouts, scoreA, scoreB });
  if (room.isBaseRoom) setTimeout(() => resetBaseRoom(room.id), 4000);
}

function registerHandlers(serverIo) {
  io = serverIo;

  // Перевірка Telegram initData один раз при підключенні (див. auth.js)
  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {

    // Верифікований tgId із сокета; payload-ний tgId — лише як dev-fallback.
    // null → авторизація обов'язкова, але її нема (відмовляємо).
    function uid(payloadTgId) {
      const id = resolveTgId(socket, payloadTgId);
      if (!id) socket.emit('error', { message: 'Потрібна авторизація через Telegram' });
      // кеш у socket.data: адресні розсилки (клан-чат, продажі, покупки)
      // знаходять сокет і в dev-режимі без Telegram-підпису
      else if (!socket.data.tgId) socket.data.tgId = id;
      return id;
    }

    safeOn(socket, 'get_wallet', ({ tgId }) => {
      const id = uid(tgId); if (!id) return;
      socket.emit('wallet', getWallet(id));
    });

    // ── Економіка: скрині + квести ─────────────────────────────
    safeOn(socket, 'get_economy', ({ tgId }) => {
      const id = uid(tgId); if (!id) return;
      sendEconomy(socket, id);
    });

    safeOn(socket, 'open_chest', ({ tgId, chestId }) => {
      const id = uid(tgId); if (!id) return;
      const w = getWallet(id);
      const res = openChest(w, chestId);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      saveWallets();
      socket.emit('chest_opened', { chestId, reward: res.reward, gained: res.gained });
      socket.emit('economy', economyState(w));
      socket.emit('wallet', w);
    });

    safeOn(socket, 'claim_quest', ({ tgId, questId }) => {
      const id = uid(tgId); if (!id) return;
      const w = getWallet(id);
      const res = claimQuest(w, questId);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      saveWallets();
      socket.emit('quest_claimed', { questId, gained: res.gained });
      socket.emit('economy', economyState(w));
      socket.emit('wallet', w);
    });

    // ── TON / NFT-карти ────────────────────────────────────────
    safeOn(socket, 'get_ton', ({ tgId }) => {
      const id = uid(tgId); if (!id) return;
      socket.emit('ton_state', tonState(getWallet(id)));
    });

    safeOn(socket, 'link_wallet', ({ tgId, address, proof, publicKey }) => {
      const id = uid(tgId); if (!id) return;
      const w = getWallet(id);
      const res = linkWallet(w, address, proof, publicKey);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      saveWallets();
      socket.emit('ton_state', tonState(w));
      // одразу синхронізуємо володіння
      syncNfts(w).then(() => { saveWallets(); socket.emit('ton_state', tonState(w)); socket.emit('economy', economyState(w)); });
    });

    safeOn(socket, 'unlink_wallet', ({ tgId }) => {
      const id = uid(tgId); if (!id) return;
      const w = getWallet(id);
      unlinkWallet(w);
      saveWallets();
      socket.emit('ton_state', tonState(w));
    });

    safeOn(socket, 'sync_nfts', async ({ tgId }) => {
      const id = uid(tgId); if (!id) return;
      const w = getWallet(id);
      const res = await syncNfts(w);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      saveWallets();
      socket.emit('ton_state', tonState(w));
      socket.emit('economy', economyState(w));
    });

    safeOn(socket, 'request_mint', async ({ tgId, nftId }) => {
      const id = uid(tgId); if (!id) return;
      const w = getWallet(id);
      const res = await requestMint(w, nftId);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      socket.emit('mint_tx', res);
    });

    // ── Магазин: купити скін за Telegram Stars ⭐ ────────────────
    // Сервер створює інвойс (XTR), клієнт відкриває через openInvoice.
    // Видача — у payments.js після successful_payment.
    safeOn(socket, 'buy_skin', async ({ tgId, kind, skinId }) => {
      const id = uid(tgId); if (!id) return;
      const res = await createSkinInvoice(id, kind, skinId);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      socket.emit('invoice', { link: res.link, kind, skinId, stars: res.stars });
    });

    // ── Колекції: прогрес + покупка бандла за ⭐ ─────────────────
    safeOn(socket, 'get_collections', ({ tgId }) => {
      const id = uid(tgId); if (!id) return;
      socket.emit('collections', collectionsState(getWallet(id)));
    });

    safeOn(socket, 'buy_collection', async ({ tgId, collId }) => {
      const id = uid(tgId); if (!id) return;
      const res = await createCollectionInvoice(id, collId);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      socket.emit('invoice', { link: res.link, collId, stars: res.stars });
    });

    // ── Ринок: гравець ↔ гравець за монети/гемы (комісія 10%) ────
    safeOn(socket, 'market_get', () => {
      socket.emit('market', { listings: market.getListings(), fee: market.FEE_PCT });
    });

    safeOn(socket, 'market_list', ({ tgId, kind, skinId, price }) => {
      const id = uid(tgId); if (!id) return;
      const w = getWallet(id);
      const res = market.listSkin(id, w.name, kind, skinId, price);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      socket.emit('wallet', w);
      socket.emit('market', { listings: market.getListings(), fee: market.FEE_PCT });
      socket.emit('market_ok', { action: 'list' });
    });

    safeOn(socket, 'market_cancel', ({ tgId, listingId }) => {
      const id = uid(tgId); if (!id) return;
      const res = market.cancelListing(id, listingId);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      socket.emit('wallet', getWallet(id));
      socket.emit('market', { listings: market.getListings(), fee: market.FEE_PCT });
      socket.emit('market_ok', { action: 'cancel' });
    });

    safeOn(socket, 'market_buy', ({ tgId, listingId }) => {
      const id = uid(tgId); if (!id) return;
      const res = market.buyListing(id, listingId);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      socket.emit('wallet', getWallet(id));
      socket.emit('market', { listings: market.getListings(), fee: market.FEE_PCT });
      socket.emit('market_ok', { action: 'buy', name: res.name });
      // продавець онлайн → миттєве сповіщення про продаж
      for (const [, s] of io.sockets.sockets) {
        if (String(s.data?.tgId) === String(res.sellerId)) {
          s.emit('wallet', getWallet(res.sellerId));
          s.emit('market_sold', { skinId: res.listing.skinId, payout: res.payout, cur: res.cur });
        }
      }
    });

    // ── Колекція: одягнути сорочку або скін конкретної карти ─────
    safeOn(socket, 'equip_skin', ({ tgId, kind, cardKey, skinId }) => {
      const id = uid(tgId); if (!id) return;
      const w = getWallet(id);
      if (kind === 'back') {
        if (!getBackSkins()[skinId] || !w.ownedBackSkins.includes(skinId)) {
          socket.emit('error', { message: 'Сорочка не доступна' }); return;
        }
        w.backSkin = skinId;
      } else if (kind === 'card') {
        if (skinId === null || skinId === undefined) {
          delete w.cardSkins[cardKey]; // зняти скін
        } else {
          const def = getCardSkins()[skinId];
          // скін має існувати, належати гравцю і відповідати САМЕ цій карті
          if (!def || !w.ownedCardSkins.includes(skinId) || def.card !== cardKey) {
            socket.emit('error', { message: 'Скін не доступний' }); return;
          }
          w.cardSkins[cardKey] = skinId;
        }
      } else return;
      saveWallets();
      socket.emit('wallet', w);
      // Якщо гравець за столом — оновлюємо знімок скінів, щоб суперники
      // одразу побачили нову сорочку/скіни
      const meta = socketToPlayer.get(socket.id);
      if (meta) {
        const room = rooms.get(meta.roomId);
        const p = room?.players?.[meta.playerIndex];
        if (p) {
          p.skins = { back: w.backSkin || 'violet', cards: w.cardSkins || {} };
          broadcastState(room);
        }
      }
    });

    safeOn(socket, 'get_rooms', () => {
      // Лише живі набори: публічні кімнати, де ХТОСЬ чекає гравців.
      // Порожніх заготовок немає — кімнати створюють самі гравці.
      const list = [...rooms.values()]
        .filter(r => r.isPublic !== false && r.phase === 'waiting' && r.players.length > 0)
        .map(r => ({
          id: r.id,
          host: r.hostName || r.players[0]?.name || 'Гравець',
          mode: r.mode || 'hfaly',
          maxPlayers: r.maxPlayers || 4,
          deposit: r.deposit || 0,
          players: r.players.length,
          pot: r.pot || 0,
          playerNames: r.players.map(p => p.name),
        }));
      socket.emit('rooms_list', list);
    });

    // ── Хрестовець: гравець скидає 3 карти ─────────────────────
    safeOn(socket, 'discard_cards', ({ cardIds }) => {
      const meta = socketToPlayer.get(socket.id); if (!meta) return;
      const room = rooms.get(meta.roomId); if (!room) return;
      const res = discardThree(room, meta.playerIndex, cardIds);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      broadcastState(room);
      if (res.allDone) {
        io.to(room.id).emit('discards_done', { boaster: room.boaster, name: room.players[room.boaster]?.name });
      }
      setTimeout(() => runBots(room.id), 400);
    });

    safeOn(socket, 'join_room', ({ roomId, name, tgId, isPublic, deposit, mode, playersCount }) => {
      tgId = uid(tgId); if (!tgId) return;
      const wallet = getWallet(tgId);
      if (name) wallet.name = String(name).slice(0, 32); // для адмін-панелі та лідербордів

      let room = rooms.get(roomId);
      if (!room) {
        // Кімнату створює ГРАВЕЦЬ: вона зветься його ім'ям, зі ставкою і режимом
        const ALLOWED_DEPOSITS = [0, 50, 100, 200, 300, 500];
        const m = ['khrest', 'durak'].includes(mode) ? mode : 'hfaly';
        room = createRoom(roomId, m, playersCount);
        room.createdAt = Date.now();
        room.deposit = ALLOWED_DEPOSITS.includes(+deposit) ? +deposit : 0;
        room.pot = 0;
        room.isPublic = isPublic !== false;
        room.hostName = name || 'Гравець';
        rooms.set(roomId, room);
      }

      // Знімок скінів гравця — суперники бачать його сорочку та скіни карт
      const skinsOf = (w) => ({ back: w.backSkin || 'violet', cards: w.cardSkins || {} });

      // Реконект гравця
      const existing = room.players.find(p => p.tgId === tgId || p.socketId === socket.id);
      if (existing) {
        existing.socketId = socket.id;
        existing.online = true;
        existing.skins = skinsOf(wallet);
        socketToPlayer.set(socket.id, { roomId, playerIndex: existing.index });
        socket.join(roomId);
        socket.emit('joined', { playerIndex: existing.index, roomId, deposit: room.deposit });
        socket.emit('wallet', wallet);
        broadcastState(room);
        return;
      }

      const maxP = room.maxPlayers || 4;
      if (room.players.length >= maxP) { socket.emit('error', { message: `Кімната заповнена (${maxP}/${maxP})` }); return; }
      if (room.phase !== 'waiting') { socket.emit('error', { message: 'Гра вже розпочалась' }); return; }

      if (room.deposit > 0) {
        if (wallet.coins < room.deposit) {
          socket.emit('error', { message: `Недостатньо монет! Потрібно ${room.deposit} 💰` });
          return;
        }
        wallet.coins -= room.deposit;
        room.pot = (room.pot || 0) + room.deposit;
        holdDeposit(tgId, room.id, room.deposit); // на диск: рестарт сервера поверне
        saveWallets();
      }

      const playerIndex = room.players.length;
      room.players.push({ id: socket.id, socketId: socket.id, name: name || `Гравець ${playerIndex + 1}`, tgId, index: playerIndex, online: true, skins: skinsOf(wallet) });
      room.playerTgIds = room.playerTgIds || [];
      room.playerTgIds[playerIndex] = tgId;
      socketToPlayer.set(socket.id, { roomId, playerIndex });
      socket.join(roomId);

      socket.emit('joined', { playerIndex, roomId, deposit: room.deposit });
      socket.emit('wallet', wallet);
      broadcastState(room);
      tryStartGame(room);
    });

    safeOn(socket, 'add_bot', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room) { socket.emit('error', { message: 'Кімната не знайдена' }); return; }
      if (room.phase !== 'waiting') { socket.emit('error', { message: 'Гра вже почалась' }); return; }
      if (room.players.length >= (room.maxPlayers || 4)) { socket.emit('error', { message: 'Кімната заповнена' }); return; }

      const botIdx = room.players.length;
      const botPlayer = createBot(botIdx);
      room.players.push(botPlayer);
      room.playerTgIds = room.playerTgIds || [];
      room.playerTgIds[botIdx] = botPlayer.tgId;

      broadcastState(room);
      io.to(roomId).emit('bot_added', { name: botPlayer.name, index: botIdx });
      tryStartGame(room);
    });

    safeOn(socket, 'choose_trump', ({ suit }) => {
      const meta = socketToPlayer.get(socket.id); if (!meta) return;
      const room = rooms.get(meta.roomId); if (!room || room.phase !== 'choose_trump') return;
      if (meta.playerIndex !== room.boaster) { socket.emit('error', { message: 'Тільки хвалящий обирає козир' }); return; }
      chooseTrump(room, suit);
      questProgress(room, meta.playerIndex, 'choose_trump');
      broadcastState(room);
      setTimeout(() => runBots(room.id), 400);
    });

    safeOn(socket, 'show_ninth', () => {
      const meta = socketToPlayer.get(socket.id); if (!meta) return;
      const room = rooms.get(meta.roomId); if (!room || room.phase !== 'choose_trump') return;
      if (meta.playerIndex !== room.boaster) return;
      showNinthCard(room); // відкриває карту, ставить козир, роздає повні руки → фаза play
      questProgress(room, meta.playerIndex, 'choose_trump');
      io.to(room.id).emit('ninth_revealed', {
        card: room.ninthCard,
        trump: room.trump,
        boaster: room.players[room.boaster]?.name,
      });
      broadcastState(room);
      setTimeout(() => runBots(room.id), 900);
    });

    safeOn(socket, 'confirm_trump_last', ({ suit }) => {
      const meta = socketToPlayer.get(socket.id); if (!meta) return;
      const room = rooms.get(meta.roomId); if (!room || room.phase !== 'show9') return;
      if (meta.playerIndex !== room.boaster) return;
      confirmTrumpFromLast(room, suit);
      questProgress(room, meta.playerIndex, 'choose_trump');
      broadcastState(room);
      setTimeout(() => runBots(room.id), 400);
    });

    safeOn(socket, 'play_card', ({ cardId }) => {
      const meta = socketToPlayer.get(socket.id); if (!meta) return;
      const room = rooms.get(meta.roomId); if (!room) return;
      const result = playCard(room, meta.playerIndex, cardId);
      if (!result.ok) { socket.emit('error', { message: result.error }); return; }
      questProgress(room, meta.playerIndex, 'play_cards');
      if (result.trickDone) questProgress(room, result.trickWinner, 'take_tricks');

      if (!result.trickDone) {
        broadcastState(room);
        runBots(room.id);
        return;
      }

      broadcastState(room);
      io.to(meta.roomId).emit('trick_won', { winner: result.trickWinner, winnerName: room.players[result.trickWinner]?.name });

      if (result.roundDone) {
        setTimeout(() => {
          const roundResult = endRound(room);
          broadcastState(room);
          io.to(meta.roomId).emit('round_ended', { ...roundResult, scores: room.scores, players: room.players.map(p => p.name) });
          if (roundResult.gameOver) distributeWinnings(room); // хтось набрав 24 → кінець гри
        }, 1500);
      } else {
        setTimeout(() => {
          room.trick = [];
          room.currentPlayer = result.trickWinner;
          broadcastState(room);
          runBots(room.id);
        }, 1200);
      }
    });

    // ── Дурак: атака / захист / взяти / бито ─────────────────────
    safeOn(socket, 'durak_move', ({ action, cardId, targetIdx }) => {
      const meta = socketToPlayer.get(socket.id); if (!meta) return;
      const room = rooms.get(meta.roomId);
      if (!room || room.mode !== 'durak' || !room.durak) return;
      const idx = meta.playerIndex;
      let res;
      if (action === 'attack') res = durak.attack(room, idx, cardId);
      else if (action === 'defend') res = durak.defend(room, idx, cardId, targetIdx);
      else if (action === 'take') res = durak.take(room, idx);
      else if (action === 'pass') res = durak.pass(room, idx);
      else return;
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      questProgress(room, idx, 'play_cards');
      broadcastState(room);
      if (res.auto?.gameOver) { durakPayout(room); return; }
      setTimeout(() => runBots(room.id), 500); // боти реагують на хід людини
    });

    safeOn(socket, 'next_round', () => {
      const meta = socketToPlayer.get(socket.id); if (!meta) return;
      const room = rooms.get(meta.roomId); if (!room || room.phase !== 'round_end') return;
      advanceRound(room);
      broadcastState(room);
      setTimeout(() => runBots(room.id), 300);
    });

    safeOn(socket, 'finish_game', () => {
      const meta = socketToPlayer.get(socket.id); if (!meta) return;
      const room = rooms.get(meta.roomId); if (!room) return;
      distributeWinnings(room);
    });

    // ── Вихід з кімнати ───────────────────────────────────────
    safeOn(socket, 'leave_room', () => {
      const meta = socketToPlayer.get(socket.id);
      if (!meta) { socket.emit('left_room'); return; }
      const room = rooms.get(meta.roomId);
      if (!room) { socketToPlayer.delete(socket.id); socket.emit('left_room'); return; }

      const idx = meta.playerIndex;
      const player = room.players[idx];
      if (!player) { socketToPlayer.delete(socket.id); socket.emit('left_room'); return; }

      if (room.phase === 'waiting') {
        // Повертаємо депозит
        if (room.deposit > 0) {
          const w = getWallet(player.tgId);
          w.coins += room.deposit;
          room.pot = Math.max(0, (room.pot || 0) - room.deposit);
          releaseDeposit(player.tgId, room.id); // депозит повернено — ескроу закритий
          saveWallets();
          socket.emit('wallet', w);
        }
        // Видаляємо гравця і перенумеровуємо решту
        room.players.splice(idx, 1);
        if (room.playerTgIds) room.playerTgIds.splice(idx, 1);
        room.players.forEach((p, i) => {
          p.index = i;
          const m = socketToPlayer.get(p.socketId);
          if (m) m.playerIndex = i;
          const s = io.sockets.sockets.get(p.socketId);
          if (s) s.emit('reindexed', { playerIndex: i });
        });
        socketToPlayer.delete(socket.id);
        socket.leave(meta.roomId);
        socket.emit('left_room');
        io.to(room.id).emit('player_left', { name: player.name });
        broadcastState(room);
      } else {
        // Гра йде — гравця замінює бот, гра продовжується
        player.isBot = true;
        player.online = false;
        player.socketId = null; // старі стани більше не летять гравцю, що вийшов
        player.name = player.name.replace(' 🤖', '') + ' 🤖';
        socketToPlayer.delete(socket.id);
        socket.leave(meta.roomId);
        socket.emit('left_room');
        io.to(room.id).emit('player_left_replaced', { name: player.name, index: idx });
        broadcastState(room);
        runBots(room.id); // якщо була його черга — бот ходить
      }
    });

    // ── Клани ─────────────────────────────────────────────────
    safeOn(socket, 'clan_get', ({ tgId }) => {
      const id = uid(tgId); if (!id) return;
      socket.emit('clan_state', clans.clanState(id));
    });
    safeOn(socket, 'clan_create', ({ tgId, name, emoji }) => {
      const id = uid(tgId); if (!id) return;
      const res = clans.createClan(id, name, emoji);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      socket.emit('wallet', getWallet(id));
      socket.emit('clan_state', clans.clanState(id));
    });
    safeOn(socket, 'clan_join', ({ tgId, tag }) => {
      const id = uid(tgId); if (!id) return;
      const res = clans.joinClan(id, tag);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      socket.emit('clan_state', clans.clanState(id));
    });
    safeOn(socket, 'clan_leave', ({ tgId }) => {
      const id = uid(tgId); if (!id) return;
      const res = clans.leaveClan(id);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      socket.emit('clan_state', clans.clanState(id));
    });
    safeOn(socket, 'clan_chat', ({ tgId, text }) => {
      const id = uid(tgId); if (!id) return;
      const res = clans.clanChat(id, text);
      if (!res.ok) { socket.emit('error', { message: res.error }); return; }
      // усім онлайн-учасникам клану
      for (const [, s] of io.sockets.sockets) {
        if (res.members.includes(String(s.data?.tgId))) s.emit('clan_msg', res.msg);
      }
    });

    // ── Чат кімнати: короткі повідомлення між гравцями ──────────
    const chatTimes = []; // анти-спам: не більше 5 за 10с
    safeOn(socket, 'chat_msg', ({ tgId, text }) => {
      const id = uid(tgId); if (!id) return;
      const meta = socketToPlayer.get(socket.id); if (!meta) return;
      const room = rooms.get(meta.roomId); if (!room) return;
      const now = Date.now();
      while (chatTimes.length && now - chatTimes[0] > 10000) chatTimes.shift();
      if (chatTimes.length >= 5) { socket.emit('error', { message: 'Не так швидко 🤫' }); return; }
      chatTimes.push(now);
      const clean = String(text || '').slice(0, 120).trim();
      if (!clean) return;
      const p = room.players[meta.playerIndex];
      io.to(room.id).emit('chat_msg', {
        playerIndex: meta.playerIndex,
        name: p?.name || 'Гравець',
        text: clean, ts: now,
      });
    });

    // ── Пошук активної кімнати гравця (для кнопки "Повернутись") ──
    safeOn(socket, 'find_my_room', ({ tgId }) => {
      tgId = uid(tgId); if (!tgId) return;
      for (const room of rooms.values()) {
        const p = room.players.find(pl => pl.tgId === tgId && !pl.isBot);
        if (p) {
          socket.emit('my_room', {
            roomId: room.id,
            phase: room.phase,
            players: room.players.length,
            deposit: room.deposit || 0,
          });
          return;
        }
      }
      socket.emit('my_room', null);
    });

    socket.on('disconnect', () => {
      const meta = socketToPlayer.get(socket.id);
      if (meta) {
        const room = rooms.get(meta.roomId);
        if (room) {
          const p = room.players[meta.playerIndex];
          if (p) p.online = false;
          io.to(meta.roomId).emit('player_disconnected', { playerIndex: meta.playerIndex, name: p?.name });
        }
        socketToPlayer.delete(socket.id);
      }
    });
  });
}

module.exports = { registerHandlers, broadcastState, distributeWinnings, durakPayout };
