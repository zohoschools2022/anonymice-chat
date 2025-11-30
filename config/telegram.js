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

// Delete a Telegram message
async function deleteTelegramMessage(messageId) {
    try {
        const response = await axios.post(`${TELEGRAM_API_URL}/deleteMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            message_id: messageId
        });
        console.log('✅ Telegram message deleted:', messageId);
        return response.data;
    } catch (error) {
        // Don't log error if message already deleted or not found (common case)
        if (error.response?.data?.error_code !== 400) {
            console.error('❌ Failed to delete Telegram message:', error.response?.data || error.message);
        }
        return null;
    }
}

// Send knock notification
async function sendKnockNotification(participantName, roomId) {
    const time = new Date().toLocaleTimeString('en-IN', { 
        timeZone: 'Asia/Kolkata',
        hour12: true, 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    const message = `🔔 ${participantName} from Room ${roomId} (${time})\n\n` +
                   `Reply with:\n` +
                   `• <code>approve</code> - Let them in\n` +
                   `• <code>reject</code> - Reject them\n` +
                   `• <code>away</code> - Send "away" message\n` +
                   `• <code>nudge</code> - Send gentle prompt (after approval)\n` +
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
// If lastMessageId is provided, deletes the previous message first
async function sendUserMessageNotification(participantName, roomId, message, chatHistory = [], lastMessageId = null) {
    // Delete previous message if it exists (to avoid repetitive content)
    if (lastMessageId) {
        console.log(`🗑️ Deleting previous Telegram message ${lastMessageId} for Room ${roomId}`);
        await deleteTelegramMessage(lastMessageId);
    }
    
    // Build conversation history
    let historyText = '';
    if (chatHistory && chatHistory.length > 0) {
        // Filter out welcome messages and build clean history
        const filteredHistory = chatHistory.filter(msg => 
            !msg.text.includes('Welcome to the chat room') && 
            !msg.text.includes('You have joined the chat room')
        );
        
        if (filteredHistory.length > 0) {
            historyText = '\n\n';
            filteredHistory.forEach(msg => {
                let sender;
                if (msg.isAdmin) {
                    sender = 'Rajendran';
                } else if (msg.sender === 'System') {
                    sender = `[${msg.text}]`;
                    historyText += `${sender}\n`;
                    return; // Skip the time and colon for system messages
                } else {
                    sender = msg.sender;
                }
                
                // Format time as HH:MM AM/PM in IST
                const time = new Date(msg.timestamp).toLocaleTimeString('en-IN', { 
                    timeZone: 'Asia/Kolkata',
                    hour12: true, 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                if (msg.sender !== 'System') {
                    historyText += `${sender} (${time}): ${msg.text}\n`;
                }
            });
        }
    }
    
    const notification = `${participantName} from Room ${roomId}${historyText}`;

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
    deleteTelegramMessage,
    sendKnockNotification,
    sendUserMessageNotification,
    sendAdminResponse
};
