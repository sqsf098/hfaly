// ─── Ігровий екран: карти, стіл, анімації ───
function showGameScreen(){
  $('waitingRoom').classList.remove('show');
  document.body.classList.add('in-game'); // ховаємо веер під час гри
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $('gameScreen').classList.add('active');
}

function isTrump(card,trump){return card.rank==='J'||card.suit===trump;}
function canPlay(card,hand,trick,trump){
  if(!trump||trick.length===0)return true;
  const led=trick[0].card,ledT=isTrump(led,trump);
  if(ledT){const hasT=hand.some(c=>isTrump(c,trump));if(hasT)return isTrump(card,trump);return true;}
  const hasS=hand.some(c=>!isTrump(c,trump)&&c.suit===led.suit);
  if(hasS)return!isTrump(card,trump)&&card.suit===led.suit;return true;
}

// Sort hand: trumps first, then ♣♠♥♦, by power desc
function sortHand(hand, trump) {
  const SUIT_ORDER = {'♣':0,'♠':1,'♥':2,'♦':3};
  return [...hand].sort((a,b)=>{
    const aT=isTrump(a,trump), bT=isTrump(b,trump);
    if(aT&&!bT) return -1;
    if(!aT&&bT) return 1;
    if(aT&&bT) return cardPower(b,trump)-cardPower(a,trump);
    if(a.suit!==b.suit) return SUIT_ORDER[a.suit]-SUIT_ORDER[b.suit];
    return cardPower(b,trump)-cardPower(a,trump);
  });
}

function cardPower(card,trump){
  if(card.rank==='6'&&card.suit===trump) return 45; // «мамка» — найсильніша, б'є валетів
  if(card.rank==='J') return {'♣':40,'♠':39,'♥':38,'♦':37}[card.suit]||0;
  if(card.suit===trump) return {'A':35,'K':34,'Q':33,'10':32,'9':31,'8':30,'7':29}[card.rank]||0;
  return {'A':14,'K':13,'Q':12,'10':10,'9':9,'8':8,'7':7,'6':6}[card.rank]||0;
}

// ── Хрестовець: вибір 3 карт на скидання ──────────────────────────
let discardSel=[];
function submitDiscard(){
  if(discardSel.length!==3){showToast('Обери рівно 3 карти');return;}
  sfx('card'); vibrate('light');
  socket.emit('discard_cards',{cardIds:[...discardSel]});
  discardSel=[];
}

// ── Перетягування карти на стіл (drag-to-play) ────────────────────
function isOverTable(clientY){
  const ha=document.querySelector('.my-hand-area');
  if(!ha) return clientY < window.innerHeight*0.6;
  return clientY < ha.getBoundingClientRect().top + 12;
}
function setDropZone(on){ const t=$('tableArea'); if(t) t.classList.toggle('drop-ready',on); }
function setDropActive(on){ const t=$('tableArea'); if(t) t.classList.toggle('drop-active',on); }

function enableCardDrag(el, card){
  el.style.touchAction='pan-x'; // горизонталь — скрол руки, вертикаль — тягнемо
  let armed=false, dragging=false, ghost=null, sx=0, sy=0, offX=0, offY=0, pid=null;

  function beginDrag(e){
    dragging=true;
    try{ el.setPointerCapture(pid); }catch(_){}
    const r=el.getBoundingClientRect();
    offX=e.clientX-r.left; offY=e.clientY-r.top;
    ghost=el.cloneNode(true);
    ghost.classList.add('card-ghost');
    ghost.style.cssText+=`;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:1000;pointer-events:none;transition:none`;
    document.body.appendChild(ghost);
    el.style.visibility='hidden';
    setDropZone(true);
    try{ tg?.HapticFeedback?.impactOccurred?.('light'); }catch(_){}
  }
  function endDrag(e){
    armed=false;
    if(!dragging) return;
    dragging=false;
    setDropZone(false); setDropActive(false);
    const play=isOverTable(e.clientY);
    if(ghost){ ghost.remove(); ghost=null; }
    // ЗАВЖДИ повертаємо видимість: якщо сервер відхилить хід — стану не буде,
    // перемальовки руки теж, і схована карта «зникала» назавжди (баг)
    el.style.visibility='visible';
    if(play){
      try{ tg?.HapticFeedback?.impactOccurred?.('medium'); }catch(_){}
      selectedCardId=card.id; sfx('card'); submitPlay();
    }
  }

  el.addEventListener('pointerdown',e=>{
    if(!(gameState && gameState.phase==='play' && gameState.currentPlayer===myIndex)) return;
    armed=true; sx=e.clientX; sy=e.clientY; pid=e.pointerId;
  });
  el.addEventListener('pointermove',e=>{
    if(!armed) return;
    const dx=e.clientX-sx, dy=e.clientY-sy;
    if(!dragging){
      if(dy<-12 && Math.abs(dy)>Math.abs(dx)) beginDrag(e);       // вгору → тягнемо
      else if(Math.abs(dx)>12) armed=false;                       // вбік → це скрол
      return;
    }
    ghost.style.left=(e.clientX-offX)+'px';
    ghost.style.top=(e.clientY-offY)+'px';
    setDropActive(isOverTable(e.clientY));
  });
  el.addEventListener('pointerup',endDrag);
  el.addEventListener('pointercancel',()=>{
    armed=false;
    if(ghost){ ghost.remove(); ghost=null; }
    if(dragging){ dragging=false; setDropZone(false); setDropActive(false); el.style.visibility='visible'; }
  });
}

function makeCard(card,opts={}){
  const th=DECK_THEMES[currentDeck];const isRed=SUIT_RED[card.suit];
  const el=document.createElement('div');
  el.className=`pcard ${opts.selected?'selected':''} ${opts.invalid?'invalid':''}`;
  el.dataset.id=card.id;
  // Скін конкретної карти (лише вигляд — значення без змін)
  const sk=typeof cardSkinFor==='function'?cardSkinFor(card):null;
  const bg=sk?(sk.img?`url('${sk.img}') center/cover, ${th.bg}`:sk.bg):th.bg;
  const col=sk?(sk.color||(isRed?th.red:th.black)):(isRed?th.red:th.black);
  el.style.cssText=`background:${bg};border-color:${opts.selected?'var(--gold)':(sk?'var(--gold-dim)':th.border)}`;
  const center=sk&&!sk.img?(sk.emoji||card.suit):card.suit;
  el.innerHTML=`
    <div class="ct" style="color:${col}"><span>${card.rank}</span><span>${card.suit}</span></div>
    <div class="cm" style="color:${col}">${sk&&sk.img?'':center}</div>
    <div class="cb" style="color:${col}"><span>${card.rank}</span><span>${card.suit}</span></div>`;
  if(opts.onClick)el.addEventListener('click',opts.onClick);
  return el;
}

function makeCardHTML(card){
  const th=DECK_THEMES[currentDeck];const isRed=SUIT_RED[card.suit];
  const sk=typeof cardSkinFor==='function'?cardSkinFor(card):null;
  const bgH=sk?(sk.img?`url('${sk.img}') center/cover, ${th.bg}`:sk.bg):th.bg;
  const col=sk?(sk.color||(isRed?th.red:th.black)):(isRed?th.red:th.black);
  const center=sk?(sk.img?'':(sk.emoji||card.suit)):card.suit;
  // Абсолютна розкладка: індекси по діагоналі (верх-ліво / низ-право,
  // як у справжніх карт), масть строго по центру — нічого не «роз'їжджається»
  return `<div style="position:relative;width:50px;height:72px;border-radius:7px;background:${bgH};
    border:1.5px solid ${sk?'var(--gold-dim)':th.border};flex-shrink:0;box-shadow:1px 1px 4px rgba(0,0,0,0.2)">
    <div style="position:absolute;top:3px;left:5px;font-size:12px;font-weight:800;color:${col};line-height:1.05;text-align:center">${card.rank}<br><span style="font-size:11px">${card.suit}</span></div>
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;color:${col}">${center}</div>
    <div style="position:absolute;bottom:3px;right:5px;transform:rotate(180deg);font-size:12px;font-weight:800;color:${col};line-height:1.05;text-align:center">${card.rank}<br><span style="font-size:11px">${card.suit}</span></div>
  </div>`;
}

function renderGame(state){
  const{phase,players,scores,trump,currentPlayer,trick,trickCount,hand,handSizes,boaster,roundNum}=state;
  const isKhrest=state.mode==='khrest';
  const isMyTurn=currentPlayer===myIndex,iAmBoaster=boaster===myIndex;
  const tb=$('ghTrump');tb.textContent=trump||'';tb.style.color=trump?(SUIT_RED[trump]?'#e74c3c':'#f0f0f0'):'';
  const pot=players.length*currentRoomDeposit;
  $('ghPot').textContent=pot>0?`Банк: ${pot} 💰`:`Раунд ${roundNum}`;
  // Хрестовець — кожен за себе: командна панель не потрібна,
  // особисті штрафи показуємо в бейджах гравців нижче
  const sb=document.querySelector('.score-bar'); if(sb) sb.style.display=isKhrest?'none':'flex';
  if(!isKhrest){
    $('scoreANames').textContent=`${(players[0]?.name||'Г1').slice(0,6)} & ${(players[2]?.name||'Г3').slice(0,6)}`;
    $('scoreBNames').textContent=`${(players[1]?.name||'Г2').slice(0,6)} & ${(players[3]?.name||'Г4').slice(0,6)}`;
  }
  renderOpponents(state);
  renderOpponentCards(state);

  // Update discard pile
  const tricksPlayed = state.trickCount ? state.trickCount.reduce((a,b)=>a+b,0) : 0;
  updateDiscardPile(tricksPlayed);
  const tc=$('trickCards');tc.innerHTML='';
  const trickWinnerIdx = trick.length===4 ? trick.reduce((best,t,i)=>{
    // simple: last item indicator for display
    return best;
  }, null) : null;
  for(const t of trick){
    const slot=document.createElement('div');slot.className='trick-slot';
    const isMe = t.playerIndex===myIndex;
    slot.innerHTML=`<div class="trick-who" style="${isMe?'color:#00ff88;font-weight:700':''}">
      ${isMe?'▶ ':''}${(players[t.playerIndex]?.name||'?').slice(0,6)}
    </div>`;
    slot.innerHTML+=makeCardHTML(t.card);
    tc.appendChild(slot);
  }
  let msg='';
  if(phase==='discard'){
    const iDiscarded=(state.discardDone||[]).includes(myIndex);
    msg=iDiscarded?`⏳ Чекаємо інших (${(state.discardDone||[]).length}/${state.maxPlayers})...`
                  :`🗑 Скинь 3 карти (${discardSel.length}/3)`;
  }
  else if(phase==='choose_trump'||phase==='show9')msg=iAmBoaster?'🗣️ Обери козир':`⏳ ${(players[boaster]?.name||'?').slice(0,10)} обирає козир...`;
  else if(phase==='play')msg=(isMyTurn?'👆 Твій хід!':`⏳ Ходить ${(players[currentPlayer]?.name||'?').slice(0,10)}...`)
    +(isKhrest?(iAmBoaster?' · норма 5':' · норма 2'):'');
  $('statusPill').textContent=msg;
  const mnt=$('myNameTag');
  mnt.textContent=(players[myIndex]?.name||'Ти')+(iAmBoaster?' 🗣️':'')+(isMyTurn?' 👆':'');
  mnt.className='my-name-tag'+(isMyTurn?' active':'')+(iAmBoaster?' boaster':'');
  // Бейджі: у хрестовці — дачки + особистий штраф до 24
  $('tricksMini').innerHTML=trickCount.map((c,i)=>`<span class="tm-badge">${(players[i]?.name||`Г${i+1}`).slice(0,4)}: ${c}${isKhrest?` · ${scores[i]}/24`:''}</span>`).join('');

  // Кнопка скидання (Хрестовець)
  const db=$('discardBtn');
  if(db){
    const iDiscarded=(state.discardDone||[]).includes(myIndex);
    db.className='play-action-btn'+(phase==='discard'&&!iDiscarded&&discardSel.length===3?' show':'');
  }

  const hd=$('myHandCards');hd.innerHTML='';
  const sorted = trump ? sortHand(hand, trump) : hand;
  if(sorted.length===0) return;

  // ── Фаза скидання (Хрестовець): обери 3 карти ──────────────────
  if(phase==='discard'){
    const iDiscarded=(state.discardDone||[]).includes(myIndex);
    sorted.forEach((card,i)=>{
      const isSel=discardSel.includes(card.id);
      const el=makeCard(card,{selected:isSel,onClick:()=>{
        if(iDiscarded)return;
        if(card.id==='J♣'){showToast('Хрестового валета скидати не можна ♣',2200);return;}
        if(isSel)discardSel=discardSel.filter(id=>id!==card.id);
        else{ if(discardSel.length>=3){showToast('Максимум 3 карти');return;} discardSel.push(card.id); }
        sfx('click');
        renderGame(gameState);
      }});
      if(iDiscarded)el.classList.add('invalid');
      el.style.zIndex=isSel?50:i+1;
      hd.appendChild(el);
    });
    return; // нижче — логіка фази гри
  }

  // Simple overlap row - all cards visible, scroll if needed
  sorted.forEach((card, i) => {
    const isSel = card.id===selectedCardId;
    const isInv = phase==='play'&&isMyTurn&&!canPlay(card,hand,trick,trump);
    const isPlayable = phase==='play'&&isMyTurn&&!isInv;
    const el = makeCard(card, {
      selected: isSel,
      invalid: isInv&&!isSel,
      onClick: () => {
        if(phase!=='play'||currentPlayer!==myIndex) return;
        if(isInv){ showToast('Ця карта не дозволена'); return; }
        selectedCardId = isSel ? null : card.id;
        renderGame(gameState);
      }
    });
    if(isPlayable && !isSel) el.classList.add('playable');
    if(isPlayable) enableCardDrag(el, card); // перетягування на стіл
    el.style.zIndex = isSel ? 50 : i+1;
    hd.appendChild(el);
  });

  // Timer
  if(phase==='play'&&isMyTurn){ startTimer(30); } else { stopTimer(); }

  // Log
  updateLog(state);

  // Trick dots
  updateTrickDots(trickCount,myIndex,boaster);

  // Рахунок команди (штраф до 24; хто перший 24 — програв)
  $('scoreA').textContent=scores[0];
  $('scoreB').textContent=scores[1];
  if(phase==='choose_trump'&&iAmBoaster){
    $('trumpOverlay').classList.add('show');
    const t3=$('trump3cards');
    if(t3){
      t3.innerHTML='';
      // хФали: перші 3 карти; Хрестовець: вся рука з 9 (козир після скидання)
      const show3 = isKhrest ? hand : (state.partialHand && state.partialHand.length>0 ? state.partialHand : hand.slice(0,3));
      show3.forEach(card=>{ t3.innerHTML+=makeCardHTML(card); });
    }
  } else {
    $('trumpOverlay').classList.remove('show');
  }
  // Оверлей show9Overlay керується подією 'ninth_revealed' (showNinthReveal),
  // renderGame його не чіпає, щоб оновлення стану не ховало показ карти.
}

// Показ відкритої "на останню" карти всім гравцям
function showNinthReveal(card, trump, boaster){
  const ov=$('show9Overlay'); if(!ov||!card) return;
  const c=$('show9cards');
  if(c) c.innerHTML='<div style="border:2px solid var(--gold);border-radius:8px;padding:2px">'+makeCardHTML(card)+'</div>';
  const sub=$('ninthRevealSub'); if(sub) sub.textContent=(boaster||'Хвалящий')+' пішов на останню';
  const lbl=$('ninthTrumpLabel'); if(lbl) lbl.textContent='Козир: '+trump;
  ov.classList.add('show');
  clearTimeout(showNinthReveal._t);
  showNinthReveal._t=setTimeout(()=>ov.classList.remove('show'),2600);
}

function renderOpponents(state){
  // Labels handled by renderOpponentCards now
}

function renderRoundEnd(result){
  const players=gameState?.players||[];
  const grid=$('roundResultGrid');grid.innerHTML='';
  const target=result.target||24;

  // ── Хрестовець: особисті норми (5 хвалящому / 2 іншим) і штрафи ──
  if(result.mode==='khrest'){
    $('roundSummaryText').textContent=`Норма: хвалящий 5 · інші по 2`;
    for(let i=0;i<3;i++){
      const took=result.trickCount[i], req=result.required[i], pen=result.deltas[i];
      const div=document.createElement('div');div.className=`rp ${pen>0?'neg':'pos'}`;
      div.innerHTML=`<div class="rp-name">${(players[i]?.name||`Г${i+1}`).slice(0,10)}${i===myIndex?' (ти)':''}${i===result.boaster?' 🗣️':''}</div>
        <div class="rp-delta">${took}/${req}${pen>0?' · +'+pen:' ✓'}</div>
        <div class="rp-total">${result.scores[i]}/${target}</div>`;
      grid.appendChild(div);
    }
    return;
  }

  $('roundSummaryText').textContent=`Хвалящий взяв ${result.boasterTricks} дачок з 9`;
  for(let i=0;i<4;i++){
    const d=result.deltas[i];
    // Штрафні очки: отримав штраф (d>0) — погано (червоне); 0 — добре (зелене)
    const div=document.createElement('div');div.className=`rp ${d>0?'neg':'pos'}`;
    div.innerHTML=`<div class="rp-name">${(players[i]?.name||`Г${i+1}`).slice(0,10)}${i===myIndex?' (ти)':''}</div>
      <div class="rp-delta">${d>0?'+'+d:'0'}</div><div class="rp-total">${result.scores[i]}/${target}</div>`;
    grid.appendChild(div);
  }
}

function showGameFinished(result){
  const isWinner=result.winTeam.includes(myIndex);
  const payout=result.payouts[myIndex];
  $('winTitle').textContent=isWinner?'🏆 ПЕРЕМОГА!':'😞 Поразка';
  $('winAmount').textContent=(isWinner?'+':'-')+Math.abs(payout?.delta||0)+' 💰';
  $('winAmount').style.color=isWinner?'var(--gold2)':'#e74c3c';
  $('winSub').textContent=isWinner?`Твій баланс: ${payout?.coins||myCoins} 💰`:`Банк поділили переможці`;
  $('winBox').style.borderColor=isWinner?'var(--gold)':'rgba(192,57,43,0.5)';
  $('gameFinishedOverlay').classList.add('show');
  if(isWinner)floatCoin(payout?.delta||0, window.innerWidth/2, window.innerHeight/3);
}

function goToLobby(){
  $('gameFinishedOverlay').classList.remove('show');
  document.body.classList.remove('in-game');
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $('homeScreen').classList.add('active');
  if(typeof syncFan==='function')syncFan('home');
  socket.emit('get_wallet',{tgId:getMyTgId()});
  loadRooms();
  gameState=null;
}

// ── Timer ─────────────────────────────────────────────────────
let timerInterval=null, timerLeft=30;
function startTimer(seconds=30){
  clearInterval(timerInterval);
  timerLeft=seconds;
  const fill=$('timerFill');
  if(!fill)return;
  fill.style.transition='none';
  fill.style.width='100%';
  fill.className='timer-fill';
  timerInterval=setInterval(()=>{
    timerLeft--;
    const pct=Math.max(0,(timerLeft/seconds)*100);
    fill.style.transition='width 1s linear';
    fill.style.width=pct+'%';
    if(timerLeft<=8)fill.className='timer-fill urgent';
    if(timerLeft<=0){
      clearInterval(timerInterval);
      // Автохід — кидаємо першу допустиму карту
      if(gameState&&gameState.currentPlayer===myIndex&&gameState.phase==='play'){
        const valid=gameState.hand.filter(card=>canPlay(card,gameState.hand,gameState.trick,gameState.trump));
        if(valid.length>0){selectedCardId=valid[0].id;submitPlay();}
      }
    }
  },1000);
}
function stopTimer(){clearInterval(timerInterval);const f=$('timerFill');if(f){f.style.width='0%';}}

// ── Trick log ─────────────────────────────────────────────────
let logOpen=false;
function toggleLog(){
  logOpen=!logOpen;
  $('trickLog').classList.toggle('open',logOpen);
}
function updateLog(state){
  const log=$('trickLog');
  if(!log)return;
  const lines=(state.log||[]).slice(-12).reverse();
  log.innerHTML=lines.map(l=>`<div class="trick-log-row"><span>${l}</span></div>`).join('');
}

// ── Trick dots ────────────────────────────────────────────────
function updateTrickDots(trickCount,myIdx,boaster){
  const dots=$('myTrickDots');
  if(!dots)return;
  const myTricks=trickCount[myIdx]||0;
  const partnerTricks=trickCount[(myIdx+2)%4]||0;
  const teamTotal=myTricks+partnerTricks;
  dots.innerHTML='';
  for(let i=0;i<9;i++){
    const d=document.createElement('div');
    d.className='tc-dot'+(i<teamTotal?(myIdx===boaster?' won mine':' won'):'');
    dots.appendChild(d);
  }
}

// ── Deal Animation ───────────────────────────────────────────
function playDealAnimation(hand, onDone) {
  const overlay = $('dealOverlay');
  if(!overlay){ onDone(); return; }
  overlay.style.display='block';
  overlay.innerHTML='';
  const cx = overlay.offsetWidth/2 || 180;
  const cy = overlay.offsetHeight/2 || 150;
  const theme = DECK_THEMES[currentDeck];

  hand.forEach((card, i) => {
    setTimeout(()=>{
      const el = document.createElement('div');
      // Start position: center of table
      el.style.cssText=`position:absolute;width:44px;height:64px;border-radius:6px;
        background:${theme.bg};border:1.5px solid ${theme.border};
        left:${cx-22}px;top:${cy-32}px;opacity:0;
        transition:all 0.4s cubic-bezier(0.25,0.46,0.45,0.94);
        z-index:${i};display:flex;align-items:center;justify-content:center;font-size:16px`;
      // Show rank+suit
      const isRed = SUIT_RED[card.suit];
      const col = isRed ? theme.red : theme.black;
      el.innerHTML=`<span style="color:${col};font-weight:700;font-size:13px">${card.rank}${card.suit}</span>`;
      overlay.appendChild(el);

      // Force reflow
      el.getBoundingClientRect();

      // Animate to bottom
      el.style.opacity='1';
      el.style.left=(cx-22+(i-hand.length/2)*8)+'px';
      el.style.top=(overlay.offsetHeight-80)+'px';
      el.style.transform=`rotate(${(i-hand.length/2)*3}deg)`;
    }, i * 120);
  });

  setTimeout(()=>{
    overlay.style.display='none';
    overlay.innerHTML='';
    onDone();
  }, hand.length * 120 + 600);
}

// ── Збір взятки: карти зі столу злітаються в стопку до переможця ──
function trickWinnerAnchor(winnerIdx){
  const N=(gameState&&gameState.maxPlayers)||4;
  const off=(((winnerIdx-myIndex)%N)+N)%N;
  let el=null;
  if(off===0) el=document.querySelector('.my-hand-area');      // я → знизу
  else if(N===3) el=off===1?$('oppLeft'):$('oppRight');        // 3 гравці: ліво/право
  else if(off===1) el=$('oppTop');                             // наступний → зверху
  else if(off===2) el=$('oppLeft');                            // ліворуч
  else el=$('oppRight');                                       // праворуч
  const r=el?el.getBoundingClientRect():null;
  if(!r) return {x:window.innerWidth/2, y:window.innerHeight/2};
  return {x:r.left+r.width/2, y:r.top+r.height/2};
}

function animateTrickCollect(winnerIdx, onDone){
  const tc=$('trickCards');
  if(!tc || !tc.children.length){ onDone&&onDone(); return; }
  const a=trickWinnerAnchor(winnerIdx);
  const slots=[...tc.children];
  slots.forEach((slot,i)=>{
    const cardEl=slot.children[slot.children.length-1]; // сама карта (не імʼя)
    if(!cardEl) return;
    const r=cardEl.getBoundingClientRect();
    const f=cardEl.cloneNode(true);
    f.style.cssText+=`;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;`
      +`z-index:900;pointer-events:none;box-shadow:0 8px 22px rgba(0,0,0,0.55);`
      +`transition:transform 0.5s cubic-bezier(.35,.1,.25,1),opacity 0.45s ease-in`;
    document.body.appendChild(f);
    const dx=a.x-(r.left+r.width/2), dy=a.y-(r.top+r.height/2);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      f.style.transitionDelay=(i*0.05)+'s';
      f.style.transform=`translate(${dx}px,${dy}px) rotate(${(i-1.5)*10}deg) scale(0.5)`;
      f.style.opacity='0';
    }));
    setTimeout(()=>f.remove(), 1000);
  });
  // оригінали одразу ховаємо — їх «зібрали»
  tc.style.transition='opacity 0.15s'; tc.style.opacity='0';
  try{ tg?.HapticFeedback?.impactOccurred?.('light'); }catch(_){}
  setTimeout(()=>{ tc.style.opacity=''; tc.style.transition=''; onDone&&onDone(); }, 600);
}

// ── Trick Review ──────────────────────────────────────────────
let trickReviewPending = null;
let dealAnimPending = false;
let lastHandSize = 0; // { trick, winnerIdx, winnerName, onDone }

function showTrickReview(trick, winnerIdx, winnerName, players, onDone) {
  trickReviewPending = onDone;
  const panel = $('trickReview');
  const label = $('trickWinnerLabel');
  const cards = $('trickReviewCards');
  if(!panel) { onDone(); return; }

  label.textContent = `🏆 ${winnerName} бере дачку!`;
  cards.innerHTML = '';

  trick.forEach(t => {
    const wrap = document.createElement('div');
    wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:3px';
    const pname = document.createElement('div');
    pname.style.cssText=`font-size:10px;color:${t.playerIndex===myIndex?'#00ff88':'rgba(255,255,255,0.5)'}`;
    pname.textContent = (players[t.playerIndex]?.name||'?').slice(0,6)+(t.playerIndex===winnerIdx?' 🏆':'');
    wrap.innerHTML = pname.outerHTML + makeCardHTML(t.card);
    cards.appendChild(wrap);
  });

  panel.classList.add('show');
}

function dismissTrickReview() {
  const panel = $('trickReview');
  if(panel) panel.classList.remove('show');
  if(trickReviewPending) {
    const fn = trickReviewPending;
    trickReviewPending = null;
    fn();
  }
}

// ══ OPPONENT CARDS ON TABLE ═══════════════════════════════════════
function renderOpponentCards(state) {
  const {players, handSizes, boaster, currentPlayer} = state;
  const positions = [
    {containerId:'oppTopCards', labelId:'oppTopLabel', horiz:true},
    {containerId:'oppLeftCards', labelId:'oppLeftLabel', horiz:false},
    {containerId:'oppRightCards', labelId:'oppRightLabel', horiz:false},
  ];

  const N = state.maxPlayers||4;
  // 3 гравці (Хрестовець): двоє суперників — ліворуч і праворуч, верх порожній
  const offsets = N===3 ? [1,2] : [1,2,3];
  const posMap  = N===3 ? [positions[1],positions[2]] : positions;
  if(N===3){ const c=$('oppTopCards'),l=$('oppTopLabel'); if(c)c.innerHTML=''; if(l)l.innerHTML=''; }

  offsets.forEach((offset, ri) => {
    const idx = (myIndex + offset) % N;
    const pos = posMap[ri];
    const container = $(pos.containerId);
    const label = $(pos.labelId);
    if(!container || !label) return;

    const p = players[idx];
    const cnt = handSizes[idx] ?? 0;
    const isActive = currentPlayer === idx;
    const isBoaster = boaster === idx;

    // Label
    label.className = 'opp-label' + (isActive?' active':'') + (isBoaster?' boaster':'');
    label.innerHTML = (p?.name||`Г${idx+1}`).slice(0,8)
      + (isBoaster?' 🗣️':'')
      + (state.trickCount?.[idx]>0 ? ` (${state.trickCount[idx]})` : '');

    // Cards face-down
    container.innerHTML = '';
    const show = Math.min(cnt, pos.horiz ? 7 : 6);
    for(let i=0; i<show; i++) {
      const card = document.createElement('div');
      card.className = 'opp-card-back' + (pos.horiz?'':' horiz');
      if(pos.horiz) {
        card.style.cssText = `position:absolute;left:${i*14}px;top:0;transform:rotate(${(i-show/2)*2}deg);z-index:${i}`;
      } else {
        card.style.cssText = `position:absolute;top:${i*12}px;left:0;transform:rotate(${(i%2===0?-2:2)}deg);z-index:${i}`;
      }
      container.appendChild(card);
    }
    // Boaster crown
    if(isBoaster && cnt > 0) {
      const crown = document.createElement('div');
      crown.className = 'boaster-crown';
      crown.textContent = '👑';
      container.style.position = 'relative';
      container.appendChild(crown);
    }
  });
}

// ══ DISCARD PILE ═══════════════════════════════════════════════════
let discardTotal = 0;
function updateDiscardPile(tricksPlayed) {
  const stack = $('discardStack');
  const countEl = $('discardCount');
  if(!stack) return;
  stack.innerHTML = '';
  const show = Math.min(tricksPlayed, 5);
  for(let i=0; i<show; i++) {
    const card = document.createElement('div');
    card.className = 'discard-card';
    card.style.cssText = `top:${-i*3}px;left:${i*2}px;transform:rotate(${(i%3-1)*8}deg)`;
    stack.appendChild(card);
  }
  if(countEl) countEl.textContent = tricksPlayed > 0 ? `${tricksPlayed*4} карт` : '';
}

// ══ DEAL INTRO ANIMATION ═══════════════════════════════════════════
let dealIntroDone = false;

function showDealIntro(players, boasterIdx, onDone) {
  dealIntroDone = false;
  sfx('deal');
  const overlay = $('dealIntro');
  const title = $('dealIntroTitle');
  const sub = $('dealIntroSub');
  const cardRow = $('dealIntroCards');
  if(!overlay) { onDone(); return; }

  overlay.classList.add('show');
  title.textContent = 'Роздаємо карти...';
  sub.textContent = 'Хто отримає 7♦?';
  cardRow.innerHTML = '';

  // Show 4 card backs being "dealt"
  const theme = DECK_THEMES[currentDeck];
  players.forEach((p, i) => {
    setTimeout(() => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;animation:dealSingle 0.3s ease';
      wrap.innerHTML = `
        <div style="width:36px;height:52px;border-radius:5px;
          background:linear-gradient(135deg,#1a1a6e,#2d2d8e);
          border:1.5px solid rgba(120,120,220,0.5);
          box-shadow:2px 3px 8px rgba(0,0,0,0.5);
          ${i === boasterIdx ? 'border-color:var(--gold);box-shadow:0 0 16px rgba(201,168,76,0.6)' : ''}
        "></div>
        <div style="font-size:10px;color:${i===boasterIdx?'var(--gold)':'var(--text3)'};
          font-family:'Cinzel',serif;letter-spacing:0.5px">${(p?.name||'Г'+(i+1)).slice(0,7)}</div>
      `;
      cardRow.appendChild(wrap);
    }, i * 200);
  });

  // Reveal boaster
  setTimeout(() => {
    title.innerHTML = `🗣️ Хвалиться <span style="color:var(--gold)">${(players[boasterIdx]?.name||'Г'+(boasterIdx+1)).slice(0,10)}</span>!`;
    sub.textContent = 'Отримав 7♦';

    // Highlight boaster card
    const cards = cardRow.children;
    if(cards[boasterIdx]) {
      cards[boasterIdx].style.transform = 'scale(1.2) translateY(-8px)';
      cards[boasterIdx].style.transition = 'transform 0.3s ease';
      cards[boasterIdx].querySelector('div').style.borderColor = 'var(--gold)';
    }

    setTimeout(() => {
      overlay.classList.remove('show');
      dealIntroDone = true;
      onDone();
    }, 1500);
  }, players.length * 200 + 800);
}

// ══ CARD THROW ANIMATION ═══════════════════════════════════════════
function animateCardToCenter(fromEl, targetEl, card, onDone) {
  if(!fromEl || !targetEl) { onDone && onDone(); return; }
  const theme = DECK_THEMES[currentDeck];
  const isRed = SUIT_RED[card.suit];
  const col = isRed ? theme.red : theme.black;

  const fromRect = fromEl.getBoundingClientRect();
  const toRect = targetEl.getBoundingClientRect();
  const flying = document.createElement('div');
  flying.style.cssText = `
    position:fixed;z-index:999;pointer-events:none;
    width:44px;height:64px;border-radius:7px;
    background:${theme.bg};border:1.5px solid ${theme.border};
    display:flex;align-items:center;justify-content:center;
    font-size:18px;font-weight:800;color:${col};
    box-shadow:3px 6px 16px rgba(0,0,0,0.5);
    left:${fromRect.left}px;top:${fromRect.top}px;
    transition:all 0.35s cubic-bezier(0.25,0.46,0.45,0.94);
  `;
  flying.textContent = card.suit;
  document.body.appendChild(flying);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flying.style.left = toRect.left + 'px';
      flying.style.top = toRect.top + 'px';
      flying.style.transform = `rotate(${Math.random()*20-10}deg)`;
    });
  });

  setTimeout(() => {
    flying.remove();
    onDone && onDone();
  }, 380);
}

function pickTrump(suit){socket.emit('choose_trump',{suit});}
function goLastCard(){socket.emit('show_ninth');}
function pickTrumpLast(suit){socket.emit('confirm_trump_last',{suit});}
function submitPlay(){if(!selectedCardId)return;socket.emit('play_card',{cardId:selectedCardId});selectedCardId=null;}
function nextRound(){
  $('roundEndOverlay').classList.remove('show');
  socket.emit('next_round');
  // Кінець гри визначає сервер (команда набрала 24) — клієнтська евристика не потрібна
}

// ── Вихід з гри ───────────────────────────────────────────────────
function confirmLeaveGame(){
  const ov = $('leaveConfirm'); if(ov) ov.classList.add('show');
}
function cancelLeaveGame(){
  const ov = $('leaveConfirm'); if(ov) ov.classList.remove('show');
}
function doLeaveGame(){
  const ov = $('leaveConfirm'); if(ov) ov.classList.remove('show');
  if(socket) socket.emit('leave_room');
  stopTimer();
  // Ховаємо всі оверлеї гри
  document.querySelectorAll('.game-overlay').forEach(o=>o.classList.remove('show'));
  const wr = $('waitingRoom'); if(wr) wr.classList.remove('show');
  document.body.classList.remove('in-game');
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $('homeScreen').classList.add('active');
  if(typeof syncFan==='function')syncFan('home');
  gameState=null;
  myRoomId=null;
  selectedCardId=null;
  loadRooms();
}

// ── INIT ──────────────────────────────────────────────────────────
