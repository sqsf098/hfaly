// ─── Клієнт: TON Connect + NFT-колоди ───
let tonConnectUI = null;
let tonData = null;

function initTonConnect(){
  if(tonConnectUI || !window.TON_CONNECT_UI) return;
  try {
    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: location.origin + '/tonconnect-manifest.json',
    });
    // Просимо ton_proof при підключенні (nonce; у проді краще брати з сервера)
    const nonce = 'hfaly_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    tonConnectUI.setConnectRequestParameters({ state:'ready', value:{ tonProof: nonce } });

    tonConnectUI.onStatusChange(wallet=>{
      if(wallet && wallet.account){
        socket.emit('link_wallet',{
          tgId:getMyTgId(),
          address: wallet.account.address,
          publicKey: wallet.account.publicKey,
          proof: wallet.connectItems?.tonProof?.proof || null,
        });
      } else {
        socket.emit('unlink_wallet',{ tgId:getMyTgId() });
      }
    });
  } catch(e){ console.warn('TON init failed', e); }
}

function tonConnectClick(){
  if(!tonConnectUI) initTonConnect();
  if(!tonConnectUI){ showToast('TON Connect недоступний'); return; }
  if(tonData && tonData.address) tonConnectUI.disconnect();
  else tonConnectUI.openModal();
}

function shortAddr(a){ return a && a.length>14 ? a.slice(0,6)+'…'+a.slice(-4) : (a||''); }

function renderTon(){
  if(!tonData) return;
  const badge=$('tonNetBadge'); if(badge) badge.textContent='('+tonData.network+')';
  const addrText=$('tonAddrText'), btn=$('tonConnectBtn');
  if(tonData.address){
    if(addrText) addrText.textContent=shortAddr(tonData.address)+(tonData.verified?' ✓':' (не підтверджено)');
    if(btn) btn.textContent='Відключити';
  } else {
    if(addrText) addrText.textContent='Не підключено';
    if(btn) btn.textContent='Підключити';
  }
  renderNftGrid();
}

function renderNftGrid(){
  const grid=$('nftGrid'); if(!grid||!tonData) return;
  grid.innerHTML='';
  for(const n of tonData.catalog){
    const th=DECK_THEMES[n.deck]||DECK_THEMES.classic;
    const div=document.createElement('div');
    div.className='deck-card'+(n.owned?' selected':'');
    let action;
    if(n.owned) action='<div style="font-size:10px;color:var(--green2,#27ae60);margin-top:4px">✓ Володієш</div>';
    else if(!tonData.collectionConfigured) action='<div style="font-size:9px;color:var(--text3);margin-top:4px">Скоро</div>';
    else action=`<button class="btn-gold" style="max-width:100%;padding:6px;font-size:11px;margin-top:4px" onclick="mintNft('${n.id}')">Мінт ${tonData.mintPriceTon} TON</button>`;
    div.innerHTML=`
      <div class="deck-preview">
        <div class="deck-mini" style="background:${th.bg};color:${th.red};border-color:${th.border}">♥</div>
        <div class="deck-mini" style="background:${th.bg};color:${th.black};border-color:${th.border}">♠</div>
        <div class="deck-mini" style="background:${th.bg};color:${th.red};border-color:${th.border}">♦</div>
      </div>
      <div class="deck-name">${n.emoji} ${n.name}</div>
      <div class="deck-desc">${n.rarity}</div>
      ${action}`;
    if(n.owned) div.onclick=()=>selectDeck(div,n.deck);
    grid.appendChild(div);
  }
}

function mintNft(nftId){
  if(!tonData || !tonData.address){ showToast('Спочатку підключи гаманець TON'); return; }
  if(!tonData.collectionConfigured){ showToast('NFT-колекція ще не налаштована'); return; }
  socket.emit('request_mint',{ tgId:getMyTgId(), nftId });
}

async function onMintTx(res){
  if(!tonConnectUI){ showToast('TON Connect недоступний'); return; }
  try {
    showToast('Підтвердь транзакцію в гаманці…',3000);
    await tonConnectUI.sendTransaction(res.tx);
    showToast('✅ Транзакцію відправлено! Чекаємо підтвердження…',3500);
    setTimeout(()=>socket && socket.emit('sync_nfts',{tgId:getMyTgId()}), 8000);
  } catch(e){
    showToast('Мінт скасовано');
  }
}
