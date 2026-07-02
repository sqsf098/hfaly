// ─── Оригінальна навігація: веер карт + перемикач тем ───
const FAN_SECTIONS=[
  {id:'home',     icon:'play',   label:'Грати',    suit:'♠'},
  {id:'rooms',    icon:'door',   label:'Кімнати',  suit:'♦'},
  {id:'decks',    icon:'layers', label:'Колекція', suit:'♥'},
  {id:'profile',  icon:'user',   label:'Профіль',  suit:'♣'},
  {id:'settings', icon:'gear',   label:'Ще',       suit:'★'},
];
let fanActive=0;

function buildFanNav(){
  const wrap=$('fanWrap'); if(!wrap) return;
  wrap.innerHTML='';
  FAN_SECTIONS.forEach((s,i)=>{
    const c=document.createElement('div');
    c.className='fan-card'; c.dataset.i=i;
    c.innerHTML=`<span class="fc-suit">${s.suit}</span>
      <span class="fc-icon">${iconSvg(s.icon)}</span>
      <span class="fc-label">${s.label}</span>
      <span class="fc-suit br">${s.suit}</span>`;
    c.onclick=()=>fanSelect(i);
    wrap.appendChild(c);
  });
  layoutFan();
  initFanSwipe();
}

function layoutFan(){
  document.querySelectorAll('#fanWrap .fan-card').forEach(c=>{
    c.classList.toggle('active',+c.dataset.i===fanActive);
    c.style.transform=''; c.style.opacity=''; c.style.zIndex='';
  });
  const t=$('fanTitle'); if(t) t.textContent=FAN_SECTIONS[fanActive].label;
}

// Тактильний відгук Telegram (покращує "відчуття" на телефоні)
function fanHaptic(){ sfx('click'); vibrate('selection'); }

function fanSelect(i){
  const s=FAN_SECTIONS[i];
  fanHaptic();
  fanActive=i; layoutFan();
  switchTab(s.id);
}

// Свайп по веру → сусідня карта (модалку свайпом лише підсвічуємо, не відкриваємо)
function navigateFan(dir){
  const ni=fanActive+dir;
  if(ni<0||ni>=FAN_SECTIONS.length) return;
  fanActive=ni; layoutFan(); fanHaptic();
  switchTab(FAN_SECTIONS[ni].id);
}
function initFanSwipe(){
  const nav=$('fanNav'); if(!nav||nav._swipe) return; nav._swipe=true;
  let x0=null;
  nav.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;},{passive:true});
  nav.addEventListener('touchend',e=>{
    if(x0==null)return; const dx=e.changedTouches[0].clientX-x0; x0=null;
    if(Math.abs(dx)>40) navigateFan(dx<0?1:-1);
  },{passive:true});
  // миша (для десктоп-прев'ю)
  let mx=null;
  nav.addEventListener('mousedown',e=>{mx=e.clientX;});
  window.addEventListener('mouseup',e=>{ if(mx==null)return; const dx=e.clientX-mx; mx=null; if(Math.abs(dx)>40) navigateFan(dx<0?1:-1); });
}

// Синхронізувати активну карту веера, коли екран змінили іншим шляхом
function syncFan(tab){
  const i=FAN_SECTIONS.findIndex(s=>s.id===tab);
  if(i>=0 && i!==fanActive){ fanActive=i; layoutFan(); }
}

// ── Перемикач тем ─────────────────────────────────────────────────
function applyTheme(name){
  const b=document.body;
  if(name==='arcade'){ b.classList.remove('theme-fan','fan-nav'); name='arcade'; }
  else { b.classList.add('theme-fan','fan-nav'); name='fan'; }
  localStorage.setItem('hfaly_theme',name);
  document.querySelectorAll('#themeRow .toggle-opt').forEach(o=>o.classList.toggle('active',o.dataset.theme===name));
  if(name==='fan') buildFanNav();
}

function initTheme(){
  const saved=localStorage.getItem('hfaly_theme')||'fan';
  applyTheme(saved);
}
