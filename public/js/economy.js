// ─── Клієнт: скрині та щоденні квести ───

function openChestsModal(){
  connectSocket();
  socket.emit('get_economy',{tgId:getMyTgId()});
  $('chestsModal').classList.add('show');
  renderEconomy();
}

// Людський опис винагороди {coins,gems,deck,chest}
const DECK_LABELS={
  classic:'Класична',dark:'Нічна',gold:'Золота',neon:'Неон',
  royal:'Королівська 👑',emerald:'Смарагдова',crimson:'Багряна',galaxy:'Галактика',
};
function rewardText(g){
  if(!g)return '';
  const parts=[];
  if(g.coins)parts.push(`+${g.coins} 💰`);
  if(g.gems)parts.push(`+${g.gems} 💎`);
  if(g.deck)parts.push(`🎴 Колода «${DECK_LABELS[g.deck]||g.deck}»`);
  if(g.chest)parts.push(`📦 Скриня`);
  return parts.join('  ');
}

function fmtCooldown(ms){
  if(ms<=0)return 'Готово!';
  const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000);
  if(h>0)return `${h} год ${m} хв`;
  const s=Math.floor(ms%60000/1000);
  return m>0?`${m} хв`:`${s} с`;
}

function renderEconomy(){
  if(!economyData)return;
  const cg=$('chGems');if(cg)cg.textContent=economyData.gems;
  const cc=$('chCoins');if(cc)cc.textContent=economyData.coins;
  renderChests();
  renderQuests();
  // Бейдж кількості готових до отримання квестів
  const ready=(economyData.quests||[]).filter(q=>q.done&&!q.claimed).length;
  const badge=$('questBadge');
  if(badge)badge.textContent=ready>0?`🔴 ${ready} нагород`:'Відкрити';
}

function renderChests(){
  const grid=$('chestsGrid');if(!grid||!economyData)return;
  grid.innerHTML='';
  const owned=economyData.chests||{};
  for(const c of economyData.chestCatalog){
    const count=owned[c.id]||0;
    let costLabel,disabled=false;
    if(count>0){costLabel=`У тебе: ${count} шт`;}
    else if(c.free){
      const ready=economyData.freeChestReadyIn<=0;
      costLabel=ready?'Безкоштовно':`⏳ ${fmtCooldown(economyData.freeChestReadyIn)}`;
      disabled=!ready;
    } else if(c.cost){
      if(c.cost.coins){costLabel=`${c.cost.coins} 💰`;disabled=economyData.coins<c.cost.coins;}
      else if(c.cost.gems){costLabel=`${c.cost.gems} 💎`;disabled=economyData.gems<c.cost.gems;}
    }
    const div=document.createElement('div');
    div.style.cssText=`display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;
      background:rgba(0,0,0,0.25);border:1px solid ${c.color}44`;
    div.innerHTML=`
      <div style="font-size:32px">${c.emoji}</div>
      <div style="flex:1">
        <div style="font-size:13px;color:var(--text);font-weight:600">${c.name}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:1px">${costLabel}</div>
      </div>
      <button class="btn-gold" style="max-width:110px;padding:8px 12px;font-size:12px;${disabled?'opacity:0.4;pointer-events:none':''}"
        onclick="openChestUI('${c.id}')">${count>0?'Відкрити':(c.free?'Взяти':'Купити')}</button>`;
    grid.appendChild(div);
  }
}

function renderQuests(){
  const list=$('questsList');if(!list||!economyData)return;
  list.innerHTML='';
  for(const q of economyData.quests||[]){
    const pct=Math.min(100,Math.round(q.progress/q.target*100));
    const rw=rewardText(q.reward);
    let action;
    if(q.claimed)action=`<span style="font-size:11px;color:var(--text3)">✓ Отримано</span>`;
    else if(q.done)action=`<button class="btn-gold" style="max-width:100px;padding:7px 12px;font-size:12px" onclick="claimQuestUI('${q.id}')">Забрати</button>`;
    else action=`<span style="font-size:11px;color:var(--text3)">${q.progress}/${q.target}</span>`;
    const div=document.createElement('div');
    div.style.cssText=`padding:10px 12px;border-radius:12px;background:rgba(0,0,0,0.25);border:1px solid var(--border2)`;
    div.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="flex:1">
          <div style="font-size:13px;color:var(--text);font-weight:600">${q.text}</div>
          <div style="font-size:10px;color:var(--gold);margin-top:2px">${rw}</div>
        </div>
        ${action}
      </div>
      <div style="height:5px;background:rgba(255,255,255,0.08);border-radius:3px;margin-top:8px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${q.done?'var(--green2,#27ae60)':'var(--gold)'};transition:width 0.4s"></div>
      </div>`;
    list.appendChild(div);
  }
}

function openChestUI(chestId){
  if(!socket)return;
  socket.emit('open_chest',{tgId:getMyTgId(),chestId});
}
function claimQuestUI(questId){
  if(!socket)return;
  socket.emit('claim_quest',{tgId:getMyTgId(),questId});
}

// Перемальовує екран колод з урахуванням володіння
function renderDecks(){
  const grid=document.querySelector('#decksScreen .decks-grid');
  if(!grid)return;
  const owned=(economyData&&economyData.ownedDecks)||['classic','dark','gold','neon'];
  grid.innerHTML='';
  for(const key of Object.keys(DECK_META)){
    if(NFT_DECK_KEYS.includes(key)) continue; // NFT — окрема секція
    const th=DECK_THEMES[key],meta=DECK_META[key];
    const isOwned=owned.includes(key);
    const isSel=currentDeck===key;
    const div=document.createElement('div');
    div.className='deck-card'+(isSel?' selected':'')+(isOwned?'':' locked');
    div.innerHTML=`
      <div class="deck-check">✓</div>
      <div class="deck-preview">
        <div class="deck-mini" style="background:${th.bg};color:${th.red};border-color:${th.border}">♥</div>
        <div class="deck-mini" style="background:${th.bg};color:${th.black};border-color:${th.border}">♠</div>
        <div class="deck-mini" style="background:${th.bg};color:${th.red};border-color:${th.border}">♦</div>
      </div>
      <div class="deck-name">${meta.name}</div>
      <div class="deck-desc">${isOwned?meta.desc:'🔒 Заблоковано'}</div>`;
    if(isOwned)div.onclick=()=>selectDeck(div,key);
    else div.onclick=()=>showToast('Ця колода випадає зі скринь! Відкрий скриню 🎁',2500);
    grid.appendChild(div);
  }
}

function showChestReward(gained){
  const ov=$('chestRewardOverlay');if(!ov)return;
  const icon=$('chestRewardIcon');
  if(gained.deck)icon.textContent='🎴';
  else if(gained.gems)icon.textContent='💎';
  else if(gained.chest)icon.textContent='📦';
  else icon.textContent='💰';
  $('chestRewardText').textContent=rewardText(gained);
  ov.classList.add('show');
  if(gained.coins)floatCoin(gained.coins,window.innerWidth/2,window.innerHeight/3);
}
