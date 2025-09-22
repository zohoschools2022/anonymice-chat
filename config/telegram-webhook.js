// Telegram Webhook Handler
const axios = require('axios');

// Store active room contexts for responses (queue system)
let activeRoomContexts = new Map(); // Map of chatId -> context
let pendingKnocks = new Map(); // Map of roomId -> context for knock responses

// Handle incoming Telegram messages
function handleTelegramMessage(message) {
    const text = message.text;
    const chatId = message.chat.id;
    
    console.log('📱 Received Telegram message:', text);
    console.log('📱 Pending knocks:', Array.from(pendingKnocks.keys()));
    console.log('📱 Active contexts:', Array.from(activeRoomContexts.keys()));
    
    // Check if this is a reply to a specific message
    if (message.reply_to_message) {
        const replyToMessageId = message.reply_to_message.message_id;
        console.log('📱 This is a reply to message ID:', replyToMessageId);
        
        // Find context by reply message ID
        console.log('📱 Searching pending knocks for reply message ID:', replyToMessageId);
        for (let [roomId, context] of pendingKnocks) {
            console.log('📱 Checking pending knock context:', context.replyMessageId, 'vs', replyToMessageId);
            if (context.replyMessageId === replyToMessageId) {
                console.log('📱 Found knock context for reply:', context);
                return handleKnockResponse(text, context);
            }
        }
        
        // Check active message contexts
        console.log('📱 Searching active message contexts for reply message ID:', replyToMessageId);
        for (let [id, context] of activeRoomContexts) {
            console.log('📱 Checking message context:', context.replyMessageId, 'vs', replyToMessageId);
            if (context.replyMessageId === replyToMessageId) {
                console.log('📱 Found message context for reply:', context);
                return handleMessageResponse(text, context);
            }
        }
    }
    
    // If not a reply, try to find the most recent message context as fallback
    if (activeRoomContexts.size > 0) {
        const mostRecentMessage = Array.from(activeRoomContexts.values()).pop();
        console.log('📱 Using most recent message context as fallback:', mostRecentMessage);
        return handleMessageResponse(text, mostRecentMessage);
    }
    
    // If no message context, try most recent knock context
    if (pendingKnocks.size > 0) {
        const mostRecentKnock = Array.from(pendingKnocks.values()).pop();
        console.log('📱 Using most recent knock context as fallback:', mostRecentKnock);
        return handleKnockResponse(text, mostRecentKnock);
    }
    
    // If no context at all, return error
    console.log('📱 No context found - user must reply to specific message');
    return {
        success: false,
        message: 'Please reply to the specific notification you want to respond to. Use the "Reply" button in Telegram on the notification message.'
    };
}

// Handle knock response
function handleKnockResponse(response, context) {
    const { roomId, participantName, socketId } = context;
    
    switch (response.toLowerCase().trim()) {
        case 'approve':
            return {
                success: true,
                action: 'approve',
                roomId,
                participantName,
                socketId,
                message: 'User approved and entering chat room'
            };
            
        case 'reject':
            return {
                success: true,
                action: 'reject',
                roomId,
                participantName,
                socketId,
                message: 'User rejected'
            };
            
        case 'away':
            return {
                success: true,
                action: 'away',
                roomId,
                participantName,
                socketId,
                message: 'Admin is away, try later'
            };
            
        case 'nudge':
            return {
                success: true,
                action: 'nudge',
                roomId,
                participantName,
                socketId,
                message: 'Hello! I\'m here and ready to help. What would you like to discuss?'
            };
            
        default:
            return {
                success: true,
                action: 'custom',
                roomId,
                participantName,
                socketId,
                message: response
            };
    }
}

// Handle message response
function handleMessageResponse(response, context) {
    const { roomId, participantName } = context;
    
    // Check for admin close command
    if (response.toUpperCase().trim() === 'XXCLOSEXX') {
        return {
            success: true,
            action: 'close',
            roomId,
            participantName,
            message: 'Conversation closed by admin'
        };
    }
    
    return {
        success: true,
        action: 'reply',
        roomId,
        participantName,
        message: response
    };
}

// Set active room context for knock
function setActiveRoomContext(context) {
    if (context.type === 'knock') {
        pendingKnocks.set(context.roomId, context);
        console.log('📱 Knock context set for room:', context.roomId);
        console.log('📱 Reply message ID stored:', context.replyMessageId);
        console.log('📱 Context details:', JSON.stringify(context, null, 2));
    } else if (context.type === 'message') {
        activeRoomContexts.set(context.roomId, context);
        console.log('📱 Message context set for room:', context.roomId);
        console.log('📱 Reply message ID stored:', context.replyMessageId);
        console.log('📱 Context details:', JSON.stringify(context, null, 2));
    }
}

// Clear active room context
function clearActiveRoomContext(roomId = null) {
    if (roomId) {
        pendingKnocks.delete(roomId);
        activeRoomContexts.delete(roomId);
        console.log('📱 Context cleared for room:', roomId);
    } else {
        pendingKnocks.clear();
        activeRoomContexts.clear();
        console.log('📱 All contexts cleared');
    }
}

module.exports = {
    handleTelegramMessage,
    setActiveRoomContext,
    clearActiveRoomContext
};
