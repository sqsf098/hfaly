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
  if(!params.get('notc')) initTonConnect(); // ?notc — пропустити TON (dev/скриншоти)
  connectSocket();

  const room=params.get('room');
  if(room){
    const name=params.get('name')||tg?.initDataUnsafe?.user?.first_name||myName||'Гравець';
    if(name)myName=name;
    setTimeout(()=>socket.emit('join_room',{roomId:room.toUpperCase(),name:getMyName(),tgId:getMyTgId()}),700);
  } else {
    setTimeout(()=>{socket.emit('get_wallet',{tgId:getMyTgId()});socket.emit('get_rooms');},500);
  }
});

