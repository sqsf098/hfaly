// ─── Лобі: кімнати, очікування, боти, головна ───
function loadRooms(){
  if(!socket)return;
  socket.emit('get_rooms');
}

// Кімнати = живі набори від гравців: видно, ХТО збирає стіл.
// Порожніх заготовок немає — список тільки з реальних людей.
function renderRooms(list){
  const grid=$('baseRoomsGrid');
  if(!grid)return;
  grid.className='table-list';
  grid.innerHTML='';
  if(!list.length){
    grid.innerHTML=`<div style="text-align:center;padding:22px 14px;color:var(--text3)">
      <div style="font-size:13px;margin-bottom:4px">Зараз ніхто не набирає стіл</div>
      <div style="font-size:11px">Створи свій — друзі та інші гравці побачать його тут</div>
    </div>`;
    return;
  }
  for(const room of list){
    const mp=room.maxPlayers||4;
    const locked=myCoins<room.deposit;
    const modeLabel=room.mode==='khrest'?'Хрестовець · 3 гравці':room.mode==='durak'?`Дурак · ${room.maxPlayers||2} гравці`:'хФали · 2 vs 2';
    const row=document.createElement('div');
    row.className=`table-row ${locked?'locked':''}`;
    row.innerHTML=`
      <div class="tr-stake"><div class="val">${room.deposit||'—'}</div><div class="lbl">${room.deposit?'ставка':'без став.'}</div></div>
      <div class="tr-info">
        <div class="tr-name">Стіл: ${room.host}</div>
        <div class="tr-sub">
          <span class="tr-dots">${Array.from({length:mp},(_,i)=>`<i class="${i<room.players?'on':''}"></i>`).join('')}</span>
          ${room.players}/${mp} · ${modeLabel}
        </div>
      </div>
      <div class="tr-action">${locked?`Треба ${room.deposit}`:'Сісти'}</div>`;
    if(!locked) row.onclick=()=>openJoinBaseRoom(room);
    grid.appendChild(row);
  }
}

function openJoinBaseRoom(room){
  pendingBaseRoomId=room.id;
  $('jbrTitle').textContent=`Стіл: ${room.host||room.name||room.id}`;
  $('jbrInfo').innerHTML=`
    <div style="margin-bottom:10px">
      <div style="font-family:'Rubik',sans-serif;font-size:28px;color:var(--gold2);font-weight:800">${room.deposit||0} 💰</div>
      <div style="font-size:11px;color:var(--text3)">депозит</div>
    </div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${room.mode==='khrest'?'♣ Хрестовець — кожен за себе, 3 гравці':room.mode==='durak'?'🎴 Дурак підкидний — кожен за себе':'хФали — 2 vs 2, 4 гравці'}</div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:4px">Гравці: <b>${(room.playerNames||[]).join(', ')||'—'}</b></div>
    <div style="font-size:12px;color:var(--text2)">Твій баланс: <b style="color:var(--gold)">${myCoins} 💰</b></div>
  `;
  $('joinBaseRoomModal').classList.add('show');
}

function confirmJoinBaseRoom(){
  if(!pendingBaseRoomId)return;
  $('joinBaseRoomModal').classList.remove('show');
  connectSocket();
  socket.emit('join_room',{roomId:pendingBaseRoomId,name:getMyName(),tgId:getMyTgId()});
  pendingBaseRoomId=null;
}

function createPrivateRoom(){
  $('createRoomModal').classList.remove('show');
  connectSocket();
  const roomId=Math.random().toString(36).slice(2,8).toUpperCase();
  socket.emit('join_room',{roomId,name:getMyName(),tgId:getMyTgId(),isPublic:roomType==='public',
    deposit:privateDeposit||0, mode:roomMode, playersCount:roomMode==='durak'?durakPlayers:undefined});
}

function joinByCode(){
  const code=$('joinCodeInput').value.trim().toUpperCase();
  if(code.length<4){showToast('Введи код кімнати!');return;}
  $('joinRoomModal').classList.remove('show');
  connectSocket();
  socket.emit('join_room',{roomId:code,name:getMyName(),tgId:getMyTgId()});
}

// ── SOCKET ────────────────────────────────────────────────────────
function showWaiting(roomId,deposit){
  document.body.classList.add('in-game'); // веер сховати в кімнаті очікування
  $('waitingRoom').classList.add('show');
  $('waitingCode').textContent=roomId;
  $('waitingPot').innerHTML=`${deposit} 💰 <span>Твій депозит внесено</span>`;
}

function renderWaiting(state){
  const slots=$('waitingSlots');slots.innerHTML='';
  const N=state.maxPlayers||4;
  const isKh=state.mode==='khrest';
  const isDur=state.mode==='durak';
  const teamNames=isKh?['♣ Кожен за себе','♣ Кожен за себе','♣ Кожен за себе']
    :isDur?Array(N).fill('🎴 Кожен за себе')
    :['Г1 🔵 Team A','Г2 🔴 Team B','Г3 🔵 Team A','Г4 🔴 Team B'];
  const tc=(isKh||isDur)?Array(N).fill(''):['team-a','team-b','team-a','team-b'];
  const pot=state.players.length*currentRoomDeposit;
  $('waitingPot').innerHTML=`${pot} 💰 <span>Банк (${state.players.length}/${N} гравців)</span>`;
  $('waitingRoomName').textContent=(isKh?'♣ Хрестовець · ':isDur?'🎴 Дурак · ':'')+state.players.length+`/${N} гравців`;
  for(let i=0;i<N;i++){
    // місце i: гравець шукається за .index (після пересадок порядок ≠ позиція)
    const p=(state.players||[]).find(pl=>pl.index===i);
    const div=document.createElement('div');
    div.className=`pslot ${tc[i]} ${p?'filled':''}${i===myIndex?' me':''}`;
    div.innerHTML=p
      ?`<div>${p.name}${i===myIndex?' (ти)':''}</div><div class="pslot-team">${teamNames[i]}</div>`
      :`<div style="opacity:.5">Вільно — тапни, щоб сісти</div><div class="pslot-team">${teamNames[i]}</div>`;
    // пересісти на вільне місце (обрати команду/партнера)
    if(!p&&myIndex!=null)div.onclick=()=>{socket.emit('switch_seat',{seatIndex:i});sfx('click');};
    slots.appendChild(div);
  }
  // Повний стіл у хФали без ботів: стартує хост (розсадка по командах)
  const full=state.players.length===N;
  const hasBot=(state.players||[]).some(p=>/🤖/.test(p.name||''));
  const iAmHost=state.hostTgId&&String(state.hostTgId)===String(getMyTgId());
  let startBtn=$('startGameBtn');
  if(!startBtn){
    startBtn=document.createElement('button');
    startBtn.id='startGameBtn';
    startBtn.className='btn-gold';
    startBtn.style.cssText='margin-top:10px;display:none';
    startBtn.textContent='▶ Почати гру';
    startBtn.onclick=()=>socket.emit('start_game',{tgId:getMyTgId()});
    slots.parentElement.insertBefore(startBtn,slots.nextSibling);
  }
  const waitHost=state.mode==='hfaly'&&full&&!hasBot;
  startBtn.style.display=waitHost&&iAmHost?'block':'none';
  $('waitingStatus').textContent=full
    ?(waitHost?(iAmHost?'Всі на місцях? Тисни «Почати гру»!':'Розсідайтесь! Хост стартує гру'):'Гра розпочинається!')
    :(`${N-state.players.length} місць залишилось · тапни вільне місце, щоб обрати команду`);
}

function addBot(){
  if(!socket||!myRoomId)return;
  socket.emit('add_bot',{roomId:myRoomId});
}

// ── Quick play with bots ──────────────────────────────────────
function quickPlayWithBots(){
  connectSocket();
  const roomId = Math.random().toString(36).slice(2,8).toUpperCase();
  myRoomId = roomId;
  socket.emit('join_room',{roomId, name:getMyName(), tgId:getMyTgId()});
  // After joining - fill with bots
  socket.once('joined', ()=>{
    for(let i=0;i<3;i++){
      setTimeout(()=>socket.emit('add_bot',{roomId}), 200+i*150);
    }
  });
}

// ── Daily bonus ───────────────────────────────────────────────
let dailyClaimed = localStorage.getItem('hfaly_daily') === new Date().toDateString();
function claimDaily(){
  if(dailyClaimed){ showToast('Вже взяв сьогодні! Повертайся завтра 🌙',2500); return; }
  dailyClaimed = true;
  localStorage.setItem('hfaly_daily', new Date().toDateString());
  myCoins += 100;
  updateCoinsUI();
  floatCoin(100, window.innerWidth/2, window.innerHeight/2);
  showToast('🎁 +100 монет! До завтра!', 2500);
  if(socket) socket.emit('get_wallet',{tgId:getMyTgId()});
}

// ── Update home stats ─────────────────────────────────────────
function updateHomeStats(){
  const hs_coins = $('hs_coins');
  const hs_games = $('hs_games');
  const hs_wr = $('hs_wr');
  if(hs_coins) hs_coins.textContent = myCoins;
  if(hs_games) hs_games.textContent = myStats.games;
  if(hs_wr) hs_wr.textContent = myStats.games>0?Math.round(myStats.wins/myStats.games*100)+'%':'0%';
}

// ── Particle background animation ────────────────────────────
function initParticles(){
  const canvas = $('bgCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const suits = ['♠','♥','♦','♣'];
  const particles = Array.from({length:18},()=>({
    x: Math.random()*canvas.width,
    y: Math.random()*canvas.height,
    suit: suits[Math.floor(Math.random()*4)],
    size: 10+Math.random()*14,
    speed: 0.2+Math.random()*0.4,
    opacity: 0.03+Math.random()*0.08,
    drift: (Math.random()-0.5)*0.3,
  }));

  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p=>{
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = (p.suit==='♥'||p.suit==='♦') ? '#c0392b' : '#e8dcc8';
      ctx.font = `${p.size}px serif`;
      ctx.fillText(p.suit, p.x, p.y);
      ctx.restore();
      p.y -= p.speed;
      p.x += p.drift;
      if(p.y < -20) { p.y=canvas.height+20; p.x=Math.random()*canvas.width; }
      if(p.x < -20) p.x=canvas.width+20;
      if(p.x > canvas.width+20) p.x=-20;
    });
    requestAnimationFrame(draw);
  }
  draw();
}

function fillWithBots(){
  if(!socket||!myRoomId)return;
  // Додаємо ботів поки кімната не заповнена
  const needed=4-(gameState?.players?.length||1);
  for(let i=0;i<needed;i++){
    setTimeout(()=>socket.emit('add_bot',{roomId:myRoomId}),i*200);
  }
}

function leaveRoom(){
  // Якщо ми в кімнаті — повідомляємо сервер (повертає депозит у фазі очікування)
  if(socket && myRoomId) socket.emit('leave_room');
  $('waitingRoom').classList.remove('show');
  document.body.classList.remove('in-game');
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $('homeScreen').classList.add('active');
  gameState=null;
  myRoomId=null;
  if(typeof syncFan==='function')syncFan('home');
  loadRooms();
}

// ── Банер "повернутись у гру" ──────────────────────────────────────
let returnRoomInfo = null;
function renderReturnBanner(info){
  const banner = $('returnBanner');
  if(!banner) return;
  returnRoomInfo = info;
  // Не показуємо банер, якщо ми вже в цій кімнаті (граємо/чекаємо)
  if(!info || myRoomId === info.roomId){ banner.style.display='none'; return; }
  const phaseText = info.phase==='waiting' ? 'очікує гравців' : 'гра триває';
  const txt = $('returnBannerText');
  if(txt) txt.innerHTML =
    `<div style="font-size:13px;color:var(--text);font-weight:600">🎮 У тебе є активна гра</div>
     <div style="font-size:11px;color:var(--text3);margin-top:2px">Кімната ${info.roomId} · ${info.players}/4 · ${phaseText}</div>`;
  banner.style.display='flex';
}

function returnToMyRoom(){
  if(!returnRoomInfo) return;
  connectSocket();
  myRoomId = returnRoomInfo.roomId;
  socket.emit('join_room',{roomId:returnRoomInfo.roomId,name:getMyName(),tgId:getMyTgId()});
  const banner = $('returnBanner'); if(banner) banner.style.display='none';
}

function leaveMyRoomFromBanner(){
  if(!returnRoomInfo) return;
  connectSocket();
  // Реконект до кімнати, потім вихід — щоб сервер знав, кого прибирати
  const rid = returnRoomInfo.roomId;
  socket.emit('join_room',{roomId:rid,name:getMyName(),tgId:getMyTgId()});
  setTimeout(()=>{ socket.emit('leave_room'); }, 400);
  const banner = $('returnBanner'); if(banner) banner.style.display='none';
  returnRoomInfo = null;
  showToast('Вийшов з кімнати',1500);
}

// ── GAME ──────────────────────────────────────────────────────────

// ── Запрошення посиланням (прямий deep-link у Telegram) ───────────
let appBotUsername='', appGroupLink='';
fetch('/appinfo').then(r=>r.json()).then(d=>{appBotUsername=d.botUsername||'';appGroupLink=d.groupLink||'';}).catch(()=>{});

// Спільнота: вступ у Telegram-групу гри (GROUP_LINK у .env)
function openCommunity(){
  if(!appGroupLink){showToast('Групу скоро відкриємо! 👥',2500);return;}
  if(tg&&tg.openTelegramLink){tg.openTelegramLink(appGroupLink);return;}
  window.open(appGroupLink,'_blank');
}

function shareRoomLink(){
  if(!myRoomId){showToast('Спершу створи кімнату');return;}
  const text='🃏 Заходь до мене в хФали! Стіл: '+myRoomId;
  if(appBotUsername){
    // t.me/<бот>?start=join_<код> → бот шле другу кнопку «Увійти в гру»,
    // яка закидає одразу за стіл. Працює без налаштувань у BotFather.
    const link=`https://t.me/${appBotUsername}?start=join_${myRoomId}`;
    const share=`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    if(tg&&tg.openTelegramLink){tg.openTelegramLink(share);return;}
    window.open(share,'_blank');
    return;
  }
  // Бот не сконфігурований (dev) — копіюємо код
  try{navigator.clipboard.writeText(myRoomId);showToast('Код '+myRoomId+' скопійовано 📋',2500);}
  catch(e){showToast('Код кімнати: '+myRoomId,3000);}
}
