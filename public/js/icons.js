// ─── Єдиний набір лінійних SVG-іконок (замість емодзі) ───
// Емодзі рендеряться по-різному на кожному телефоні й виглядають дешево.
// Тут — один стиль: stroke 1.8, круглі кінці, currentColor (фарбується CSS).
const ICONS = {
  play:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6a.8.8 0 0 0 1.22.68l10.4-6.8a.8.8 0 0 0 0-1.36L9.22 4.52A.8.8 0 0 0 8 5.2z"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6.2" width="10.5" height="14.5" rx="2" transform="rotate(-8 8.25 13.45)"/><rect x="10" y="3.8" width="10.5" height="14.5" rx="2" transform="rotate(7 15.25 11.05)"/></svg>',
  door:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M3 21h18"/><circle cx="15" cy="12.5" r="1" fill="currentColor" stroke="none"/></svg>',
  key:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8.5" r="3.6"/><path d="M10.7 11.2 19.5 20"/><path d="M15.5 16l2.3-2.3"/><path d="M12.7 18.8l2.3-2.3"/></svg>',
  chest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5"/><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M12 11v3.2"/><circle cx="12" cy="15.4" r="1.1" fill="currentColor" stroke="none"/></svg>',
  layers:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3.5" width="12" height="15" rx="2"/><path d="M4.5 7.5V17a3.5 3.5 0 0 0 3.5 3.5h8"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5.2a4 4 0 0 1-8 0z"/><path d="M8 5.5H5.2A2.8 2.8 0 0 0 8 9.2M16 5.5h2.8A2.8 2.8 0 0 1 16 9.2"/><path d="M12 13.2v2.6M8.8 19.5h6.4M10 16h4"/></svg>',
  user:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.3" r="3.6"/><path d="M4.8 20.2c1.1-3.6 4-5.4 7.2-5.4s6.1 1.8 7.2 5.4"/></svg>',
  gear:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.1"/><path d="M12 3.2v2.6M12 18.2v2.6M3.2 12h2.6M18.2 12h2.6M5.8 5.8l1.85 1.85M16.35 16.35l1.85 1.85M18.2 5.8l-1.85 1.85M7.65 16.35L5.8 18.2"/></svg>',
  gift:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="9.5" width="15" height="10.5" rx="2"/><path d="M12 9.5V20M4.5 14h15"/><path d="M12 9.5C8.5 9.5 7.2 7.6 8 6c.9-1.7 4-.4 4 3.5 0-3.9 3.1-5.2 4-3.5.8 1.6-.5 3.5-4 3.5z"/></svg>',
  bolt:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.2 19.5c.9-3.2 3.3-4.8 5.8-4.8s4.9 1.6 5.8 4.8"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.6 14.9c1.7.6 3 1.9 3.6 4"/></svg>',
  spade: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c3.4 3.4 7.5 6.3 7.5 10a4.2 4.2 0 0 1-7 3.1c.2 1.7.8 3.3 2 4.9H9.5c1.2-1.6 1.8-3.2 2-4.9a4.2 4.2 0 0 1-7-3.1c0-3.7 4.1-6.6 7.5-10z"/></svg>',
};

function iconSvg(name){ return ICONS[name]||''; }

// Підставляє SVG в усі елементи з data-icon="name"
function mountIcons(root){
  (root||document).querySelectorAll('[data-icon]').forEach(el=>{
    el.innerHTML=iconSvg(el.dataset.icon);
  });
}
