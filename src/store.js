// ─── Надійне збереження JSON: атомарний запис + бекап ───────────────────
// Проблема: fs.writeFileSync прямо у файл може лишити його битим, якщо
// процес впаде посеред запису. Рішення: пишемо у .tmp і атомарно
// перейменовуємо; попередню версію тримаємо в .bak для відновлення.
const fs = require('fs');
const path = require('path');

function atomicWriteJSON(file, obj) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  try { if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak'); } catch (e) { /* бекап не критичний */ }
  fs.renameSync(tmp, file);
}

// Читає JSON; якщо основний файл битий — пробує .bak
function readJSONSafe(file) {
  for (const f of [file, file + '.bak']) {
    try {
      if (fs.existsSync(f)) return { data: JSON.parse(fs.readFileSync(f, 'utf8')), from: f };
    } catch (e) { /* битий — пробуємо наступний */ }
  }
  return null;
}

module.exports = { atomicWriteJSON, readJSONSafe };
