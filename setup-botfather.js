// Setup script to get BotFather token for dynamic bot creation
require('dotenv').config();
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function setupBotFather() {
    console.log('========================================');
    console.log('🤖 BotFather Setup for Dynamic Bot Creation');
    console.log('========================================');
    console.log('');
    console.log('To create bots dynamically, we need a BotFather token.');
    console.log('This is different from your regular bot token.');
    console.log('');
    console.log('Steps to get BotFather token:');
    console.log('1. Open Telegram and search for @BotFather');
    console.log('2. Send /token command to @BotFather');
    console.log('3. You will receive a token that looks like:');
    console.log('   123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
    console.log('4. Copy this token');
    console.log('');
    console.log('⚠️  IMPORTANT: This token allows creating/deleting bots!');
    console.log('   Keep it secure and never share it publicly.');
    console.log('========================================');
    
    let botFatherToken = process.env.BOTFATHER_TOKEN;
    if (!botFatherToken) {
        botFatherToken = await askQuestion('Enter your BotFather token: ');
    } else {
        console.log(`Using existing BOTFATHER_TOKEN from .env: ${botFatherToken.substring(0, 10)}...`);
    }
    
    if (!botFatherToken) {
        console.error('❌ BotFather token is required for dynamic bot creation.');
        console.log('You can still use the system with a single bot, but dynamic creation will be disabled.');
        rl.close();
        return;
    }
    
    console.log('');
    console.log('========================================');
    console.log('🎉 BotFather Setup Complete!');
    console.log('========================================');
    console.log(`Please add this to your Railway environment variables:`);
    console.log(`BOTFATHER_TOKEN=${botFatherToken}`);
    console.log('');
    console.log('After adding this variable, your system will be able to:');
    console.log('✅ Create new bots for each conversation');
    console.log('✅ Delete bots when conversations end');
    console.log('✅ Handle unlimited simultaneous conversations');
    console.log('========================================');
    
    rl.close();
}

setupBotFather();
