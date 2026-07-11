// ─── Клієнт: скрині та щоденні квести ───

function openChestsModal(){
  connectSocket();
  socket.emit('get_economy',{tgId:getMyTgId()});
  socket.emit('get_bank');
  $('chestsModal').classList.add('show');
  renderEconomy();
  renderBank();
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
  if(g.skin)parts.push(`🃏 Скін «${g.skin.name}»${g.skin.rarity==='epic'?' 💜':g.skin.rarity==='rare'?' 💙':''}`);
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

// ЛУДКА-ШОУ: скриня трясеться → вибух променів і конфеті → нагорода
// з аурою рідкості. Рідкісніше — драматичніше (довша тряска, більше конфеті).
function showChestReward(gained,chestId){
  const ov=$('chestRewardOverlay');if(!ov)return;
  const chestEmoji={wood:'📦',silver:'🎁',gold:'👑'}[chestId]||'🎁';
  const rar=gained.skin&&gained.skin.rarity||null;
  const rarC=rar?(RARITY_UI[rar]||{}).color:'#ffd166';
  const drama=rar==='epic'?1.5:rar==='rare'?1.2:1; // множник видовищності
  const skinDef=gained.skin&&CARD_SKINS[gained.skin.id];
  const icon=gained.skin?((skinDef&&skinDef.img)?`<img src="${skinDef.img}" style="width:86px;border-radius:8px;box-shadow:0 0 30px ${rarC}">`:`<span style="font-size:56px">${(skinDef&&skinDef.emoji)||'🃏'}</span>`)
    :gained.deck?'<span style="font-size:56px">🎴</span>'
    :gained.gems?'<span style="font-size:56px">💎</span>'
    :gained.chest?'<span style="font-size:56px">📦</span>'
    :'<span style="font-size:56px">💰</span>';

  // Етап 1: скриня трясеться
  ov.innerHTML=`<div class="go-box" style="text-align:center;background:transparent;border:none;box-shadow:none">
    <div id="chestStage" style="font-size:84px;animation:chestShake ${0.9*drama}s ease-in-out">${chestEmoji}</div>
  </div>`;
  ov.classList.add('show');
  try{ tg?.HapticFeedback?.impactOccurred?.('heavy'); }catch(e){}

  // Етап 2: вибух → нагорода
  setTimeout(()=>{
    const confetti=Array.from({length:Math.round(16*drama)},(_,i)=>{
      const ang=Math.random()*360,dist=70+Math.random()*110,dur=0.7+Math.random()*0.7;
      const clr=['#ffd166','#c98bff','#5cb8ff','#ff8a97','#9fe8a0'][i%5];
      return `<span class="cf" style="background:${clr};--tx:${Math.cos(ang)*dist}px;--ty:${Math.sin(ang)*dist}px;animation-duration:${dur}s"></span>`;
    }).join('');
    ov.innerHTML=`<div class="go-box" style="text-align:center;position:relative;overflow:visible">
      <div class="chest-rays" style="--rc:${rarC}"></div>
      <div class="chest-confetti">${confetti}</div>
      <div class="chest-reveal">${icon}</div>
      <div class="go-title" style="margin-top:8px">${rar?(RARITY_UI[rar].label+'!'):'Нагорода!'}</div>
      <div style="font-size:16px;color:${rarC};font-family:'Rubik',sans-serif;margin:8px 0;font-weight:800">${rewardText(gained)}</div>
      ${gained.skin?'<div style="font-size:10px;color:var(--text3);margin-bottom:6px">Одягни в Колекції — його побачать усі за столом</div>':''}
      <button class="btn-gold" style="max-width:100%;padding:10px;margin-top:6px" onclick="document.getElementById('chestRewardOverlay').classList.remove('show')">Забрати</button>
    </div>`;
    sfx('win');
    try{ tg?.HapticFeedback?.notificationOccurred?.('success'); }catch(e){}
    if(gained.coins)floatCoin(gained.coins,window.innerWidth/2,window.innerHeight/3);
  },900*drama);
}

// ── Колекція: сорочки та скіни конкретних карт ────────────────────
const RARITY_UI={
  common:{label:'Звичайний',color:'#9fb4c8'},
  rare:  {label:'Рідкісний', color:'#5cb8ff'},
  epic:  {label:'Епічний',   color:'#c98bff'},
};
function rarityBadge(s){
  const r=s.rarity&&RARITY_UI[s.rarity];
  return r?`<span style="color:${r.color};font-weight:700">${r.label}</span> · `:'';
}
// Стартові скіни (є у всіх) — на ринок не виставиш
const STARTER_BACKS_CL=['violet','navy','gold','crimson'];
const STARTER_CARDS_CL=['AS_royal','QH_rose','JC_joker'];
function renderCollection(){
  const row=$('backSkinsRow');
  if(row){
    row.innerHTML='';
    const owned=(myWallet&&myWallet.ownedBackSkins)||['violet'];
    const equipped=(myWallet&&myWallet.backSkin)||'violet';
    for(const [id,s] of Object.entries(BACK_SKINS)){
      const has=owned.includes(id);
      const forSale=!has&&s.stars>0;
      const d=document.createElement('div');
      d.className='back-skin'+(id===equipped?' equipped':'')+(has?'':' locked');
      const bg=s.img?`url('${s.img}') center/cover`:s.css;
      const sellableB=has&&!STARTER_BACKS_CL.includes(id);
      d.innerHTML=`<div class="bs-card" style="background:${bg};position:relative">${sellableB?'<div class="bs-sell">🛒</div>':''}</div><div class="bs-name">${s.name}</div>`
        +(forSale?`<div class="bs-name" style="color:var(--gold);font-weight:800">${s.stars} ⭐</div>`:'');
      d.onclick=()=>{
        if(has){ equipSkin('back',null,id); return; }
        if(forSale){ buySkin('back',id,s); return; }
        showToast('Ця сорочка випадає зі скринь 🎁',2200);
      };
      const sb=d.querySelector('.bs-sell');
      if(sb)sb.onclick=(e)=>{e.stopPropagation();openSellModal('back',id,s);};
      row.appendChild(d);
    }
  }
  const list=$('cardSkinsList');
  if(list){
    list.innerHTML='';
    const ownedC=(myWallet&&myWallet.ownedCardSkins)||[];
    const equippedMap=(myWallet&&myWallet.cardSkins)||{};

    // один рядок скіна (перевикористовується і в списку, і всередині пака)
    const buildRow=(id,s)=>{
      const has=ownedC.includes(id);
      const forSale=!has&&s.stars>0;
      const isOn=equippedMap[s.card]===id;
      const red=SUIT_RED[s.card.slice(-1)];
      const prev=s.img
        ?`background:url('${s.img}') center/cover`
        :`background:${s.bg};color:${s.color}`;
      const d=document.createElement('div');
      d.className='card-skin-row';
      const sellable=has&&!STARTER_CARDS_CL.includes(id);
      d.innerHTML=`
        <div class="cs-preview" style="${prev}">${s.img?'':`<span style="font-size:10px">${s.card}</span><span style="font-size:20px">${s.emoji}</span>`}</div>
        <div class="cs-info">
          <div class="cs-name">${s.name}</div>
          <div class="cs-sub">${rarityBadge(s)}Карта: <b style="color:${red?'#ff8a97':'var(--text2)'}">${s.card}</b> · бачать усі за столом</div>
        </div>
        ${sellable?'<div class="cs-sell" title="Продати на ринку">🛒</div>':''}
        <div class="cs-btn ${isOn?'on':''}" ${forSale?'style="background:linear-gradient(135deg,#ffd166,#c9a227);color:#241a00;font-weight:800"':''}>
          ${has?(isOn?'✓ Одягнуто':'Одягнути'):(forSale?`${s.stars} ⭐`:'🔒 Зі скрині')}</div>`;
      d.querySelector('.cs-btn').onclick=()=>{
        if(has){ equipSkin('card',s.card,isOn?null:id); return; } // повторний тап — зняти
        if(forSale){ buySkin('card',id,s); return; }
        showToast('Цей скін випадає зі скринь 🎁',2200);
      };
      const sellBtn=d.querySelector('.cs-sell');
      if(sellBtn)sellBtn.onclick=(e)=>{e.stopPropagation();openSellModal('card',id,s);};
      return d;
    };

    // Скіни з полем pack — згортаються в один рядок-«пак» (36 карт Роял тощо)
    const packs={};
    for(const [id,s] of Object.entries(CARD_SKINS)){
      if(s.pack){ (packs[s.pack]=packs[s.pack]||[]).push([id,s]); continue; }
      list.appendChild(buildRow(id,s));
    }
    const PACK_META={royal:{name:'Королівська колода',emoji:'👑',desc:'повна колода преміум-арту'}};
    for(const [packId,entries] of Object.entries(packs)){
      const meta=PACK_META[packId]||{name:packId,emoji:'🎴',desc:''};
      const ownedCount=entries.filter(([id])=>ownedC.includes(id)).length;
      const equippedCount=entries.filter(([id,s])=>equippedMap[s.card]===id).length;
      const first=entries[0][1];
      const head=document.createElement('div');
      head.className='card-skin-row r-epic';
      head.style.cursor='pointer';
      head.innerHTML=`
        <div class="cs-preview" style="background:url('${first.img}') center/cover"></div>
        <div class="cs-info">
          <div class="cs-name">${meta.emoji} ${meta.name}</div>
          <div class="cs-sub">Пак · зібрано <b style="color:var(--gold)">${ownedCount}/${entries.length}</b>${equippedCount?` · одягнуто ${equippedCount}`:''} · ${meta.desc}</div>
        </div>
        <div class="cs-btn" id="packToggle_${packId}">▸ Відкрити</div>`;
      const body=document.createElement('div');
      body.style.cssText='display:none;margin:2px 0 6px 12px;border-left:2px solid var(--gold-dim);padding-left:8px';
      for(const [id,s] of entries)body.appendChild(buildRow(id,s));
      // одягнути/зняти ВСІ наявні карти пака одним тапом (довге натискання = відкрити)
      head.onclick=()=>{
        const open=body.style.display==='none';
        body.style.display=open?'block':'none';
        head.querySelector('.cs-btn').textContent=open?'▾ Згорнути':'▸ Відкрити';
      };
      list.appendChild(head);
      list.appendChild(body);
    }
  }
}

// Покупка скіна за Telegram Stars: сервер створить інвойс → openInvoice
function buySkin(kind,skinId,def){
  if(!socket)return;
  socket.emit('buy_skin',{tgId:getMyTgId(),kind,skinId});
  showToast(`⭐ Рахунок на «${def.name}» (${def.stars} ⭐)...`,2000);
  try{ tg?.HapticFeedback?.impactOccurred?.('light'); }catch(e){}
}

// ══ КОЛЕКЦІЇ: набори скінів з прогресом і бандлом за ⭐ ══════════════
let collectionsData=null;
function renderCollections(){
  const row=$('collectionsRow');
  if(!row||!collectionsData)return;
  row.innerHTML='';
  for(const c of collectionsData){
    const done=c.owned===c.total;
    const r=RARITY_UI[c.rarity]||RARITY_UI.common;
    const d=document.createElement('div');
    d.className=`coll-card r-${c.rarity}`;
    // міні-прев'ю перших 4 предметів
    const minis=c.items.slice(0,4).map(it=>{
      const bg=it.img?`url('${it.img}') center/cover`:(it.css||it.bg||'#333');
      return `<div class="coll-mini" style="background:${bg};${it.owned?'':'filter:grayscale(1) brightness(0.5)'}">${it.img||!it.emoji?'':`<span>${it.emoji}</span>`}</div>`;
    }).join('');
    d.innerHTML=`
      <div class="coll-head">
        <div class="coll-emoji">${c.emoji}</div>
        <div style="flex:1">
          <div class="coll-name" style="color:${c.color}">${c.name}</div>
          <div class="coll-rarity" style="color:${r.color}">${r.label} · ${c.owned}/${c.total}</div>
        </div>
        ${done
          ?'<div class="coll-done">✓ Зібрано</div>'
          :`<div class="coll-buy" onclick="buyCollection('${c.id}','${c.name}',${c.priceStars})">${c.priceStars} ⭐</div>`}
      </div>
      <div class="coll-minis">${minis}${c.total>4?`<div class="coll-more">+${c.total-4}</div>`:''}</div>
      <div class="coll-progress"><div class="coll-progress-fill" style="width:${Math.round(c.owned/c.total*100)}%;background:${c.color}"></div></div>
      <div class="coll-desc">${c.desc}</div>`;
    row.appendChild(d);
  }
}
function buyCollection(collId,name,stars){
  if(!socket)return;
  socket.emit('buy_collection',{tgId:getMyTgId(),collId});
  showToast(`⭐ Рахунок на колекцію «${name}» (${stars} ⭐)...`,2000);
  try{ tg?.HapticFeedback?.impactOccurred?.('medium'); }catch(e){}
}

// ══ РИНОК: лоти гравців ══════════════════════════════════════════════
let marketData=null;
function renderMarket(){
  const list=$('marketList');
  if(!list)return;
  const fee=$('marketFeeNote'); if(fee&&marketData)fee.textContent=`комісія ${marketData.fee}%`;
  list.innerHTML='';
  const items=(marketData&&marketData.listings)||[];
  if(!items.length){
    list.innerHTML='<div style="font-size:11px;color:var(--text3);text-align:center;padding:14px;border:1px dashed var(--border2);border-radius:12px">Ринок порожній. Вистав щось першим — і забирай монети інших гравців!</div>';
    return;
  }
  const myId=String(getMyTgId());
  for(const l of items){
    const d=l.def||{name:l.skinId};
    const mine=String(l.seller)===myId;
    const cur=l.price.coins?'💰':'💎';
    const amount=l.price.coins||l.price.gems;
    const prev=d.img?`background:url('${d.img}') center/cover`
      :(d.css?`background:${d.css}`:`background:${d.bg||'#333'};color:${d.color||'#fff'}`);
    const r=d.rarity&&RARITY_UI[d.rarity];
    const row=document.createElement('div');
    row.className='card-skin-row market-row'+(d.rarity?` r-${d.rarity}`:'');
    row.innerHTML=`
      <div class="cs-preview" style="${prev}">${d.img?'':(d.emoji?`<span style="font-size:20px">${d.emoji}</span>`:'')}${d.card?`<span style="font-size:9px">${d.card}</span>`:''}</div>
      <div class="cs-info">
        <div class="cs-name">${d.name||l.skinId}</div>
        <div class="cs-sub">${r?`<span style="color:${r.color};font-weight:700">${r.label}</span> · `:''}${l.kind==='back'?'Сорочка':'Карта '+(d.card||'')} · від ${mine?'тебе':l.sellerName}</div>
      </div>
      <div class="cs-btn ${mine?'':'on'}">${mine?'✖ Зняти':`${amount} ${cur}`}</div>`;
    row.querySelector('.cs-btn').onclick=()=>{
      if(mine){ socket.emit('market_cancel',{tgId:getMyTgId(),listingId:l.id}); return; }
      socket.emit('market_buy',{tgId:getMyTgId(),listingId:l.id});
    };
    list.appendChild(row);
  }
}

// ══ БАНК: гемы за ⭐, обмін 💎→💰, скриня за ⭐ ═══════════════════════
let bankData=null;
function renderBank(){
  const packsEl=$('bankPacks');
  if(packsEl){
    packsEl.innerHTML='';
    for(const p of (bankData&&bankData.packs)||[]){
      const icon=p.reward.gems?'💎':p.reward.chest?'👑':'💰';
      const d=document.createElement('div');
      d.className='card-skin-row';
      d.innerHTML=`
        <div class="cs-preview" style="background:linear-gradient(135deg,#1f2b4d,#141d33);font-size:22px">${icon}</div>
        <div class="cs-info"><div class="cs-name">${p.name}</div><div class="cs-sub">${p.desc}</div></div>
        <div class="cs-btn" style="background:linear-gradient(135deg,#ffd166,#c9a227);color:#241a00;font-weight:800">${p.stars} ⭐</div>`;
      d.querySelector('.cs-btn').onclick=()=>{
        socket.emit('buy_pack',{tgId:getMyTgId(),packId:p.id});
        showToast(`⭐ Рахунок: ${p.name} (${p.stars} ⭐)...`,2000);
      };
      packsEl.appendChild(d);
    }
  }
  const exEl=$('bankExchange');
  if(exEl){
    exEl.innerHTML='';
    for(const x of (economyData&&economyData.exchangePacks)||[]){
      const can=(myGems||0)>=x.gems;
      const d=document.createElement('div');
      d.className='card-skin-row';
      d.innerHTML=`
        <div class="cs-preview" style="background:linear-gradient(135deg,#123a2b,#0b241c);font-size:18px">🔁</div>
        <div class="cs-info"><div class="cs-name">${x.gems} 💎 → ${x.coins} 💰</div><div class="cs-sub">курс ${Math.round(x.coins/x.gems)} монет за гем</div></div>
        <div class="cs-btn ${can?'on':''}" ${can?'':'style="opacity:.5"'}>Обміняти</div>`;
      d.querySelector('.cs-btn').onclick=()=>{
        if(!can){showToast('Недостатньо 💎 — купи пакет вище або відкривай скрині',2500);return;}
        socket.emit('exchange_gems',{tgId:getMyTgId(),packId:x.id});
      };
      exEl.appendChild(d);
    }
  }
}

// ── Продаж свого скіна: модалка з ціною ───────────────────────────
let sellCtx=null; // {kind, skinId, def}
function openSellModal(kind,skinId,def){
  sellCtx={kind,skinId,def};
  const prev=def.img?`background:url('${def.img}') center/cover`
    :(def.css?`background:${def.css}`:`background:${def.bg||'#333'};color:${def.color||'#fff'}`);
  $('sellPreview').innerHTML=`<div class="cs-preview" style="${prev};width:52px;height:72px">${def.img?'':(def.emoji?`<span style="font-size:24px">${def.emoji}</span>`:'')}</div>`;
  $('sellName').textContent=def.name+(def.card?` (${def.card})`:'');
  $('sellPrice').value='';
  sellSetCur('coins');
  $('sellOverlay').classList.add('show');
}
function sellSetCur(cur){
  document.querySelectorAll('#sellCurRow .toggle-opt').forEach(o=>o.classList.toggle('active',o.dataset.cur===cur));
}
function confirmSell(){
  if(!sellCtx||!socket)return;
  const cur=document.querySelector('#sellCurRow .toggle-opt.active')?.dataset.cur||'coins';
  const amount=Math.floor(+$('sellPrice').value||0);
  if(amount<1){showToast('Вкажи ціну',2000);return;}
  socket.emit('market_list',{tgId:getMyTgId(),kind:sellCtx.kind,skinId:sellCtx.skinId,price:{[cur]:amount}});
  $('sellOverlay').classList.remove('show');
}

function equipSkin(kind,cardKey,skinId){
  if(!socket)return;
  socket.emit('equip_skin',{tgId:getMyTgId(),kind,cardKey,skinId});
  try{ tg?.HapticFeedback?.selectionChanged?.(); }catch(e){}
}
