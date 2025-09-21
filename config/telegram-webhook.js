// Telegram Webhook Handler
const axios = require('axios');

// Store active room context for responses
let activeRoomContext = null;

// Handle incoming Telegram messages
function handleTelegramMessage(message) {
    const text = message.text;
    const chatId = message.chat.id;
    
    console.log('📱 Received Telegram message:', text);
    
    // Check if this is a response to a knock notification
    if (activeRoomContext && activeRoomContext.type === 'knock') {
        return handleKnockResponse(text, activeRoomContext);
    }
    
    // Check if this is a response to a user message
    if (activeRoomContext && activeRoomContext.type === 'message') {
        return handleMessageResponse(text, activeRoomContext);
    }
    
    // Default response
    return {
        success: false,
        message: 'No active context found. Please wait for a notification.'
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

// Set active room context
function setActiveRoomContext(context) {
    activeRoomContext = context;
    console.log('🎯 Set active room context:', context);
}

// Clear active room context
function clearActiveRoomContext() {
    activeRoomContext = null;
    console.log('🧹 Cleared active room context');
}

module.exports = {
    handleTelegramMessage,
    setActiveRoomContext,
    clearActiveRoomContext
};
