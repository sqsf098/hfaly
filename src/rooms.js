// ─── Кімнати: сховище, базові кімнати, очистка ──────────────────────────
const { createRoom } = require('./game');
const { BASE_ROOMS, ROOM_TTL_MS, EMPTY_ROOM_TTL_MS, CLEANUP_INTERVAL_MS } = require('./config');
const { log } = require('./logger');

const rooms = new Map();          // roomId → room
const socketToPlayer = new Map(); // socketId → { roomId, playerIndex }

function makeBaseRoom(cfg) {
  const room = createRoom(cfg.id);
  room.isBaseRoom = true;
  room.baseRoomConfig = cfg;
  room.deposit = cfg.deposit;
  room.pot = 0;
  room.createdAt = Date.now();
  return room;
}

function initBaseRooms() {
  for (const cfg of BASE_ROOMS) rooms.set(cfg.id, makeBaseRoom(cfg));
  log(`🏦 Базові кімнати: ${BASE_ROOMS.map(r => r.emoji + r.id).join(' | ')}`);
}

function resetBaseRoom(roomId) {
  const cfg = BASE_ROOMS.find(r => r.id === roomId);
  if (!cfg) return;
  rooms.set(roomId, makeBaseRoom(cfg));
  log(`🔄 Кімната ${roomId} скинута`);
}

function startCleanupLoop() {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, room] of rooms) {
      if (room.isBaseRoom) continue;
      room.createdAt = room.createdAt || now;
      const stale = now - room.createdAt > ROOM_TTL_MS;
      const allOffline = room.players.length > 0 &&
        room.players.every(p => p.isBot || p.online === false);
      const emptyOld = room.players.length === 0 && now - room.createdAt > EMPTY_ROOM_TTL_MS;
      if (stale || allOffline || emptyOld) { rooms.delete(id); cleaned++; }
    }
    if (cleaned > 0) log(`🧹 Очищено ${cleaned} кімнат, лишилось ${rooms.size}`);
  }, CLEANUP_INTERVAL_MS);
}

module.exports = { rooms, socketToPlayer, initBaseRooms, resetBaseRoom, startCleanupLoop };
