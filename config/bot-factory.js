// Dynamic Bot Factory - Manages unlimited conversations with one bot
const axios = require('axios');

// Store active conversations
const activeConversations = new Map(); // Map of roomId -> conversation info
let conversationCounter = 0; // Track conversation numbers

// Single bot for all conversations
const MAIN_BOT = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    username: 'AnonymiceBot'
};

// Create a new conversation (unlimited)
async function createBotForRoom(roomId, participantName) {
    try {
        console.log(`🤖 Creating conversation for Room ${roomId} (${participantName})`);
        
        // Increment conversation counter
        conversationCounter++;
        
        const conversationInfo = {
            roomId: roomId,
            participantName: participantName,
            conversationNumber: conversationCounter,
            botToken: MAIN_BOT.token,
            botUsername: MAIN_BOT.username,
            createdAt: new Date().toISOString(),
            isActive: true
        };
        
        // Store conversation info
        activeConversations.set(roomId, conversationInfo);
        
        // Set webhook for the main bot (only once)
        await setBotWebhook(MAIN_BOT.token, roomId);
        
        console.log(`✅ Conversation #${conversationCounter} created for Room ${roomId}: @${MAIN_BOT.username}`);
        return conversationInfo;
    } catch (error) {
        console.error(`❌ Failed to create conversation for Room ${roomId}:`, error.message);
        throw error;
    }
}

// Set webhook for a bot
async function setBotWebhook(botToken, roomId) {
    try {
        // Use a single webhook endpoint for all conversations
        const webhookUrl = `https://web-production-8d6b4.up.railway.app/admin-notifications`;
        
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
    const conversationInfo = activeConversations.get(roomId);
    if (!conversationInfo) {
        throw new Error(`No conversation found for Room ${roomId}`);
    }
    
    try {
        const response = await axios.post(`https://api.telegram.org/bot${MAIN_BOT.token}/sendMessage`, {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        
        if (response.data.ok) {
            return {
                success: true,
                messageId: response.data.result.message_id,
                conversationInfo: conversationInfo
            };
        } else {
            throw new Error(`Send message failed: ${response.data.description}`);
        }
    } catch (error) {
        console.error(`❌ Failed to send message with bot for Room ${roomId}:`, error.message);
        throw error;
    }
}

// End conversation when room is cleaned
async function deleteBotForRoom(roomId) {
    const conversationInfo = activeConversations.get(roomId);
    if (!conversationInfo) {
        console.log(`⚠️ No conversation found for Room ${roomId} to end`);
        return;
    }
    
    try {
        console.log(`🗑️ Ending conversation #${conversationInfo.conversationNumber} for Room ${roomId}`);
        
        // Remove conversation from active list
        activeConversations.delete(roomId);
        
        console.log(`✅ Conversation ended successfully for Room ${roomId}`);
    } catch (error) {
        console.error(`❌ Error ending conversation for Room ${roomId}:`, error.message);
    }
}

// Get conversation info for a room
function getBotInfo(roomId) {
    return activeConversations.get(roomId);
}

// Get all active conversations
function getAllActiveBots() {
    return Array.from(activeConversations.values());
}

// Check if room has an active conversation
function hasActiveBot(roomId) {
    return activeConversations.has(roomId);
}

module.exports = {
    createBotForRoom,
    sendMessageWithBot,
    deleteBotForRoom,
    getBotInfo,
    getAllActiveBots,
    hasActiveBot
};
