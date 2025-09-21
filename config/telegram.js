// Telegram Bot Configuration
const axios = require('axios');

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID_HERE';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Send message to Telegram
async function sendTelegramMessage(message, options = {}) {
    try {
        const payload = {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML',
            ...options
        };

        const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, payload);
        console.log('✅ Telegram message sent:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ Telegram message failed:', error.response?.data || error.message);
        return null;
    }
}

// Send knock notification
async function sendKnockNotification(participantName, roomId) {
    const message = `🔔 <b>Someone Knocked!</b>\n\n` +
                   `👤 <b>Name:</b> ${participantName}\n` +
                   `🏠 <b>Room:</b> ${roomId}\n` +
                   `⏰ <b>Time:</b> ${new Date().toLocaleString()}\n\n` +
                   `Reply with:\n` +
                   `• <code>approve</code> - Let them in\n` +
                   `• <code>reject</code> - Reject them\n` +
                   `• <code>away</code> - Send "away" message\n` +
                   `• Any other text - Custom message`;

    const result = await sendTelegramMessage(message);
    
    // Return the message ID for context tracking
    return {
        success: result ? true : false,
        messageId: result ? result.message_id : null,
        result: result
    };
}

// Send user message notification with full conversation history
async function sendUserMessageNotification(participantName, roomId, message, chatHistory = []) {
    // Build conversation history
    let historyText = '';
    if (chatHistory && chatHistory.length > 0) {
        historyText = '\n\n📜 <b>Conversation History:</b>\n';
        chatHistory.forEach(msg => {
            const sender = msg.isAdmin ? '👨‍💼 Admin' : `👤 ${msg.sender}`;
            const time = new Date(msg.timestamp).toLocaleTimeString();
            historyText += `${sender} (${time}): ${msg.text}\n`;
        });
    }
    
    const notification = `💬 <b>New Message</b>\n\n` +
                        `👤 <b>From:</b> ${participantName}\n` +
                        `🏠 <b>Room:</b> ${roomId}\n` +
                        `📝 <b>Latest Message:</b> ${message}` +
                        historyText + `\n\nReply to respond directly to this user.`;

    const result = await sendTelegramMessage(notification);
    
    // Return the message ID for context tracking
    return {
        success: result ? true : false,
        messageId: result ? result.message_id : null,
        result: result
    };
}

// Send admin response to user
async function sendAdminResponse(roomId, message) {
    // This will be handled by the server's socket.io system
    // We'll implement this in the server.js file
    console.log(`📤 Admin response for Room ${roomId}: ${message}`);
    return true;
}

module.exports = {
    sendTelegramMessage,
    sendKnockNotification,
    sendUserMessageNotification,
    sendAdminResponse
};
