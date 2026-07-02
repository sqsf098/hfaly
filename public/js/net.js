// ─── З'єднання з сервером (Socket.io) ───
function connectSocket(){
  if(socket)return;
  socket=io({transports:['websocket','polling']});

  socket.on('wallet',(w)=>{
    myCoins=w.coins;
    if(w.gems!=null)myGems=w.gems;
    myStats.wins=w.wins||myStats.wins;
    myStats.games=w.gamesPlayed||myStats.games;
    updateCoinsUI();
  });

  // ── Економіка: скрині + квести ──────────────────────────────────
  socket.on('economy',(e)=>{ economyData=e; myGems=e.gems; updateCoinsUI(); renderEconomy(); });
  socket.on('chest_opened',({chestId,gained})=>showChestReward(gained));
  socket.on('quest_claimed',({gained})=>{ showToast('🎉 '+rewardText(gained),2500); if(gained.coins)floatCoin(gained.coins,window.innerWidth/2,140); });
  socket.on('quest_done',({text})=>showToast('✅ Квест виконано: '+text,3000));

  // ── TON / NFT ───────────────────────────────────────────────────
  socket.on('ton_state',(s)=>{ tonData=s; renderTon(); });
  socket.on('mint_tx',(res)=>onMintTx(res));

  socket.on('rooms_list',(list)=>renderRooms(list));

  socket.on('joined',({playerIndex,roomId,deposit})=>{
    myIndex=playerIndex;myRoomId=roomId;currentRoomDeposit=deposit||0;
    showWaiting(roomId,deposit||0);
  });

  socket.on('state',(state)=>{
    gameState=state;
    if(state.phase==='waiting'){renderWaiting(state);return;}

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

  socket.on('game_started',({message})=>{
    // Show deal intro animation FIRST, then game
    dealIntroDone = false;
    dealAnimPending = true;
  });

  socket.on('trick_won',({winner,winnerName})=>{
    // Без повідомлення — карти зі столу злітаються в стопку до переможця
    if(gameState && gameState.trick && gameState.trick.length===4){
      animateTrickCollect(winner, ()=>{});
    }
  });
  socket.on('bot_trump',({name,suit})=>showToast(name+' обирає козир: '+suit,2000));
  socket.on('ninth_revealed',({card,trump,boaster})=>showNinthReveal(card,trump,boaster));

  socket.on('round_ended',(result)=>{
    if(result.gameOver) return; // гра завершена — покаже game_finished
    renderRoundEnd(result);
    $('roundEndOverlay').classList.add('show');
  });

  socket.on('game_finished',(result)=>{
    $('roundEndOverlay').classList.remove('show');
    showGameFinished(result);
  });

  socket.on('bot_added',({name,index})=>{
    showToast('🤖 '+name+' приєднався!',2000);
    const btn=$('addBotBtn');
    if(btn&&index>=3)btn.style.display='none';
  });
  socket.on('left_room', ()=>{ /* сервер підтвердив вихід */ });
  socket.on('reindexed', ({playerIndex})=>{ myIndex = playerIndex; });
  socket.on('player_left', ({name})=>showToast('👋 '+name+' вийшов з кімнати', 2200));
  socket.on('player_left_replaced', ({name})=>showToast('🤖 '+name+' — тепер грає бот', 2500));
  socket.on('my_room', (info)=>renderReturnBanner(info));

  socket.on('player_disconnected',({name})=>showToast('❌ '+name+' відключився',3000));
  socket.on('error',({message})=>showToast('⚠️ '+message,3000));

  // Request wallet & rooms after connect
  setTimeout(()=>{
    socket.emit('get_wallet',{tgId:getMyTgId()});
    socket.emit('get_rooms');
    socket.emit('find_my_room',{tgId:getMyTgId()});
    socket.emit('get_economy',{tgId:getMyTgId()});
    socket.emit('get_ton',{tgId:getMyTgId()});
  },300);
}

// ── WAITING ───────────────────────────────────────────────────────
