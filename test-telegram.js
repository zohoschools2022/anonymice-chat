// Test Telegram integration
process.env.TELEGRAM_BOT_TOKEN = '8066658111:AAGl9XJl9GAYKtb6IIgO2wJPJL0QzKTdP5Y';
process.env.TELEGRAM_CHAT_ID = '578044189';

console.log('🧪 Testing Telegram integration...');
console.log('Bot Token:', process.env.TELEGRAM_BOT_TOKEN ? 'Set' : 'Missing');
console.log('Chat ID:', process.env.TELEGRAM_CHAT_ID ? 'Set' : 'Missing');

const { sendKnockNotification } = require('./config/telegram');

async function testKnockNotification() {
    try {
        console.log('\n📱 Testing knock notification...');
        const result = await sendKnockNotification('TestUser', 1);
        console.log('✅ Knock notification sent successfully!');
        console.log('Result:', result);
    } catch (error) {
        console.error('❌ Knock notification failed:', error.message);
        console.error('Full error:', error);
    }
}

testKnockNotification();
