// Telegram Bot Configuration
const axios = require('axios');

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID_HERE';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Track pending message operations per room to prevent race conditions
const pendingRoomOperations = new Map(); // roomId -> Promise

// Track all Telegram message IDs per room for final cleanup
const roomTelegramMessageIds = new Map(); // roomId -> [messageId1, messageId2, ...]

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
        
        // Log the full response structure for debugging
        if (response.data && response.data.ok && response.data.result) {
            console.log('✅ Telegram message sent. Message ID:', response.data.result.message_id, 'Chat ID:', response.data.result.chat?.id);
        } else {
            console.error('⚠️ Unexpected Telegram response structure:', JSON.stringify(response.data, null, 2));
        }
        
        return response.data;
    } catch (error) {
        console.error('❌ Telegram message failed:', error.response?.data || error.message);
        return null;
    }
}

// Delete a Telegram message with retry logic
async function deleteTelegramMessage(messageId, retries = 2) {
    if (!messageId) {
        console.error('❌ deleteTelegramMessage called with null/undefined messageId');
        return null;
    }
    
    console.log(`🗑️ [DELETE] Attempting to delete message ${messageId} from chat ${TELEGRAM_CHAT_ID}`);
    
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await axios.post(`${TELEGRAM_API_URL}/deleteMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                message_id: messageId
            }, {
                timeout: 5000 // 5 second timeout
            });
            
            if (response.data && response.data.ok) {
                console.log(`✅ [DELETE] Successfully deleted message ${messageId} (attempt ${attempt + 1})`);
                return response.data;
            } else {
                console.log(`⚠️ [DELETE] Delete API returned ok: false for message ${messageId}:`, response.data);
                return response.data;
            }
        } catch (error) {
            const errorCode = error.response?.data?.error_code;
            const errorDescription = error.response?.data?.description || '';
            
            console.log(`⚠️ [DELETE] Attempt ${attempt + 1}/${retries + 1} failed for message ${messageId}:`, {
                errorCode,
                errorDescription,
                status: error.response?.status,
                message: error.message
            });
            
            // Message already deleted or not found - this is fine
            if (errorCode === 400 && (
                errorDescription.includes('message to delete not found') ||
                errorDescription.includes('message can\'t be deleted')
            )) {
                console.log(`ℹ️ [DELETE] Message ${messageId} already deleted or not found - treating as success`);
                return { ok: true }; // Return success since message is gone
            }
            
            // Bad request - message might be too old (48 hours limit)
            if (errorCode === 400) {
                console.log(`⚠️ [DELETE] Cannot delete message ${messageId} (may be too old or invalid): ${errorDescription}`);
                return null;
            }
            
            // Retry on network errors
            if (attempt < retries && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || !error.response)) {
                const delay = 500 * (attempt + 1);
                console.log(`🔄 [DELETE] Retrying deletion in ${delay}ms (attempt ${attempt + 1}/${retries + 1})...`);
                await new Promise(resolve => setTimeout(resolve, delay)); // Exponential backoff
                continue;
            }
            
            // Log other errors
            console.error(`❌ [DELETE] Failed to delete Telegram message ${messageId}:`, {
                errorCode,
                errorDescription,
                status: error.response?.status,
                message: error.message
            });
            return null;
        }
    }
    
    console.error(`❌ [DELETE] All retry attempts failed for message ${messageId}`);
    return null;
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
// Uses a queue per room to prevent race conditions
async function sendUserMessageNotification(participantName, roomId, message, chatHistory = [], lastMessageId = null) {
    // Wait for any pending operation for this room to complete
    // This prevents race conditions when multiple messages arrive quickly
    if (pendingRoomOperations.has(roomId)) {
        console.log(`⏳ Waiting for pending operation for Room ${roomId}...`);
        try {
            await pendingRoomOperations.get(roomId);
        } catch (error) {
            console.error(`⚠️ Previous operation for Room ${roomId} failed:`, error);
        }
    }
    
    // Create a promise for this operation
    const operationPromise = (async () => {
        // Delete previous message if it exists (to avoid repetitive content)
        // Do this FIRST and wait for it to complete before sending new message
        if (lastMessageId) {
            console.log(`🗑️ [Room ${roomId}] Attempting to delete previous message ${lastMessageId}...`);
            
            // First, remove from tracking array (we're about to delete it)
            if (roomTelegramMessageIds.has(roomId)) {
                const messageIds = roomTelegramMessageIds.get(roomId);
                const index = messageIds.indexOf(lastMessageId);
                if (index > -1) {
                    messageIds.splice(index, 1);
                    console.log(`🗑️ [Room ${roomId}] Removed message ID ${lastMessageId} from tracking array`);
                }
            }
            
            // Now try to delete it
            const deleteResult = await deleteTelegramMessage(lastMessageId);
            
            if (deleteResult && deleteResult.ok) {
                console.log(`✅ [Room ${roomId}] Successfully deleted message ${lastMessageId}`);
            } else {
                console.log(`⚠️ [Room ${roomId}] Could not delete message ${lastMessageId} (may be too old or already deleted)`);
            }
            
            // Small delay to ensure Telegram processes the deletion
            // This helps prevent race conditions where new message arrives before deletion completes
            await new Promise(resolve => setTimeout(resolve, 400)); // 400ms delay for better reliability
        } else {
            console.log(`ℹ️ [Room ${roomId}] No previous message to delete (first message)`);
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
        
        // Track this message ID for final cleanup
        // Telegram API returns: { ok: true, result: { message_id: 123, chat: {...}, ... } }
        const messageId = result?.result?.message_id || result?.message_id;
        
        if (messageId) {
            if (!roomTelegramMessageIds.has(roomId)) {
                roomTelegramMessageIds.set(roomId, []);
            }
            roomTelegramMessageIds.get(roomId).push(messageId);
            console.log(`📝 [Room ${roomId}] Tracking new message ID ${messageId} (total tracked: ${roomTelegramMessageIds.get(roomId).length})`);
        } else {
            console.error(`❌ [Room ${roomId}] Failed to get message ID from Telegram response. Full response:`, JSON.stringify(result, null, 2));
        }
        
        // Return the message ID for context tracking
        return {
            success: result ? (result.ok !== false) : false,
            messageId: messageId || null,
            result: result
        };
    })();
    
    // Store the promise and clean it up when done
    pendingRoomOperations.set(roomId, operationPromise);
    
    try {
        const result = await operationPromise;
        return result;
    } finally {
        // Remove from pending operations after a short delay to allow any immediate follow-up
        setTimeout(() => {
            if (pendingRoomOperations.get(roomId) === operationPromise) {
                pendingRoomOperations.delete(roomId);
            }
        }, 1000);
    }
}

// Send final conversation summary and delete all intermediate messages
// This leaves only the final summary in Telegram
async function sendFinalConversationSummary(participantName, roomId, conversationSummary) {
    const time = new Date().toLocaleTimeString('en-IN', { 
        timeZone: 'Asia/Kolkata',
        hour12: true, 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    // Build the final summary message
    const finalMessage = `👋 ${participantName} from Room ${roomId} - Conversation ended (${time})${conversationSummary}`;
    
    // Wait for any pending operations to complete
    if (pendingRoomOperations.has(roomId)) {
        console.log(`⏳ Waiting for pending operations for Room ${roomId} before sending final summary...`);
        try {
            await pendingRoomOperations.get(roomId);
        } catch (error) {
            console.error(`⚠️ Previous operation for Room ${roomId} failed:`, error);
        }
    }
    
    // Get all message IDs for this room (these are messages that haven't been deleted yet)
    // At this point, this should typically contain only the last message sent during conversation
    const messageIds = roomTelegramMessageIds.get(roomId) || [];
    console.log(`🗑️ Found ${messageIds.length} intermediate message(s) to delete for Room ${roomId}`);
    if (messageIds.length > 0) {
        console.log(`🗑️ Message IDs: ${messageIds.join(', ')}`);
    }
    
    // Delete all intermediate messages sequentially for better reliability
    if (messageIds.length > 0) {
        let deletedCount = 0;
        let failedCount = 0;
        
        // Delete messages one by one to avoid rate limits and ensure reliability
        for (let i = 0; i < messageIds.length; i++) {
            const msgId = messageIds[i];
            console.log(`🗑️ Deleting message ${i + 1}/${messageIds.length}: ${msgId}`);
            const deleteResult = await deleteTelegramMessage(msgId);
            if (deleteResult) {
                deletedCount++;
                console.log(`✅ Successfully deleted message ${msgId}`);
            } else {
                failedCount++;
                console.log(`⚠️ Failed to delete message ${msgId} (may be too old or already deleted)`);
            }
            
            // Small delay between deletions to avoid rate limits
            if (i < messageIds.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200)); // 200ms between deletions for better reliability
            }
        }
        
        console.log(`✅ Final cleanup: Deleted ${deletedCount} intermediate messages for Room ${roomId} (${failedCount} failed or already deleted)`);
    } else {
        console.log(`ℹ️ No intermediate messages to delete for Room ${roomId} (all were already deleted during conversation)`);
    }
    
    // Small delay to ensure deletions are processed
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send the final summary message
    const result = await sendTelegramMessage(finalMessage);
    
    // Clear the message IDs for this room
    roomTelegramMessageIds.delete(roomId);
    
    console.log(`✅ Final summary sent for Room ${roomId}, all intermediate messages deleted`);
    
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
    sendFinalConversationSummary,
    sendAdminResponse
};
