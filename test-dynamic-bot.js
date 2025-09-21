// Test the dynamic bot creation system
process.env.TELEGRAM_BOT_TOKEN = '8066658111:AAGl9XJl9GAYKtb6IIgO2wJPJL0QzKTdP5Y';
process.env.TELEGRAM_CHAT_ID = '578044189';
process.env.BOTFATHER_TOKEN = '8066658111:AAGl9XJl9GAYKtb6IIgO2wJPJL0QzKTdP5Y';

const { createBotForRoom, sendMessageWithBot, deleteBotForRoom } = require('./config/bot-factory');

async function testDynamicBot() {
    try {
        console.log('🧪 Testing dynamic bot creation...');
        
        // Test creating a bot for room 1
        const botInfo = await createBotForRoom(1, 'TestUser');
        console.log('✅ Bot created:', botInfo);
        
        // Test sending a message
        const message = `🧪 <b>Test Message</b>\n\nThis is a test of the dynamic bot system!`;
        const result = await sendMessageWithBot(1, message);
        console.log('✅ Message sent:', result);
        
        // Wait a bit then clean up
        console.log('⏳ Waiting 5 seconds before cleanup...');
        setTimeout(async () => {
            await deleteBotForRoom(1);
            console.log('✅ Bot deleted - test complete!');
        }, 5000);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testDynamicBot();
