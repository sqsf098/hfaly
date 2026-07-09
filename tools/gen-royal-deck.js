// ─── Генератор «Королівської колоди»: 36 преміум SVG-карт ────────────────
//   node tools/gen-royal-deck.js
//   → public/img/skins/royal/<RANK><S>.svg (36 шт) + _showcase.svg (усі разом)
//   Стиль: глибокий нічний фон, подвійна золота рамка з філігранню,
//   центральний медальйон; ♠♣ — золото, ♥♦ — рубін. Все векторне.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../public/img/skins/royal');
const SUITS = [
  { s: '♠', key: 'S', red: false },
  { s: '♣', key: 'C', red: false },
  { s: '♥', key: 'H', red: true },
  { s: '♦', key: 'D', red: true },
];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const W = 210, H = 300;

// Загальні defs: градієнти золота/рубіна/фону + філігрань кута
const defs = `
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1b1533"/><stop offset="0.55" stop-color="#121a30"/><stop offset="1" stop-color="#0a081c"/>
  </linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffeaa8"/><stop offset="0.45" stop-color="#e3bf6a"/><stop offset="1" stop-color="#9c7420"/>
  </linearGradient>
  <linearGradient id="ruby" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ff9aa4"/><stop offset="0.45" stop-color="#e25563"/><stop offset="1" stop-color="#7e1522"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.42" r="0.62">
    <stop offset="0" stop-color="#2c2450"/><stop offset="1" stop-color="rgba(20,16,40,0)"/>
  </radialGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="rgba(255,255,255,0.09)"/><stop offset="0.4" stop-color="rgba(255,255,255,0)"/>
  </linearGradient>
  <g id="flr">
    <path d="M0 26 Q0 4 22 2 Q10 8 10 16 Q10 22 16 22 Q22 22 22 16 Q30 26 16 30 Q2 33 0 26Z"
      fill="url(#gold)" opacity="0.9"/>
    <circle cx="27" cy="5" r="2.2" fill="url(#gold)"/>
  </g>`;

// Кутова філігрань у 4 кутах (обертанням)
const corners = `
  <use href="#flr" transform="translate(13,13)"/>
  <use href="#flr" transform="translate(${W - 13},13) scale(-1,1)"/>
  <use href="#flr" transform="translate(13,${H - 13}) scale(1,-1)"/>
  <use href="#flr" transform="translate(${W - 13},${H - 13}) scale(-1,-1)"/>`;

const frame = `
  <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="16" fill="url(#bg)" stroke="url(#gold)" stroke-width="2.5"/>
  <rect x="0" y="0" width="${W}" height="${H}" rx="18" fill="none" stroke="#6b5420" stroke-width="1" opacity="0.8"/>
  <rect x="11" y="11" width="${W - 22}" height="${H - 22}" rx="11" fill="none" stroke="url(#gold)" stroke-width="0.8" opacity="0.65"/>
  <ellipse cx="${W / 2}" cy="${H * 0.44}" rx="${W * 0.44}" ry="${H * 0.34}" fill="url(#glow)"/>
  <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="16" fill="url(#sheen)"/>`;

// Корона (K), діадема (Q), схрещені мечі (J), спалах (A), полум'я (6 — «мамка»)
const emblems = {
  K: `<g transform="translate(${W / 2},62)" fill="url(#gold)">
    <path d="M-30 12 L-30 -8 L-16 4 L0 -16 L16 4 L30 -8 L30 12 Q0 20 -30 12Z" stroke="#6b5420" stroke-width="1"/>
    <circle cx="-30" cy="-11" r="3.4"/><circle cx="0" cy="-19" r="3.8"/><circle cx="30" cy="-11" r="3.4"/>
    <rect x="-30" y="13" width="60" height="4.5" rx="2"/></g>`,
  Q: `<g transform="translate(${W / 2},62)" fill="url(#gold)">
    <path d="M-26 10 Q-30 -6 -18 -12 Q-6 -18 0 -8 Q6 -18 18 -12 Q30 -6 26 10 Q0 17 -26 10Z" stroke="#6b5420" stroke-width="1"/>
    <circle cx="0" cy="-14" r="3.2"/><circle cx="-21" cy="-14" r="2.4"/><circle cx="21" cy="-14" r="2.4"/></g>`,
  J: `<g transform="translate(${W / 2},60)" stroke="url(#gold)" stroke-width="4.5" stroke-linecap="round">
    <line x1="-20" y1="-14" x2="20" y2="16"/><line x1="20" y1="-14" x2="-20" y2="16"/>
    <line x1="-24" y1="-6" x2="-12" y2="-14" stroke-width="3"/><line x1="24" y1="-6" x2="12" y2="-14" stroke-width="3"/></g>`,
  A: `<g transform="translate(${W / 2},60)" fill="url(#gold)">
    <path d="M0 -20 L5 -6 L20 -6 L8 3 L13 18 L0 9 L-13 18 L-8 3 L-20 -6 L-5 -6 Z" stroke="#6b5420" stroke-width="1"/></g>`,
  '6': `<g transform="translate(${W / 2},60)" fill="url(#gold)">
    <path d="M0 -20 Q10 -8 6 2 Q14 -2 12 8 Q8 20 0 20 Q-8 20 -12 8 Q-14 -2 -6 2 Q-10 -8 0 -20Z" stroke="#6b5420" stroke-width="1"/></g>`,
};

// ВАЖЛИВО: без кутових індексів! Ранг/масть малює ІГРОВИЙ РУШІЙ поверх
// (чіткий текст у будь-якому розмірі). SVG — лише преміум-арт підкладка.
function cardSVG({ rank, suit, red }) {
  const ink = red ? 'url(#ruby)' : 'url(#gold)';
  const emblem = emblems[rank] ? emblems[rank] : '';
  // центральний медальйон: кільце + ВЕЛИКА масть (читається навіть у мініатюрі)
  const medallion = `
    <circle cx="${W / 2}" cy="${H * 0.5}" r="66" fill="none" stroke="url(#gold)" stroke-width="1.4" opacity="0.6"/>
    <circle cx="${W / 2}" cy="${H * 0.5}" r="73" fill="none" stroke="url(#gold)" stroke-width="0.7" opacity="0.35" stroke-dasharray="2 5"/>
    <text x="${W / 2}" y="${H * 0.5}" font-size="104" text-anchor="middle" dominant-baseline="central"
      fill="${ink}" stroke="rgba(255,244,214,0.35)" stroke-width="1"
      style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6))">${suit}</text>`;
  // нижній титул
  const title = `
    <text x="${W / 2}" y="${H - 22}" font-size="13" text-anchor="middle" fill="url(#gold)" opacity="0.9"
      font-family="Georgia, 'Times New Roman', serif" letter-spacing="3">ROYAL</text>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  ${frame}${corners}${emblem}${medallion}${title}
</svg>`;
}

// ── Генерація ───────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
const files = [];
for (const su of SUITS) {
  for (const rank of RANKS) {
    const svg = cardSVG({ rank, suit: su.s, red: su.red });
    const name = `${rank}${su.key}.svg`;
    fs.writeFileSync(path.join(OUT, name), svg);
    files.push(name);
  }
}

// Вітрина: всі 36 на одному полотні (9 колонок × 4 ряди)
const pad = 14, sw = 9 * (W + pad) + pad, sh = 4 * (H + pad) + pad;
let cells = '';
SUITS.forEach((su, r) => {
  RANKS.forEach((rank, c) => {
    const inner = cardSVG({ rank, suit: su.s, red: su.red })
      .replace(/^<\?xml[^>]*>\n/, '')
      .replace('<svg xmlns="http://www.w3.org/2000/svg"', `<svg x="${pad + c * (W + pad)}" y="${pad + r * (H + pad)}" width="${W}" height="${H}"`);
    cells += inner + '\n';
  });
});
fs.writeFileSync(path.join(OUT, '_showcase.svg'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sw} ${sh}"><rect width="${sw}" height="${sh}" fill="#0b0918"/>\n${cells}</svg>`);

console.log(`OK: ${files.length} карт + _showcase.svg → ${OUT}`);
