// Локальний запуск без Telegram-бота (для прев'ю/розробки)
process.env.BOT_TOKEN = '';
require('./src/server.js');
