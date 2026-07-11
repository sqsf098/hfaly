// ─── З'єднання з сервером (Socket.io) ───
function connectSocket(){
  if(socket)return;
  // initData — підписані Telegram-дані; сервер верифікує їх і бере наш ID
  // звідти (payload-ний tgId — лише dev-fallback поза Telegram)
  socket=io({transports:['websocket','polling'],auth:{initData:(tg&&tg.initData)||''}});
  socket.on('connect_error',(e)=>{ if(e&&e.message&&e.message.indexOf('Telegram')>=0) showToast('⚠️ Відкрий гру через Telegram',4000); });

  socket.on('wallet',(w)=>{
    myWallet=w; // повний гаманець: скіни, сорочка, колекція
    myCoins=w.coins;
    if(w.gems!=null)myGems=w.gems;
    myStats.wins=w.wins||myStats.wins;
    myStats.games=w.gamesPlayed||myStats.games;
    updateCoinsUI();
    applyBackSkin(w.backSkin);
    if(document.getElementById('decksScreen').classList.contains('active'))renderCollection();
  });

  // ── Економіка: скрині + квести + банк ───────────────────────────
  socket.on('economy',(e)=>{ economyData=e; myGems=e.gems; updateCoinsUI(); renderEconomy(); if(typeof renderBank==='function')renderBank(); });
  socket.on('bank',(b)=>{ bankData=b; renderBank(); });
  socket.on('streak_claimed',({day,gained})=>{
    sfx('coin'); vibrate('success');
    showToast(`🔥 День ${day}! ${rewardText(gained)}${day>=7?' — максимальна серія!':''}`,3500);
    if(gained.coins)floatCoin(gained.coins,window.innerWidth/2,180);
  });
  socket.on('exchanged',({gems,coins})=>{ sfx('coin'); vibrate('success'); showToast(`🔁 ${gems} 💎 → +${coins} 💰`,3000); floatCoin(coins,window.innerWidth/2,180); });
  socket.on('chest_opened',({chestId,gained})=>{sfx('coin');vibrate('success');showChestReward(gained,chestId);});
  socket.on('quest_claimed',({gained})=>{ showToast('🎉 '+rewardText(gained),2500); if(gained.coins)floatCoin(gained.coins,window.innerWidth/2,140); });
  socket.on('quest_done',({text})=>showToast('✅ Квест виконано: '+text,3000));

  // ── Магазин: покупка скінів за Telegram Stars ⭐ ─────────────────
  socket.on('invoice',({link})=>{
    if(tg&&tg.openInvoice){
      tg.openInvoice(link,(status)=>{
        if(status==='paid'){ sfx('coin'); vibrate('success'); socket.emit('get_wallet',{tgId:getMyTgId()}); }
        else if(status==='failed') showToast('⚠️ Оплата не пройшла',3000);
      });
    } else showToast('⚠️ Покупки працюють тільки в Telegram',3000);
  });
  socket.on('skin_purchased',({name})=>{
    showToast('🎉 «'+name+'» тепер твій! Одягни в Колекції',3500);
    socket.emit('get_wallet',{tgId:getMyTgId()});
    socket.emit('get_collections',{tgId:getMyTgId()});
  });

  // ── Колекції та ринок ────────────────────────────────────────────
  socket.on('collections',(data)=>{ collectionsData=data; renderCollections(); });
  socket.on('market',(data)=>{ marketData=data; renderMarket(); });
  socket.on('market_ok',({action,name})=>{
    if(action==='buy'){ sfx('coin'); vibrate('success'); showToast('🎉 Куплено: «'+name+'»!',3000); }
    if(action==='list') showToast('🛒 Лот виставлено!',2200);
    if(action==='cancel') showToast('Лот знято, скін повернувся',2200);
    socket.emit('get_collections',{tgId:getMyTgId()});
  });
  socket.on('market_sold',({payout,cur})=>{
    sfx('coin'); vibrate('success');
    showToast('💸 Твій лот продано! +'+payout+' '+(cur==='coins'?'💰':'💎'),4000);
  });

  // ── Чат у кімнаті ────────────────────────────────────────────────
  socket.on('chat_msg',(m)=>onChatMsg(m));

  // ── Клани ────────────────────────────────────────────────────────
  socket.on('clan_state',(d)=>{ clanData=d; renderClan(); });
  socket.on('clan_msg',(m)=>onClanMsg(m));

  // ── TON / NFT ───────────────────────────────────────────────────
  socket.on('ton_state',(s)=>{ tonData=s; renderTon(); });
  socket.on('mint_tx',(res)=>onMintTx(res));

  socket.on('rooms_list',(list)=>renderRooms(list));

  socket.on('joined',({playerIndex,roomId,deposit})=>{
    myIndex=playerIndex;myRoomId=roomId;currentRoomDeposit=deposit||0;
    document.body.classList.add('in-game'); // показує кнопку чату
    showWaiting(roomId,deposit||0);
  });

  socket.on('state',(state)=>{
    gameState=state;
    if(state.phase==='waiting'){renderWaiting(state);return;}

    // Хрестовець: інтро роздачі не потрібне (одразу фаза скидання)
    if(state.mode==='khrest') dealAnimPending=false;

    // First state after game_started - show deal intro
    if(dealAnimPending && !dealIntroDone && state.players && state.boaster !== null) {
      dealAnimPending = false;
      showGameScreen();
      showDealIntro(state.players, state.boaster, ()=>{
        renderGame(gameState); // актуальний стан, не застарілий (інакше рука «затирається» на 3 карти)
      });
      return;
    }

    showGameScreen();renderGame(state);
  });

  socket.on('room_ready',({message})=>{ sfx('trump'); vibrate('medium'); showToast('🪑 '+message,3500); });

  socket.on('game_started',({message})=>{
    // Show deal intro animation FIRST, then game
    dealIntroDone = false;
    dealAnimPending = true;
  });

  socket.on('trick_won',({winner,winnerName})=>{
    // Без повідомлення — карти зі столу злітаються в стопку до переможця
    if(gameState && gameState.trick && gameState.trick.length>=3){
      sfx('trick');
      animateTrickCollect(winner, ()=>{});
    }
  });
  socket.on('bot_trump',({name,suit})=>{sfx('trump');showToast(name+' обирає козир: '+suit,2000);});
  socket.on('discards_done',({name})=>{sfx('trump');vibrate('medium');showToast('🗣️ Хвалящий — '+name+' (J♣)! Обирає козир...',2800);});
  socket.on('ninth_revealed',({card,trump,boaster})=>showNinthReveal(card,trump,boaster));

  socket.on('round_ended',(result)=>{
    if(result.gameOver) return; // гра завершена — покаже game_finished
    renderRoundEnd(result);
    $('roundEndOverlay').classList.add('show');
  });

  socket.on('game_finished',(result)=>{
    const iWon=result.winTeam&&result.winTeam.includes(myIndex);
    sfx(iWon?'win':'lose');vibrate(iWon?'success':'error');
    $('roundEndOverlay').classList.remove('show');
    showGameFinished(result);
  });

  socket.on('bot_added',({name,index})=>{
    showToast('🤖 '+name+' приєднався!',2000);
    const btn=$('addBotBtn');
    const maxP=(gameState&&gameState.maxPlayers)||4;
    if(btn&&index>=maxP-1)btn.style.display='none';
  });
  socket.on('left_room', ()=>{
    document.body.classList.remove('in-game');
    const cm=$('chatMessages'); if(cm)cm.innerHTML='';
  });
  socket.on('reindexed', ({playerIndex})=>{ myIndex = playerIndex; });
  socket.on('player_left', ({name})=>showToast('👋 '+name+' вийшов з кімнати', 2200));
  socket.on('player_left_replaced', ({name})=>showToast('🤖 '+name+' — тепер грає бот', 2500));
  socket.on('my_room', (info)=>renderReturnBanner(info));

  socket.on('player_disconnected',({name})=>showToast('❌ '+name+' відключився',3000));
  socket.on('error',({message})=>{
    showToast('⚠️ '+message,3000);
    // страховка від «зниклих карт»: після відмови сервера перемальовуємо руку
    if(gameState && gameState.phase==='play') renderGame(gameState);
  });

  // Request wallet & rooms after connect
  setTimeout(()=>{
    socket.emit('get_wallet',{tgId:getMyTgId()});
    socket.emit('get_rooms');
    socket.emit('find_my_room',{tgId:getMyTgId()});
    socket.emit('get_economy',{tgId:getMyTgId()});
    socket.emit('get_ton',{tgId:getMyTgId()});
    socket.emit('get_collections',{tgId:getMyTgId()});
    socket.emit('market_get');
    socket.emit('clan_get',{tgId:getMyTgId()});
  },300);
}

// ── WAITING ───────────────────────────────────────────────────────
