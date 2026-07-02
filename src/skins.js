// ─── Каталог скінів (серверна валідація) ─────────────────────────────────
// Вигляд описаний на клієнті (core.js); тут — лише що існує та до якої
// карти прив'язаний скін. Сервер перевіряє володіння і відповідність карти.
const BACK_SKIN_IDS = ['violet', 'navy', 'gold', 'crimson'];

// cardKey — до якої карти скін застосовний (значення карти незмінне)
const CARD_SKINS = {
  AS_royal: { card: 'A♠' },
  QH_rose:  { card: 'Q♥' },
  JC_joker: { card: 'J♣' },
};

module.exports = { BACK_SKIN_IDS, CARD_SKINS };
