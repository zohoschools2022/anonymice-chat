// Dynamic Bot Factory - Creates and manages Telegram bots on demand
const axios = require('axios');

// BotFather API for creating/deleting bots
const BOTFATHER_API = 'https://api.telegram.org/bot';
const BOTFATHER_TOKEN = process.env.BOTFATHER_TOKEN; // You'll need to get this from @BotFather

// Store active bots
const activeBots = new Map(); // Map of roomId -> bot info

// Bot naming pattern
const BOT_NAME_PREFIX = 'AnonymiceChat';
const BOT_USERNAME_PREFIX = 'anonymice_chat_';

// Create a new bot for a conversation
async function createBotForRoom(roomId, participantName) {
    try {
        console.log(`🤖 Creating new bot for Room ${roomId} (${participantName})`);
        
        // Generate unique bot name and username
        const timestamp = Date.now();
        const botName = `${BOT_NAME_PREFIX}_${roomId}_${timestamp}`;
        const botUsername = `${BOT_USERNAME_PREFIX}${roomId}_${timestamp}`;
        
        // Call BotFather API to create new bot
        const createResponse = await axios.post(`${BOTFATHER_API}${BOTFATHER_TOKEN}/newbot`, {
            name: botName,
            username: botUsername
        });
        
        if (createResponse.data.ok) {
            const botToken = createResponse.data.result.token;
            const botInfo = {
                roomId: roomId,
                participantName: participantName,
                botToken: botToken,
                botUsername: botUsername,
                botName: botName,
                createdAt: new Date().toISOString(),
                isActive: true
            };
            
            // Store bot info
            activeBots.set(roomId, botInfo);
            
            // Set webhook for the new bot
            await setBotWebhook(botToken, roomId);
            
            console.log(`✅ Bot created successfully for Room ${roomId}: @${botUsername}`);
            return botInfo;
        } else {
            throw new Error(`BotFather API error: ${createResponse.data.description}`);
        }
    } catch (error) {
        console.error(`❌ Failed to create bot for Room ${roomId}:`, error.message);
        throw error;
    }
}

// Set webhook for a bot
async function setBotWebhook(botToken, roomId) {
    try {
        const webhookUrl = `${process.env.RAILWAY_PUBLIC_DOMAIN || 'https://web-production-8d6b4.up.railway.app'}/telegram-webhook/${roomId}`;
        
        const response = await axios.post(`${BOTFATHER_API}${botToken}/setWebhook`, {
            url: webhookUrl
        });
        
        if (response.data.ok) {
            console.log(`✅ Webhook set for bot in Room ${roomId}`);
        } else {
            console.error(`❌ Failed to set webhook for Room ${roomId}:`, response.data.description);
        }
    } catch (error) {
        console.error(`❌ Webhook error for Room ${roomId}:`, error.message);
    }
}

// Send message using a specific bot
async function sendMessageWithBot(roomId, message) {
    const botInfo = activeBots.get(roomId);
    if (!botInfo) {
        throw new Error(`No bot found for Room ${roomId}`);
    }
    
    try {
        const response = await axios.post(`${BOTFATHER_API}${botInfo.botToken}/sendMessage`, {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        
        if (response.data.ok) {
            return {
                success: true,
                messageId: response.data.result.message_id,
                botInfo: botInfo
            };
        } else {
            throw new Error(`Send message failed: ${response.data.description}`);
        }
    } catch (error) {
        console.error(`❌ Failed to send message with bot for Room ${roomId}:`, error.message);
        throw error;
    }
}

// Delete bot when conversation ends
async function deleteBotForRoom(roomId) {
    const botInfo = activeBots.get(roomId);
    if (!botInfo) {
        console.log(`⚠️ No bot found for Room ${roomId} to delete`);
        return;
    }
    
    try {
        console.log(`🗑️ Deleting bot for Room ${roomId}: @${botInfo.botUsername}`);
        
        // Delete webhook first
        await axios.post(`${BOTFATHER_API}${botInfo.botToken}/deleteWebhook`);
        
        // Delete bot via BotFather
        const deleteResponse = await axios.post(`${BOTFATHER_API}${BOTFATHER_TOKEN}/deletebot`, {
            bot_username: botInfo.botUsername
        });
        
        if (deleteResponse.data.ok) {
            activeBots.delete(roomId);
            console.log(`✅ Bot deleted successfully for Room ${roomId}`);
        } else {
            console.error(`❌ Failed to delete bot for Room ${roomId}:`, deleteResponse.data.description);
        }
    } catch (error) {
        console.error(`❌ Error deleting bot for Room ${roomId}:`, error.message);
    }
}

// Get bot info for a room
function getBotInfo(roomId) {
    return activeBots.get(roomId);
}

// Get all active bots
function getAllActiveBots() {
    return Array.from(activeBots.values());
}

// Check if room has an active bot
function hasActiveBot(roomId) {
    return activeBots.has(roomId);
}

module.exports = {
    createBotForRoom,
    sendMessageWithBot,
    deleteBotForRoom,
    getBotInfo,
    getAllActiveBots,
    hasActiveBot
};
