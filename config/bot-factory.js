// Dynamic Bot Factory - Manages Telegram bots for conversations
const axios = require('axios');

// Store active bots
const activeBots = new Map(); // Map of roomId -> bot info
const availableBots = new Map(); // Map of botId -> bot info
const usedBots = new Set(); // Set of bot IDs currently in use

// Bot pool - you can add more bot tokens here
const BOT_POOL = [
    { id: 1, token: process.env.TELEGRAM_BOT_TOKEN, username: 'AnonymiceBot' },
    // Add more bots here as needed
    // { id: 2, token: 'BOT_TOKEN_2', username: 'AnonymiceBot2' },
    // { id: 3, token: 'BOT_TOKEN_3', username: 'AnonymiceBot3' },
    // ... up to 10 or more bots
];

// Initialize bot pool
BOT_POOL.forEach(bot => {
    availableBots.set(bot.id, bot);
});

// Assign a bot from the pool to a conversation
async function createBotForRoom(roomId, participantName) {
    try {
        console.log(`🤖 Assigning bot for Room ${roomId} (${participantName})`);
        
        // Find an available bot
        let assignedBot = null;
        for (let [botId, bot] of availableBots) {
            if (!usedBots.has(botId)) {
                assignedBot = bot;
                usedBots.add(botId);
                break;
            }
        }
        
        if (!assignedBot) {
            throw new Error('No available bots in the pool. All bots are currently in use.');
        }
        
        const botInfo = {
            roomId: roomId,
            participantName: participantName,
            botToken: assignedBot.token,
            botUsername: assignedBot.username,
            botId: assignedBot.id,
            createdAt: new Date().toISOString(),
            isActive: true
        };
        
        // Store bot info
        activeBots.set(roomId, botInfo);
        
        // Set webhook for the bot
        await setBotWebhook(assignedBot.token, roomId);
        
        console.log(`✅ Bot assigned successfully for Room ${roomId}: @${assignedBot.username}`);
        return botInfo;
    } catch (error) {
        console.error(`❌ Failed to assign bot for Room ${roomId}:`, error.message);
        throw error;
    }
}

// Set webhook for a bot
async function setBotWebhook(botToken, roomId) {
    try {
        const webhookUrl = `https://web-production-8d6b4.up.railway.app/telegram-webhook/${roomId}`;
        
        const response = await axios.post(`https://api.telegram.org/bot${botToken}/setWebhook`, {
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
        const response = await axios.post(`https://api.telegram.org/bot${botInfo.botToken}/sendMessage`, {
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

// Release bot back to pool when conversation ends
async function deleteBotForRoom(roomId) {
    const botInfo = activeBots.get(roomId);
    if (!botInfo) {
        console.log(`⚠️ No bot found for Room ${roomId} to release`);
        return;
    }
    
    try {
        console.log(`🗑️ Releasing bot for Room ${roomId}: @${botInfo.botUsername}`);
        
        // Delete webhook
        await axios.post(`https://api.telegram.org/bot${botInfo.botToken}/deleteWebhook`);
        
        // Release bot back to pool
        usedBots.delete(botInfo.botId);
        activeBots.delete(roomId);
        
        console.log(`✅ Bot released successfully for Room ${roomId}`);
    } catch (error) {
        console.error(`❌ Error releasing bot for Room ${roomId}:`, error.message);
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
