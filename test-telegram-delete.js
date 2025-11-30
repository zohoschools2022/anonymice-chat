#!/usr/bin/env node

/**
 * Test script to verify Telegram message deletion works
 */

require('dotenv').config();
const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function testDelete() {
    console.log('🧪 Testing Telegram message deletion...\n');
    
    // First, send a test message
    console.log('1. Sending test message...');
    try {
        const sendResponse = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: '🧪 Test message - will be deleted in 3 seconds',
            parse_mode: 'HTML'
        });
        
        if (sendResponse.data.ok) {
            const messageId = sendResponse.data.result.message_id;
            console.log(`✅ Test message sent with ID: ${messageId}\n`);
            
            // Wait 3 seconds
            console.log('2. Waiting 3 seconds...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Try to delete it
            console.log('3. Attempting to delete message...');
            try {
                const deleteResponse = await axios.post(`${TELEGRAM_API_URL}/deleteMessage`, {
                    chat_id: TELEGRAM_CHAT_ID,
                    message_id: messageId
                }, {
                    timeout: 5000
                });
                
                if (deleteResponse.data.ok) {
                    console.log('✅ Message deletion SUCCESSFUL!');
                    console.log('✅ Delete API is working correctly\n');
                    return true;
                } else {
                    console.log('❌ Delete API returned ok: false');
                    console.log('Response:', deleteResponse.data);
                    return false;
                }
            } catch (deleteError) {
                console.log('❌ Delete API call failed');
                console.log('Error:', deleteError.response?.data || deleteError.message);
                console.log('\nError details:');
                console.log('  Status:', deleteError.response?.status);
                console.log('  Error Code:', deleteError.response?.data?.error_code);
                console.log('  Description:', deleteError.response?.data?.description);
                return false;
            }
        } else {
            console.log('❌ Failed to send test message');
            return false;
        }
    } catch (error) {
        console.log('❌ Failed to send test message');
        console.log('Error:', error.response?.data || error.message);
        return false;
    }
}

testDelete().then(success => {
    if (success) {
        console.log('\n✅ Telegram deletion API is working!');
        process.exit(0);
    } else {
        console.log('\n❌ Telegram deletion API test failed');
        process.exit(1);
    }
});

