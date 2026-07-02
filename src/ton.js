// ─── src/ton.js — Блокчейн TON: прив'язка гаманця, NFT-володіння, мінт ─────
//   Гібридна модель: звичайні колоди — off-chain (economy.js), NFT — рідко,
//   для цінних карт. Гравець мінтить сам через TON Connect; сервер може
//   мінтити для нагород/івентів. Володіння ЗАВЖДИ перевіряється on-chain.

const crypto = require('crypto');
const { Address, beginCell, toNano } = require('@ton/core');
const { TON, APP_URL } = require('./config');
const { log } = require('./logger');

// ── Каталог NFT-колод (рідкісні, цінні). deck → ключ косметики в грі ───────
// image/metadata — заглушки; підставляються при розгортанні колекції.
const NFT_DECKS = [
  { id: 'nft_dragon',  deck: 'dragon',  name: 'Дракон',      emoji: '🐉', rarity: 'legendary', maxSupply: 500,  desc: 'Легендарна колода. Вогняний дракон на кожній карті.' },
  { id: 'nft_phoenix', deck: 'phoenix', name: 'Фенікс',      emoji: '🔥', rarity: 'legendary', maxSupply: 500,  desc: 'Відроджується щоразу, як ти виграєш.' },
  { id: 'nft_tryzub',  deck: 'tryzub',  name: 'Тризуб',      emoji: '🔱', rarity: 'epic',      maxSupply: 1000, desc: 'Колекційна українська колода.' },
];

function nftByDeck(deckKey) { return NFT_DECKS.find(n => n.deck === deckKey); }
function nftById(id) { return NFT_DECKS.find(n => n.id === id); }

// ── API endpoints ──────────────────────────────────────────────────────────
function tonapiBase() {
  return TON.NETWORK === 'mainnet' ? 'https://tonapi.io' : 'https://testnet.tonapi.io';
}
function tonapiHeaders() {
  return TON.TONAPI_KEY ? { Authorization: `Bearer ${TON.TONAPI_KEY}` } : {};
}
function appDomain() {
  try { return new URL(APP_URL).host; } catch { return 'localhost'; }
}

// ── Нормалізація адреси ──────────────────────────────────────────────────────
function normalizeAddress(addr) {
  try { return Address.parse(addr).toRawString(); } // "0:hex..."
  catch { return null; }
}

// ── Перевірка TON Connect ton_proof ───────────────────────────────────────────
// proof = { timestamp, domain:{lengthBytes,value}, signature(base64), payload }
// publicKey = hex рядок (32 байти), address = user-friendly або raw
function verifyTonProof(address, proof, publicKeyHex) {
  try {
    if (!proof || !publicKeyHex) return false;
    const addr = Address.parse(address);
    const domain = proof.domain?.value || appDomain();

    // Перевірка домену і свіжості (15 хв)
    if (domain !== appDomain()) { log(`TON proof: чужий домен ${domain}`); return false; }
    if (Math.abs(Date.now() / 1000 - Number(proof.timestamp)) > 15 * 60) return false;

    const wcBuf = Buffer.alloc(4); wcBuf.writeInt32BE(addr.workChain);
    const domainBuf = Buffer.from(domain, 'utf8');
    const domainLen = Buffer.alloc(4); domainLen.writeUInt32LE(domainBuf.length);
    const tsBuf = Buffer.alloc(8); tsBuf.writeBigUInt64LE(BigInt(proof.timestamp));
    const payloadBuf = Buffer.from(String(proof.payload || ''), 'utf8');

    const message = Buffer.concat([
      Buffer.from('ton-proof-item-v2/', 'utf8'),
      wcBuf, addr.hash, domainLen, domainBuf, tsBuf, payloadBuf,
    ]);
    const inner = crypto.createHash('sha256').update(message).digest();
    const full = Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from('ton-connect', 'utf8'), inner]);
    const digest = crypto.createHash('sha256').update(full).digest();

    // ed25519 verify: обгортаємо raw pubkey у SPKI DER
    const der = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(publicKeyHex, 'hex'),
    ]);
    const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
    return crypto.verify(null, digest, key, Buffer.from(proof.signature, 'base64'));
  } catch (e) {
    log('verifyTonProof error: ' + e.message);
    return false;
  }
}

// ── Прив'язка гаманця до гаманця-акаунта (wallet.tonAddress) ───────────────────
function linkWallet(wallet, address, proof, publicKeyHex) {
  const raw = normalizeAddress(address);
  if (!raw) return { ok: false, error: 'Невірна адреса TON' };

  let verified = false;
  if (proof && publicKeyHex) verified = verifyTonProof(address, proof, publicKeyHex);

  if (TON.REQUIRE_PROOF && !verified) {
    return { ok: false, error: 'Не вдалося підтвердити володіння гаманцем (proof)' };
  }

  wallet.tonAddress = raw;
  wallet.tonVerified = verified;
  return { ok: true, address: raw, verified };
}

function unlinkWallet(wallet) {
  wallet.tonAddress = null;
  wallet.tonVerified = false;
  wallet.nftDecks = [];
  return { ok: true };
}

// ── Синхронізація on-chain володіння NFT → розблокування колод ────────────────
async function syncNfts(wallet) {
  if (!wallet.tonAddress) return { ok: false, error: 'Гаманець не прив\'язано' };
  if (!TON.COLLECTION_ADDRESS) {
    // Колекція не налаштована — нічого перевіряти, але не падаємо
    return { ok: true, nftDecks: wallet.nftDecks || [], note: 'collection_not_configured' };
  }
  try {
    const url = `${tonapiBase()}/v2/accounts/${wallet.tonAddress}/nfts`
      + `?collection=${encodeURIComponent(TON.COLLECTION_ADDRESS)}&limit=200&indirect_ownership=false`;
    const res = await fetch(url, { headers: tonapiHeaders() });
    if (!res.ok) return { ok: false, error: `TON API ${res.status}` };
    const data = await res.json();
    const items = data.nft_items || data.items || [];

    const owned = new Set(wallet.nftDecks || []);
    for (const it of items) {
      const attrs = it.metadata?.attributes || [];
      // Мапимо за трейтом deckId, інакше за назвою колоди з каталогу
      const trait = attrs.find(a => (a.trait_type || a.name) === 'deckId');
      const deckKey = trait?.value
        || NFT_DECKS.find(n => n.name === it.metadata?.name)?.deck;
      if (deckKey && nftByDeck(deckKey)) owned.add(deckKey);
    }
    wallet.nftDecks = [...owned];
    // NFT-колоди також стають доступними як косметика
    wallet.ownedDecks = [...new Set([...(wallet.ownedDecks || []), ...wallet.nftDecks])];
    return { ok: true, nftDecks: wallet.nftDecks };
  } catch (e) {
    log('syncNfts error: ' + e.message);
    return { ok: false, error: 'Помилка запиту до TON' };
  }
}

// ── Тіло mint-повідомлення (стандартна колекція getgems-стилю) ────────────────
function buildMintBody(itemIndex, ownerAddress, metadataUri) {
  const nftContent = beginCell().storeStringTail(metadataUri).endCell();
  const itemContent = beginCell()
    .storeAddress(Address.parse(ownerAddress))
    .storeRef(nftContent)
    .endCell();
  return beginCell()
    .storeUint(1, 32)                 // op: mint (залежить від контракту колекції)
    .storeUint(Date.now() % 0xffffffff, 64) // query_id
    .storeUint(itemIndex, 64)
    .storeCoins(toNano('0.05'))       // forward amount на item
    .storeRef(itemContent)
    .endCell();
}

// Отримати next_item_index колекції через tonapi (get-метод)
async function getNextIndex() {
  try {
    const url = `${tonapiBase()}/v2/blockchain/accounts/${TON.COLLECTION_ADDRESS}/methods/get_collection_data`;
    const res = await fetch(url, { headers: tonapiHeaders() });
    if (!res.ok) return 0;
    const data = await res.json();
    // decoded або stack
    const idx = data.decoded?.next_item_index
      ?? data.stack?.[0]?.num;
    return Number(idx) || 0;
  } catch { return 0; }
}

// ── Запит на мінт для гравця (non-custodial): повертає транзакцію для TON Connect
async function requestMint(wallet, nftId) {
  const nft = nftById(nftId);
  if (!nft) return { ok: false, error: 'Невідома NFT-карта' };
  if (!wallet.tonAddress) return { ok: false, error: 'Спочатку підключи гаманець' };
  if (!TON.COLLECTION_ADDRESS) return { ok: false, error: 'NFT-колекція ще не налаштована на сервері' };

  const nextIndex = await getNextIndex();
  const metadataUri = `${APP_URL}/nft/${nft.id}.json`;
  const body = buildMintBody(nextIndex, wallet.tonAddress, metadataUri);

  // Транзакція для tonConnectUI.sendTransaction
  return {
    ok: true,
    tx: {
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [{
        address: TON.COLLECTION_ADDRESS,
        amount: toNano(TON.MINT_PRICE_TON).toString(),
        payload: body.toBoc().toString('base64'),
      }],
    },
    nft: { id: nft.id, name: nft.name, deck: nft.deck },
  };
}

// ── Серверний мінт (custodial) — для нагород/івентів ──────────────────────────
// Потребує MINTER_MNEMONIC. Повертає {ok:false} якщо не налаштовано.
async function serverMint(toAddress, nftId) {
  const nft = nftById(nftId);
  if (!nft) return { ok: false, error: 'Невідома NFT-карта' };
  if (!TON.MINTER_MNEMONIC) return { ok: false, error: 'Minter не налаштовано (MINTER_MNEMONIC)' };
  if (!TON.COLLECTION_ADDRESS) return { ok: false, error: 'NFT-колекція не налаштована' };
  const dest = normalizeAddress(toAddress);
  if (!dest) return { ok: false, error: 'Невірна адреса отримувача' };

  try {
    const { mnemonicToWalletKey } = require('@ton/crypto');
    const { TonClient, WalletContractV4, internal } = require('@ton/ton');

    const endpoint = TON.NETWORK === 'mainnet'
      ? 'https://toncenter.com/api/v2/jsonRPC'
      : 'https://testnet.toncenter.com/api/v2/jsonRPC';
    const client = new TonClient({ endpoint, apiKey: TON.TONAPI_KEY || undefined });

    const key = await mnemonicToWalletKey(TON.MINTER_MNEMONIC.trim().split(/\s+/));
    const wallet = WalletContractV4.create({ workchain: 0, publicKey: key.publicKey });
    const contract = client.open(wallet);

    const nextIndex = await getNextIndex();
    const metadataUri = `${APP_URL}/nft/${nft.id}.json`;
    const body = buildMintBody(nextIndex, dest, metadataUri);

    const seqno = await contract.getSeqno();
    await contract.sendTransfer({
      seqno, secretKey: key.secretKey,
      messages: [internal({
        to: TON.COLLECTION_ADDRESS,
        value: toNano('0.1'),
        body,
      })],
    });
    log(`🪙 Server mint ${nft.id} → ${dest} (seqno ${seqno})`);
    return { ok: true, nft: nft.id, to: dest, seqno };
  } catch (e) {
    log('serverMint error: ' + e.message);
    return { ok: false, error: 'Помилка мінту: ' + e.message };
  }
}

// ── Публічний стан TON для клієнта ────────────────────────────────────────────
function tonState(wallet) {
  return {
    network: TON.NETWORK,
    address: wallet.tonAddress || null,
    verified: !!wallet.tonVerified,
    nftDecks: wallet.nftDecks || [],
    collectionConfigured: !!TON.COLLECTION_ADDRESS,
    mintPriceTon: TON.MINT_PRICE_TON,
    catalog: NFT_DECKS.map(n => ({
      id: n.id, deck: n.deck, name: n.name, emoji: n.emoji,
      rarity: n.rarity, maxSupply: n.maxSupply, desc: n.desc,
      owned: (wallet.nftDecks || []).includes(n.deck),
    })),
  };
}

module.exports = {
  NFT_DECKS, nftById, nftByDeck,
  verifyTonProof, linkWallet, unlinkWallet,
  syncNfts, requestMint, serverMint, tonState,
  normalizeAddress,
};
