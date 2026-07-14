// ─── Соціальне: правила гри, чат у кімнаті, кланові дрібниці ───

// ══ ПРАВИЛА ══════════════════════════════════════════════════════════
const RULES={
  hfaly:{
    title:'🃏 хФали',
    body:`<b>Гравці:</b> 4, команди 2 vs 2 (навпроти = партнер).<br>
<b>Колода:</b> 36 карт, кожному по 9.<br><br>
<b>Хвалящий</b> — обирає козир з перших 3 карт або «на останню» (9-а карта відкривається і задає козир).<br><br>
<b>Старшинство козирів:</b><br>
1. Козирна 6 («мамка») — найсильніша!<br>
2. Валети: J♣ &gt; J♠ &gt; J♥ &gt; J♦<br>
3. Далі: A &gt; K &gt; Q &gt; 10 &gt; 9 &gt; 8 &gt; 7<br><br>
<b>Хід:</b> треба класти масть; нема масті — можна козир або будь-яку. Найстарша карта бере дачку (взятку).<br><br>
<b>Очки хвалящого за раунд:</b><br>
· ≥5 дачок → +1 команді<br>
· &lt;5 → −6 · лише 1 → −12 · 0 → −24<br><br>
<b>Гра до 24.</b> Команда, що набрала 24 штрафних, програє. Переможці ділять банк 💰.`,
  },
  khrest:{
    title:'✠ Хрестовець',
    body:`<b>Гравці:</b> 3, кожен за себе.<br>
<b>Роздача:</b> по 12 карт, кожен <b>скидає 3</b> у закритий відбій.<br><br>
<b>Хвалящий</b> — той, кому прийшов валет треф (J♣). До кінця скидання — таємниця.<br><br>
<b>Норми дачок:</b> хвалящий — 5, решта — по 2.<br>
Недобір карається штрафом (+6 за кожну недобрану до норми — особисто).<br><br>
<b>Старшинство:</b> як у хФали (мамка &gt; валети &gt; A K Q 10 9 8 7).<br><br>
<b>Гра до 24 штрафних.</b> Хто набрав — програв, двоє інших ділять банк.`,
  },
  durak:{
    title:'🎴 Дурак підкидний',
    body:`<b>Гравці:</b> 2-4. <b>Колода:</b> 36 карт, кожному по 6.<br>
<b>Козир:</b> нижня карта колоди (відкрита).<br><br>
<b>Атака:</b> будь-яка карта. <b>Підкидати</b> можна карти тих номіналів, що вже на столі (всі гравці, крім захисника). Максимум 6 карт і не більше, ніж у захисника в руці.<br><br>
<b>Захист:</b> бий старшою картою тієї ж масті або козирем. Побив усе → «<b>Бито</b>», карти йдуть у відбій, захисник атакує наступного.<br><br>
<b>Не можеш побити → «Взяти»</b>: забираєш усі карти зі столу, хід переходить через тебе.<br><br>
<b>Добір:</b> після кожного кону всі добирають до 6 (атакуючий перший, захисник останній).<br><br>
<b>Кінець:</b> колода порожня, хто лишився з картами останній — <b>дурак</b> 🤡. Решта ділять банк.`,
  },
};
function openRules(mode){
  const r=RULES[mode]||RULES.hfaly;
  $('rulesTitle').textContent=r.title;
  $('rulesBody').innerHTML=r.body;
  document.querySelectorAll('#rulesTabs .toggle-opt').forEach(o=>o.classList.toggle('active',o.dataset.mode===mode));
  $('rulesOverlay').classList.add('show');
  try{ tg?.HapticFeedback?.selectionChanged?.(); }catch(e){}
}

// ══ ЧАТ У КІМНАТІ ════════════════════════════════════════════════════
let chatOpen=false,chatUnread=0;
function toggleChat(){
  chatOpen=!chatOpen;
  $('chatPanel').classList.toggle('open',chatOpen);
  if(chatOpen){ chatUnread=0; updateChatBadge(); $('chatMessages').scrollTop=1e9; }
}
function updateChatBadge(){
  const b=$('chatBadge');
  if(!b)return;
  b.textContent=chatUnread>0?chatUnread:'';
  b.style.display=chatUnread>0?'flex':'none';
}
function sendChat(text){
  if(!socket||!myRoomId)return;
  socket.emit('chat_msg',{tgId:getMyTgId(),text});
  try{ tg?.HapticFeedback?.selectionChanged?.(); }catch(e){}
}
function sendChatInput(){
  const inp=$('chatInput');
  const t=(inp.value||'').trim();
  if(!t)return;
  inp.value='';
  sendChat(t);
}
function onChatMsg({name,text,playerIndex,ts}){
  const box=$('chatMessages');
  if(!box)return;
  const mine=playerIndex===myIndex;
  const d=document.createElement('div');
  d.className='chat-msg'+(mine?' mine':'');
  d.innerHTML=`<span class="chat-who">${mine?'Ти':escapeHtml(name||'Гравець')}</span>${escapeHtml(text)}`;
  box.appendChild(d);
  while(box.children.length>60)box.removeChild(box.firstChild);
  box.scrollTop=1e9;
  if(!chatOpen&&!mine){ chatUnread++; updateChatBadge(); sfx('tap'); }
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// ══ КЛАНИ ════════════════════════════════════════════════════════════
let clanData=null;
function requestClan(){ if(socket)socket.emit('clan_get',{tgId:getMyTgId()}); }
function renderClan(){
  const box=$('clanBox'); if(!box)return;
  const d=clanData;
  if(!d){box.innerHTML='<div class="ui-card" style="text-align:center;font-size:11px;color:var(--text3)">Завантаження…</div>';return;}
  if(!d.my){
    box.innerHTML=`
      <div class="ui-card">
        <div class="input-group"><label class="input-label">Створити клан (${d.createCost} 💰)</label>
          <input class="text-input" id="clanNameInput" placeholder="Назва клану" maxlength="24"></div>
        <button class="btn-gold" style="margin-bottom:10px" onclick="clanCreate()">🛡 Створити</button>
        <div class="input-group"><label class="input-label">Або вступити за тегом</label>
          <input class="text-input code" id="clanTagInput" placeholder="ТЕГ" maxlength="5"></div>
        <button class="btn-outline" style="max-width:100%;padding:10px" onclick="clanJoin()">Вступити</button>
      </div>`;
    return;
  }
  const c=d.my;
  const members=c.members.map(m=>
    `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border2)">
      <span>${m.isOwner?'👑 ':''}${escapeHtml(m.name)}</span><span style="color:var(--gold)">${m.wins} 🏆</span></div>`).join('');
  const chat=(c.chat||[]).map(m=>
    `<div class="chat-msg${String(m.tgId)===String(getMyTgId())?' mine':''}"><span class="chat-who">${escapeHtml(m.name)}</span>${escapeHtml(m.text)}</div>`).join('');
  box.innerHTML=`
    <div class="ui-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="font-size:30px">${c.emoji}</div>
        <div style="flex:1">
          <div style="font-family:'Rubik',sans-serif;font-weight:800;color:var(--gold)">[${c.tag}] ${escapeHtml(c.name)}</div>
          <div style="font-size:10px;color:var(--text3)">${c.count}/${c.max} учасників · ${c.wins} 🏆 перемог</div>
        </div>
        <div onclick="clanLeave()" style="font-size:10px;color:var(--red,#e74c3c);border:1px solid rgba(231,76,60,0.4);padding:5px 8px;border-radius:8px;cursor:pointer">Вийти</div>
      </div>
      <div style="max-height:120px;overflow-y:auto;font-size:11px;color:var(--text2);margin-bottom:10px">${members}</div>
      <div class="input-label">💬 Чат клану</div>
      <div id="clanChatBox" style="max-height:150px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:10px;padding:8px;margin:6px 0">${chat||'<div style="font-size:10px;color:var(--text3);text-align:center">Тиша… напиши першим!</div>'}</div>
      <div style="display:flex;gap:6px">
        <input class="text-input" id="clanChatInput" placeholder="Повідомлення..." maxlength="160" style="flex:1" onkeydown="if(event.key==='Enter')clanSend()">
        <button class="btn-gold" style="max-width:60px;padding:10px" onclick="clanSend()">➤</button>
      </div>
    </div>`;
  const cb=$('clanChatBox'); if(cb)cb.scrollTop=1e9;
  const top=$('clanTop');
  if(top&&d.top){
    top.innerHTML=d.top.length?d.top.map((t,i)=>
      `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border2)">
        <span>${i+1}. ${t.emoji} [${t.tag}] ${escapeHtml(t.name)}</span>
        <span style="color:var(--gold)">${t.wins} 🏆 · ${t.count}👥</span></div>`).join('')
      :'Ще немає кланів — створи перший!';
  }
}
function clanCreate(){
  const name=$('clanNameInput')?.value?.trim();
  if(!name||name.length<3){showToast('Назва: мінімум 3 символи',2000);return;}
  socket.emit('clan_create',{tgId:getMyTgId(),name,emoji:'🛡'});
}
function clanJoin(){
  const tag=$('clanTagInput')?.value?.trim();
  if(!tag){showToast('Введи тег клану',2000);return;}
  socket.emit('clan_join',{tgId:getMyTgId(),tag});
}
function clanLeave(){ socket.emit('clan_leave',{tgId:getMyTgId()}); }
function clanSend(){
  const inp=$('clanChatInput');
  const t=(inp?.value||'').trim();
  if(!t)return;
  inp.value='';
  socket.emit('clan_chat',{tgId:getMyTgId(),text:t});
}
function onClanMsg(m){
  if(clanData&&clanData.my){ clanData.my.chat=clanData.my.chat||[]; clanData.my.chat.push(m); renderClan(); }
}

// ══ 🏅 Топ рекрутерів тижня ═══════════════════════════════════════════
function renderRefTop(d){
  const box=$('refTopBox'); if(!box)return;
  const prizes=(d.prizes||[]).map((p,i)=>`${['🥇','🥈','🥉'][i]} ${p}💎`).join(' · ');
  const rows=(d.top||[]).map(t=>
    `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border2)">
      <span>${t.place<=3?['🥇','🥈','🥉'][t.place-1]:t.place+'.'} ${escapeHtml(t.name)}</span>
      <span style="color:var(--gold)">${t.count} друзів · ${t.earned}💎 всього</span></div>`).join('');
  box.innerHTML=`<div style="font-size:10px;color:var(--text3);margin-bottom:6px">Тиждень ${d.week||''} · призи: ${prizes} · зараховується, коли друг зіграв першу гру</div>`
    +(rows||'<div style="text-align:center;padding:8px">Ще нікого — приведи друга і будь першим! 🚀</div>')
    +`<button class="btn-gold" style="max-width:100%;padding:9px;margin-top:8px;font-size:12px" onclick="shareRef()">📨 Запросити друга</button>`;
}
