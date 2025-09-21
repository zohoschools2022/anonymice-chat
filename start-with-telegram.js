// Set environment variables for Telegram integration
process.env.TELEGRAM_BOT_TOKEN = '8066658111:AAGl9XJl9GAYKtb6IIgO2wJPJL0QzKTdP5Y';
process.env.TELEGRAM_CHAT_ID = '578044189';

console.log('🚀 Starting Anonymice server with Telegram integration...');
console.log('📱 Bot Token:', process.env.TELEGRAM_BOT_TOKEN.substring(0, 10) + '...');
console.log('💬 Chat ID:', process.env.TELEGRAM_CHAT_ID);

// Start the server
require('./server.js');
