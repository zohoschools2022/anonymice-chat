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
    
    // Check if this is a reply to a specific message
    if (message.reply_to_message) {
        const replyToMessageId = message.reply_to_message.message_id;
        console.log('📱 This is a reply to message ID:', replyToMessageId);
        
        // Find context by reply message ID
        for (let [roomId, context] of pendingKnocks) {
            if (context.replyMessageId === replyToMessageId) {
                console.log('📱 Found context for reply:', context);
                return handleKnockResponse(text, context);
            }
        }
        
        // Check active message contexts
        for (let [id, context] of activeRoomContexts) {
            if (context.replyMessageId === replyToMessageId) {
                console.log('📱 Found message context for reply:', context);
                return handleMessageResponse(text, context);
            }
        }
    }
    
    // Check if this is a response to the most recent knock
    if (pendingKnocks.size > 0) {
        const mostRecentKnock = Array.from(pendingKnocks.values()).pop();
        console.log('📱 Using most recent knock context:', mostRecentKnock);
        return handleKnockResponse(text, mostRecentKnock);
    }
    
    // Check if this is a response to the most recent message
    if (activeRoomContexts.size > 0) {
        const mostRecentMessage = Array.from(activeRoomContexts.values()).pop();
        console.log('📱 Using most recent message context:', mostRecentMessage);
        return handleMessageResponse(text, mostRecentMessage);
    }
    
    // Default response
    return {
        success: false,
        message: 'No active context found. Please wait for a notification or reply to a specific message.'
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
    } else if (context.type === 'message') {
        activeRoomContexts.set(context.roomId, context);
        console.log('📱 Message context set for room:', context.roomId);
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
