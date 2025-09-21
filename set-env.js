// Set environment variables for Telegram integration
process.env.TELEGRAM_BOT_TOKEN = '8066658111:AAGl9XJl9GAYKtb6IIgO2wJPJL0QzKTdP5Y';
process.env.TELEGRAM_CHAT_ID = '578044189';

console.log('✅ Environment variables set:');
console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN.substring(0, 10) + '...');
console.log('TELEGRAM_CHAT_ID:', process.env.TELEGRAM_CHAT_ID);

// Test sending a message
const { sendTelegramMessage } = require('./config/telegram');

async function testTelegram() {
    try {
        console.log('\n🧪 Testing Telegram integration...');
        const result = await sendTelegramMessage('🎉 Telegram integration is working! Your Anonymice chat is now connected to Telegram.');
        console.log('✅ Test message sent successfully!');
        console.log('Message ID:', result.message_id);
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testTelegram();
