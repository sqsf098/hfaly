// ─── src/logger.js — просте логування на сервері ────────────────────────

function timestamp() {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

function log(...args) {
  console.log(`[${timestamp()}]`, ...args);
}

module.exports = { log };
