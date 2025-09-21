#!/usr/bin/env node

// Telegram Bot Setup Script
const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🤖 Telegram Bot Setup for Anonymice Chat');
console.log('==========================================\n');

async function setupTelegram() {
    try {
        // Get bot token
        const botToken = await askQuestion('Enter your Telegram bot token: ');
        
        if (!botToken || botToken === 'YOUR_BOT_TOKEN_HERE') {
            console.log('❌ Please enter a valid bot token');
            process.exit(1);
        }
        
        // Test bot token
        console.log('🔍 Testing bot token...');
        const botInfo = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`);
        console.log('✅ Bot token is valid!');
        console.log(`   Bot name: ${botInfo.data.result.first_name}`);
        console.log(`   Bot username: @${botInfo.data.result.username}\n`);
        
        // Get chat ID
        console.log('📱 To get your chat ID:');
        console.log('1. Start a chat with your bot');
        console.log('2. Send any message to the bot');
        console.log('3. Press Enter here to continue...\n');
        
        await askQuestion('Press Enter when you\'ve sent a message to the bot...');
        
        // Get updates to find chat ID
        console.log('🔍 Looking for your chat ID...');
        const updates = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates`);
        
        if (updates.data.result.length === 0) {
            console.log('❌ No messages found. Please send a message to your bot first.');
            process.exit(1);
        }
        
        const chatId = updates.data.result[updates.data.result.length - 1].message.chat.id;
        console.log(`✅ Found your chat ID: ${chatId}\n`);
        
        // Create .env file
        const envContent = `# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=${botToken}
TELEGRAM_CHAT_ID=${chatId}
`;
        
        require('fs').writeFileSync('.env', envContent);
        console.log('✅ Created .env file with your configuration');
        
        // Test sending a message
        console.log('📤 Testing message sending...');
        const testMessage = '🎉 Telegram integration is working! You\'ll now receive notifications when someone knocks or sends a message.';
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: testMessage
        });
        
        console.log('✅ Test message sent successfully!');
        console.log('\n🎯 Setup complete! Your Telegram bot is ready to use.');
        console.log('   Start your server with: npm start');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.response?.data || error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

setupTelegram();
