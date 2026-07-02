// ─── Стан, хелпери, вкладки, профіль, колоди ───

// ════════════════════════════════════════════════════════
const tg = window.Telegram?.WebApp;
if(tg){tg.expand();tg.ready();}
const params = new URLSearchParams(location.search);

let socket, myIndex, myRoomId, selectedCardId, gameState;
let currentDeck = localStorage.getItem('hfaly_deck')||'classic';
let roomType = 'public';
let privateDeposit = 0;
let pendingBaseRoomId = null;
let myName = localStorage.getItem('hfaly_name')||'';
let myCoins = parseInt(localStorage.getItem('hfaly_coins')||'500');
let myGems = parseInt(localStorage.getItem('hfaly_gems')||'0');
let economyData = null;
let myStats = JSON.parse(localStorage.getItem('hfaly_stats')||'{"wins":0,"games":0}');
let currentRoomDeposit = 0;
const TEAM_OF=[0,1,0,1];
const SUIT_RED={'♥':true,'♦':true};
const DECK_THEMES={
  classic:{bg:'#fffef8',red:'#c0392b',black:'#1a1a2e',border:'#ccc'},
  dark:{bg:'#1a1a2e',red:'#e74c3c',black:'#ecf0f1',border:'#333'},
  gold:{bg:'#2a1a00',red:'#c9a84c',black:'#c9a84c',border:'#5a4010'},
  neon:{bg:'#0a0015',red:'#ff00ff',black:'#00ffff',border:'#440044'},
  // Преміум-колоди (випадають зі скринь)
  royal:{bg:'#f5eeda',red:'#a01e2e',black:'#2c2140',border:'#c9a84c'},
  emerald:{bg:'#062b22',red:'#e8b84b',black:'#63e6b0',border:'#0f5c47'},
  crimson:{bg:'#2a0a10',red:'#ff5964',black:'#ffd9dc',border:'#7a1f2b'},
  galaxy:{bg:'#0b0a2e',red:'#ff77e1',black:'#8ab6ff',border:'#3a2f7a'},
  // NFT-колоди (on-chain, рідкісні)
  dragon:{bg:'#1c0d07',red:'#ff7a2f',black:'#ffcf6b',border:'#b5501f'},
  phoenix:{bg:'#2a0a04',red:'#ff5a3c',black:'#ffd36b',border:'#c93b1a'},
  tryzub:{bg:'#04204a',red:'#ffd400',black:'#4aa3ff',border:'#ffd400'},
};
const DECK_META={
  classic:{name:'Класична',desc:'Стандартна'},
  dark:{name:'Нічна',desc:'Темний стиль'},
  gold:{name:'Золота',desc:'Преміум'},
  neon:{name:'Неон',desc:'Кіберпанк'},
  royal:{name:'Королівська',desc:'👑 Зі скрині'},
  emerald:{name:'Смарагдова',desc:'💎 Зі скрині'},
  crimson:{name:'Багряна',desc:'🔥 Зі скрині'},
  galaxy:{name:'Галактика',desc:'✨ Зі скрині'},
  dragon:{name:'Дракон',desc:'🐉 NFT'},
  phoenix:{name:'Фенікс',desc:'🔥 NFT'},
  tryzub:{name:'Тризуб',desc:'🔱 NFT'},
};
// NFT-колоди рендеряться окремою секцією (ton.js), не у звичайній сітці
const NFT_DECK_KEYS=['dragon','phoenix','tryzub'];

function $(id){return document.getElementById(id);}

function showToast(msg,ms=2500){
  const t=$('toast');t.textContent=msg;t.classList.add('show');
  clearTimeout(showToast._t);showToast._t=setTimeout(()=>t.classList.remove('show'),ms);
}

function floatCoin(amount, x, y){
  const el=document.createElement('div');
  el.className=`coin-float ${amount>0?'pos':'neg'}`;
  el.textContent=(amount>0?'+':'')+amount+' 💰';
  el.style.cssText=`left:${x||window.innerWidth/2}px;top:${y||window.innerHeight/2}px`;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),1300);
}

function updateCoinsUI(){
  $('navCoins').textContent=myCoins;
  const nc2=$('navCoins2');if(nc2)nc2.textContent=myCoins;
  const bc=$('balanceCoins');if(bc)bc.textContent=myCoins;
  const bg=$('bsGames');if(bg)bg.textContent=myStats.games;
  const bw=$('bsWins');if(bw)bw.textContent=myStats.wins;
  const bwr=$('bsWr');if(bwr)bwr.textContent=myStats.games>0?Math.round(myStats.wins/myStats.games*100)+'%':'0%';
  const ng=$('navGems');if(ng)ng.textContent=myGems;
  localStorage.setItem('hfaly_coins',myCoins);
  localStorage.setItem('hfaly_gems',myGems);
  localStorage.setItem('hfaly_stats',JSON.stringify(myStats));
  updateHomeStats();
}

function addCoinsLocal(amount){
  myCoins+=amount;
  floatCoin(amount, window.innerWidth/2, 100);
  updateCoinsUI();
}

function switchTab(tab){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(`${tab}Screen`).classList.add('active');
  document.querySelectorAll('.tab').forEach((t,i)=>{
    const tabs=['home','profile','decks','settings'];
    t.classList.toggle('active',tabs[i]===tab);
  });
  document.body.classList.remove('in-game');
  if(typeof syncFan==='function')syncFan(tab);
  if(tab==='profile')loadProfile();
  if(tab==='decks'){renderDecks();renderTon();}
  if(tab==='home'){loadRooms();updateCoinsUI();}
}

function getMyName(){return myName||tg?.initDataUnsafe?.user?.first_name||params.get('name')||'Гравець';}
function getMyTgId(){return tg?.initDataUnsafe?.user?.id||params.get('tgId')||localStorage.getItem('hfaly_uid')||(()=>{const id='u'+Math.random().toString(36).slice(2);localStorage.setItem('hfaly_uid',id);return id;})();}

function saveName(){
  const val=$('nicknameInput').value.trim();
  if(!val){showToast('Введи нікнейм!');return;}
  myName=val;localStorage.setItem('hfaly_name',val);loadProfile();showToast('Збережено! ✓',1500);
}

function loadProfile(){
  const name=getMyName();
  $('profileName').textContent=name;
  $('avatarLetter').textContent=name[0]?.toUpperCase()||'?';
  $('nicknameInput').value=myName;
  $('pWins').textContent=myStats.wins;
  $('pGames').textContent=myStats.games;
  $('pWr').textContent=myStats.games>0?Math.round(myStats.wins/myStats.games*100)+'%':'0%';
}

function selectDeck(el,name){
  document.querySelectorAll('.deck-card').forEach(d=>d.classList.remove('selected'));
  el.classList.add('selected');currentDeck=name;
  localStorage.setItem('hfaly_deck',name);showToast('Колода обрана! ✓',1500);
}

function openCreateRoom(){$('createRoomModal').classList.add('show');}
function openJoinRoom(){$('joinRoomModal').classList.add('show');}
function setRoomType(el,t){document.querySelectorAll('#createRoomModal .toggle-row:first-of-type .toggle-opt').forEach(o=>o.classList.remove('active'));el.classList.add('active');roomType=t;}
function setDeposit(el,d){document.querySelectorAll('#createRoomModal .toggle-row:nth-of-type(2) .toggle-opt').forEach(o=>o.classList.remove('active'));el.classList.add('active');privateDeposit=d;}

// ── ROOMS ─────────────────────────────────────────────────────────
