// ─── Звук: ефекти карт + фонова музика + вібрація ───
// Все синтезується WebAudio — жодних аудіофайлів, працює миттєво й офлайн.
let AC=null, musicNodes=null, musicTimer=null;
let soundOn = localStorage.getItem('hfaly_sound') !== '0';
let musicOn = localStorage.getItem('hfaly_music') !== '0';

function ac(){
  if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } }
  if(AC.state==='suspended') AC.resume();
  return AC;
}

// ── Вібрація (Telegram haptic → navigator.vibrate fallback) ───────
function vibrate(kind){
  try{
    const h=tg&&tg.HapticFeedback;
    if(h){
      if(kind==='light'||kind==='medium'||kind==='heavy') h.impactOccurred(kind);
      else if(kind==='success'||kind==='error'||kind==='warning') h.notificationOccurred(kind);
      else h.selectionChanged();
      return;
    }
  }catch(e){}
  try{ navigator.vibrate&&navigator.vibrate(kind==='heavy'?40:kind==='medium'?25:12); }catch(e){}
}

// ── Ефекти ────────────────────────────────────────────────────────
function tone(ctx,{f=440,t=0,dur=0.15,type='sine',vol=0.2,slide=0}){
  const o=ctx.createOscillator(),g=ctx.createGain();
  o.type=type;o.frequency.setValueAtTime(f,ctx.currentTime+t);
  if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(40,f+slide),ctx.currentTime+t+dur);
  g.gain.setValueAtTime(0,ctx.currentTime+t);
  g.gain.linearRampToValueAtTime(vol,ctx.currentTime+t+0.012);
  g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+dur+0.05);
}
// «Шурхіт» карти — короткий фільтрований шум
function swish(ctx,{t=0,dur=0.09,vol=0.18,freq=2600}){
  const n=ctx.createBufferSource(),g=ctx.createGain(),flt=ctx.createBiquadFilter();
  const buf=ctx.createBuffer(1,ctx.sampleRate*dur,ctx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);
  n.buffer=buf;flt.type='bandpass';flt.frequency.value=freq;flt.Q.value=0.8;
  g.gain.setValueAtTime(vol,ctx.currentTime+t);
  n.connect(flt).connect(g).connect(ctx.destination);
  n.start(ctx.currentTime+t);
}

const SFX={
  click:  c=>tone(c,{f:660,dur:0.06,type:'triangle',vol:0.12}),
  card:   c=>{swish(c,{});tone(c,{f:190,dur:0.05,type:'sine',vol:0.1,t:0.02});},
  deal:   c=>{for(let i=0;i<4;i++)swish(c,{t:i*0.09,vol:0.13,freq:2200+i*250});},
  trick:  c=>{swish(c,{dur:0.14,freq:1800});tone(c,{f:392,t:0.05,dur:0.12,type:'triangle',vol:0.14});tone(c,{f:523,t:0.13,dur:0.16,type:'triangle',vol:0.14});},
  coin:   c=>{tone(c,{f:880,dur:0.09,type:'square',vol:0.08});tone(c,{f:1320,t:0.07,dur:0.14,type:'square',vol:0.07});},
  win:    c=>[523,659,784,1046].forEach((f,i)=>tone(c,{f,t:i*0.12,dur:0.25,type:'triangle',vol:0.16})),
  lose:   c=>[392,330,262].forEach((f,i)=>tone(c,{f,t:i*0.16,dur:0.3,type:'sine',vol:0.14})),
  trump:  c=>{tone(c,{f:587,dur:0.18,type:'triangle',vol:0.15});tone(c,{f:880,t:0.1,dur:0.22,type:'triangle',vol:0.13});},
};

function sfx(name){
  if(!soundOn)return;
  const ctx=ac(); if(!ctx)return;
  const fn=SFX[name]; if(fn)fn(ctx);
}

// ── Фонова музика: тихий ембіент-пад (акорди міняються самі) ──────
const MUSIC_CHORDS=[[220,277,330],[196,247,294],[175,220,262],[196,247,294]]; // Am F C(ish) G-подібне коло
function startMusic(){
  if(!musicOn||musicNodes)return;
  const ctx=ac(); if(!ctx)return;
  const master=ctx.createGain(); master.gain.value=0; master.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.045,ctx.currentTime+2); // дуже тихо, повзучий вхід
  const oscs=[0,1,2].map(()=>{ const o=ctx.createOscillator(),g=ctx.createGain();
    o.type='sine'; g.gain.value=0.33; o.connect(g).connect(master); o.start(); return {o,g}; });
  let step=0;
  const applyChord=()=>{ const ch=MUSIC_CHORDS[step%MUSIC_CHORDS.length]; step++;
    oscs.forEach((n,i)=>{ n.o.frequency.exponentialRampToValueAtTime(ch[i],ctx.currentTime+1.2); }); };
  applyChord();
  musicTimer=setInterval(applyChord,5200);
  musicNodes={master,oscs};
}
function stopMusic(){
  if(musicTimer){clearInterval(musicTimer);musicTimer=null;}
  if(musicNodes){ try{ musicNodes.master.gain.linearRampToValueAtTime(0,AC.currentTime+0.6);
    const n=musicNodes; setTimeout(()=>n.oscs.forEach(x=>x.o.stop()),800); }catch(e){} musicNodes=null; }
}

// ── Налаштування ──────────────────────────────────────────────────
function toggleSound(el){
  soundOn=!soundOn; localStorage.setItem('hfaly_sound',soundOn?'1':'0');
  if(el)el.classList.toggle('on',soundOn);
  if(soundOn)sfx('click');
}
function toggleMusic(el){
  musicOn=!musicOn; localStorage.setItem('hfaly_music',musicOn?'1':'0');
  if(el)el.classList.toggle('on',musicOn);
  if(musicOn)startMusic(); else stopMusic();
}

// Автозапуск музики після ПЕРШОГО дотику (політика autoplay браузерів)
function initAudio(){
  const kick=()=>{ ac(); if(musicOn)startMusic(); document.removeEventListener('pointerdown',kick); };
  document.addEventListener('pointerdown',kick,{once:true});
  syncMuteUI(); // перемикачі в налаштуваннях + кнопки 🔊 в грі та меню
}

// ── Швидке вимкнення всього звуку (кнопка в грі та в меню) ────────
function isMuted(){ return !soundOn && !musicOn; }
function toggleMuteAll(){
  const mute=!isMuted(); // якщо хоч щось грає — вимикаємо все
  soundOn=!mute; musicOn=!mute;
  localStorage.setItem('hfaly_sound',soundOn?'1':'0');
  localStorage.setItem('hfaly_music',musicOn?'1':'0');
  if(musicOn)startMusic(); else stopMusic();
  if(soundOn)sfx('click');
  vibrate('selection');
  syncMuteUI();
}
function syncMuteUI(){
  document.querySelectorAll('.mute-btn').forEach(b=>{
    b.textContent=isMuted()?'🔇':'🔊';
    b.classList.toggle('muted',isMuted());
  });
  const s=$('sfxToggle'); if(s)s.classList.toggle('on',soundOn);
  const m=$('musicToggle'); if(m)m.classList.toggle('on',musicOn);
}
