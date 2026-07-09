// ─── Колекції скінів: тематичні набори різної рідкості ───────────────────
//   Карти колекцій падають зі скринь (economy.js) і продаються на ринку
//   (market.js). Повну колекцію можна купити за Stars зі знижкою ~25-45%.
const { getBackSkins, getCardSkins } = require('./skins');

// items: { kind: 'card'|'back', id } — id зі skins.js
// 36 предметів Королівської колоди — генеруються з тих самих правил, що skins.js
const ROYAL_ITEMS = (() => {
  const suits = ['S', 'C', 'H', 'D'];
  const ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const items = [];
  for (const s of suits) for (const r of ranks) items.push({ kind: 'card', id: `royal_${r}${s}` });
  return items;
})();

const COLLECTIONS = {
  royal: {
    id: 'royal', name: 'Королівська колода', emoji: '👑', rarity: 'epic',
    desc: 'Повна колода 36 карт: нічне золото, рубін і філігрань. Ексклюзив — зі скринь НЕ падає.',
    color: '#ffd166',
    priceStars: 2500, // окремо: 4×200 + 16×150 + 16×100 = 4800⭐
    noDrop: true,     // тільки покупка або ринок — тримає цінність
    items: ROYAL_ITEMS,
  },
  legends: {
    id: 'legends', name: 'Легенди', emoji: '🐉', rarity: 'epic',
    desc: 'Мамки — найсильніші карти гри. Побачив дракона — тремти.',
    color: '#c98bff',
    priceStars: 750, // окремо: 4×200 + 200 = 1000⭐
    items: [
      { kind: 'card', id: 'S6_dragon' }, { kind: 'card', id: 'H6_phoenix' },
      { kind: 'card', id: 'D6_comet' },  { kind: 'card', id: 'C6_hydra' },
      { kind: 'back', id: 'galaxy_bk' },
    ],
  },
  boasters: {
    id: 'boasters', name: 'Хвалящі', emoji: '⚔️', rarity: 'epic',
    desc: 'Вальти, що не бояться хвалитись. Козирна колекція.',
    color: '#ffd166',
    priceStars: 750, // окремо: 1000⭐
    items: [
      { kind: 'card', id: 'JC_demon' }, { kind: 'card', id: 'JS_pirate' },
      { kind: 'card', id: 'JH_knight' }, { kind: 'card', id: 'JD_jester' },
      { kind: 'back', id: 'royal_gold' },
    ],
  },
  court: {
    id: 'court', name: 'Королівський двір', emoji: '👑', rarity: 'rare',
    desc: 'Королі та дами з характером. Повний двір — повна повага.',
    color: '#5cb8ff',
    priceStars: 900, // окремо: 8×150 = 1200⭐
    items: [
      { kind: 'card', id: 'KS_shadow' }, { kind: 'card', id: 'KH_lion' },
      { kind: 'card', id: 'KD_pharaoh' }, { kind: 'card', id: 'KC_viking' },
      { kind: 'card', id: 'QS_witch' }, { kind: 'card', id: 'QH_siren' },
      { kind: 'card', id: 'QD_ice' }, { kind: 'card', id: 'QC_panther' },
    ],
  },
  aces: {
    id: 'aces', name: 'Тузи долі', emoji: '💀', rarity: 'rare',
    desc: 'Чотири тузи — чотири долі. Обери свою.',
    color: '#7fe3ff',
    priceStars: 550, // окремо: 4×150 + 150 = 750⭐
    items: [
      { kind: 'card', id: 'AS_death' }, { kind: 'card', id: 'AH_cupid' },
      { kind: 'card', id: 'AD_midas' }, { kind: 'card', id: 'AC_wolf' },
      { kind: 'back', id: 'ember_bk' },
    ],
  },
  lucky: {
    id: 'lucky', name: 'Щасливчики', emoji: '🍀', rarity: 'common',
    desc: 'Дрібнота, що приносить удачу. Ідеальний старт колекціонера.',
    color: '#9fe8a0',
    priceStars: 600, // окремо: 10×100 + 150 = 1150⭐
    items: [
      { kind: 'card', id: 'T10S_storm' }, { kind: 'card', id: 'T10H_flame' },
      { kind: 'card', id: 'T10D_gem' }, { kind: 'card', id: 'T10C_oak' },
      { kind: 'card', id: 'N9S_raven' }, { kind: 'card', id: 'N9H_rose' },
      { kind: 'card', id: 'N9D_star' }, { kind: 'card', id: 'N9C_clover' },
      { kind: 'card', id: 'N7S_ghost' }, { kind: 'card', id: 'N8D_spark' },
      { kind: 'back', id: 'malachite' },
    ],
  },
};

function getCollections() { return COLLECTIONS; }

function ownsItem(wallet, it) {
  const bag = it.kind === 'back' ? wallet.ownedBackSkins : wallet.ownedCardSkins;
  return Array.isArray(bag) && bag.includes(it.id);
}

// Зріз для клієнта: колекції + прогрес гравця (скільки зібрано)
function collectionsState(wallet) {
  const backs = getBackSkins(), cards = getCardSkins();
  return Object.values(COLLECTIONS).map(c => ({
    id: c.id, name: c.name, emoji: c.emoji, rarity: c.rarity,
    desc: c.desc, color: c.color, priceStars: c.priceStars,
    items: c.items.map(it => {
      const def = it.kind === 'back' ? backs[it.id] : cards[it.id];
      return {
        kind: it.kind, id: it.id, owned: ownsItem(wallet, it),
        name: def?.name, card: def?.card, emoji: def?.emoji,
        bg: def?.bg, color: def?.color, css: def?.css, img: def?.img,
        stars: def?.stars, rarity: def?.rarity,
      };
    }),
    owned: c.items.filter(it => ownsItem(wallet, it)).length,
    total: c.items.length,
  }));
}

// Видати ВСЮ колекцію (після оплати Stars). Повертає список нових предметів.
function grantCollection(wallet, collId) {
  const c = COLLECTIONS[collId];
  if (!c) return null;
  const granted = [];
  for (const it of c.items) {
    const bag = it.kind === 'back' ? 'ownedBackSkins' : 'ownedCardSkins';
    wallet[bag] = wallet[bag] || [];
    if (!wallet[bag].includes(it.id)) { wallet[bag].push(it.id); granted.push(it); }
  }
  return granted;
}

// Скіни заданих рідкостей, яких у гравця ще НЕМАЄ (для дропу зі скринь).
// Колекції з noDrop (ексклюзиви за ⭐) зі скринь не падають.
function unownedByRarity(wallet, rarities) {
  const out = [];
  for (const c of Object.values(COLLECTIONS)) {
    if (c.noDrop) continue;
    for (const it of c.items) {
      if (ownsItem(wallet, it)) continue;
      const defs = it.kind === 'back' ? getBackSkins() : getCardSkins();
      const def = defs[it.id];
      if (def && rarities.includes(def.rarity)) out.push({ ...it, def, coll: c.id });
    }
  }
  return out;
}

module.exports = { getCollections, collectionsState, grantCollection, unownedByRarity };
