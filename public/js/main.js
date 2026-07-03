// ─── Старт застосунку ───
window.addEventListener('DOMContentLoaded',()=>{
  currentDeck=localStorage.getItem('hfaly_deck')||'classic';
  document.querySelectorAll('.deck-card').forEach(d=>d.classList.toggle('selected',d.dataset.deck===currentDeck));
  loadProfile();
  updateCoinsUI();
  initParticles();
  mountIcons(); // SVG-іконки в усі [data-icon]
  initAudio();  // звук/музика після першого дотику
  initTheme();
  // Динамічний каталог скінів (адмін додає нові без оновлення коду)
  fetch('/api/skins').then(r=>r.json()).then(s=>{
    Object.assign(BACK_SKINS,s.backs||{});
    Object.assign(CARD_SKINS,s.cards||{});
  }).catch(()=>{});
  if(!params.get('notc')) initTonConnect(); // ?notc — пропустити TON (dev/скриншоти)
  connectSocket();

  // Кімната з deep-link (t.me/<бот>?startapp=<код>) або з ?room= (браузер)
  const room=params.get('room')||(tg&&tg.initDataUnsafe&&tg.initDataUnsafe.start_param)||null;
  if(room){
    const name=params.get('name')||tg?.initDataUnsafe?.user?.first_name||myName||'Гравець';
    if(name)myName=name;
    setTimeout(()=>socket.emit('join_room',{roomId:room.toUpperCase(),name:getMyName(),tgId:getMyTgId()}),700);
  } else {
    setTimeout(()=>{socket.emit('get_wallet',{tgId:getMyTgId()});socket.emit('get_rooms');},500);
  }
});

