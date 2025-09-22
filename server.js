const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

// Admin notification integration
const { sendKnockNotification, sendUserMessageNotification } = require('./config/telegram');
const { handleTelegramMessage, setActiveRoomContext, clearActiveRoomContext } = require('./config/telegram-webhook');
const { createBotForRoom, sendMessageWithBot, deleteBotForRoom, getBotInfo } = require('./config/bot-factory');
const { 
    SECURITY_CONFIG, 
    checkRateLimit, 
    checkUserRateLimit, 
    validateMessage, 
    validateRoomCreation, 
    validateWebhookRequest, 
    getClientIP 
} = require('./config/security');

// Handle messages from dynamic bots
function handleDynamicBotMessage(roomId, message) {
    const text = message.text;
    const botInfo = getBotInfo(roomId);
    
    if (!botInfo) {
        console.log(`⚠️ No bot found for Room ${roomId}`);
        return;
    }
    
    console.log(`📱 Processing message for Room ${roomId} from bot @${botInfo.botUsername}`);
    
    // Handle different response types
    switch (text.toLowerCase().trim()) {
        case 'approve':
            approveUserForRoom(roomId, botInfo);
            break;
        case 'reject':
            rejectUserForRoom(roomId, botInfo, 'Your request has been rejected.');
            break;
        case 'away':
            rejectUserForRoom(roomId, botInfo, 'The admin is currently away. Please try again later.');
            break;
        default:
            // Custom message or reply to user message
            if (text.toLowerCase().includes('approve') || text.toLowerCase().includes('reject') || text.toLowerCase().includes('away')) {
                // Handle special cases
                if (text.toLowerCase().includes('approve')) {
                    approveUserForRoom(roomId, botInfo);
                } else if (text.toLowerCase().includes('reject')) {
                    rejectUserForRoom(roomId, botInfo, 'Your request has been rejected.');
                } else if (text.toLowerCase().includes('away')) {
                    rejectUserForRoom(roomId, botInfo, 'The admin is currently away. Please try again later.');
                }
            } else {
                // Send message to user
                sendMessageToUser(roomId, text, botInfo);
            }
            break;
    }
}

// Approve user for room
function approveUserForRoom(roomId, botInfo) {
    const room = chatRooms.get(roomId);
    if (!room) {
        console.log(`⚠️ Room ${roomId} not found for approval`);
        return;
    }
    
    // Activate the room
    room.status = 'active';
    // Don't enable service globally - keep it disabled for new knocks
    
    // Set up user connection
    const participantName = room.participant.name;
    participantRooms.set(participantName, roomId);
    
    // Find the socket for this room
    const socket = Array.from(io.sockets.sockets.values()).find(s => {
        const connection = activeConnections.get(s.id);
        return connection && connection.roomId === roomId;
    });
    
    if (socket) {
        socket.join(`room-${roomId}`);
        activeConnections.set(socket.id, {
            type: 'participant',
            name: participantName,
            roomId: roomId
        });
        
        // Add welcome message
        const welcomeMessage = {
            id: Date.now(),
            text: `Welcome ${participantName}! You can now chat with Rajendran D.`,
            sender: 'System',
            timestamp: new Date().toISOString(),
            isAdmin: false
        };
        room.messages.push(welcomeMessage);
        
        // Notify admin
        io.to('admin-room').emit('new-participant', {
            roomId,
            participant: { name: participantName }
        });
        
        // Send approval to user
        socket.emit('knock-approved', { roomId });
        
        console.log(`✅ Approved ${participantName} for Room ${roomId} via bot @${botInfo.botUsername}`);
    }
}

// Reject user for room
function rejectUserForRoom(roomId, botInfo, message) {
    const room = chatRooms.get(roomId);
    if (!room) {
        console.log(`⚠️ Room ${roomId} not found for rejection`);
        return;
    }
    
    // Find the socket for this room
    const socket = Array.from(io.sockets.sockets.values()).find(s => {
        const connection = activeConnections.get(s.id);
        return connection && connection.roomId === roomId;
    });
    
    if (socket) {
        socket.emit('knock-rejected', { message, roomId });
        console.log(`❌ Rejected user for Room ${roomId} via bot @${botInfo.botUsername}: ${message}`);
    }
    
    // Clean up the room and bot
    chatRooms.delete(roomId);
    deleteBotForRoom(roomId);
}

// Send message to user
function sendMessageToUser(roomId, message, botInfo) {
    const room = chatRooms.get(roomId);
    if (!room) {
        console.log(`⚠️ Room ${roomId} not found for message`);
        return;
    }
    
    const adminMessage = {
        id: Date.now(),
        text: message,
        sender: ADMIN_NAME,
        timestamp: new Date().toISOString(),
        isAdmin: true
    };
    
    room.messages.push(adminMessage);
    
    // Send to user in the room
    io.to(`room-${roomId}`).emit('new-message', adminMessage);
    
    // Also notify admin interface
    io.to('admin-room').emit('admin-message', { roomId, message: adminMessage });
    
    console.log(`📤 Admin message sent to Room ${roomId} via bot @${botInfo.botUsername}: ${message}`);
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Generate a long, confusing admin URL
const generateAdminUrl = () => {
    return crypto.randomBytes(32).toString('hex');
};

const ADMIN_URL = generateAdminUrl();
const ADMIN_NAME = "Rajendran D";

// Chat state management
const chatRooms = new Map();
const activeConnections = new Map();
const participantRooms = new Map(); // Track which participant is in which room
const maxRooms = 8;

// Admin status tracking
let adminStatus = { isActive: true, lastUpdate: new Date().toISOString() };

// Service status tracking (default: OFF)
let serviceEnabled = false;

// Persistence file
const DATA_FILE = path.join(__dirname, 'chat_data.json');

// Load existing data on startup
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            console.log('📂 Loading existing chat data...');
            
            // Restore chat rooms
            if (data.chatRooms) {
                data.chatRooms.forEach(([roomId, room]) => {
                    chatRooms.set(roomId, room);
                });
                console.log(`📂 Loaded ${chatRooms.size} chat rooms`);
            }
            
            // Restore participant mappings
            if (data.participantRooms) {
                data.participantRooms.forEach(([participant, roomId]) => {
                    participantRooms.set(participant, roomId);
                });
                console.log(`📂 Loaded ${participantRooms.size} participant mappings`);
            }
        }
    } catch (error) {
        console.log('📂 No existing data found or error loading:', error.message);
    }
}

// Save data to file
function saveData() {
    try {
        const data = {
            chatRooms: Array.from(chatRooms.entries()),
            participantRooms: Array.from(participantRooms.entries()),
            timestamp: new Date().toISOString()
        };
        
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('💾 Chat data saved successfully');
        console.log('💾 Saved rooms:', Array.from(chatRooms.keys()));
    } catch (error) {
        console.log('❌ Error saving chat data:', error.message);
    }
}

// Load data on startup
// loadData(); // Temporarily disabled to test if file persistence is causing the issue
console.log('📂 File persistence temporarily disabled for testing');

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin/:adminUrl', (req, res) => {
    const { adminUrl } = req.params;
    if (adminUrl === ADMIN_URL) {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    } else {
        res.status(404).send('Admin access denied');
    }
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/knock', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'knock.html'));
});

// Debug endpoint to check environment variables
app.get('/debug-env', (req, res) => {
    res.json({
        admin_bot_token: process.env.TELEGRAM_BOT_TOKEN ? 'Set' : 'Missing',
        admin_chat_id: process.env.TELEGRAM_CHAT_ID ? 'Set' : 'Missing',
        bot_token_preview: process.env.TELEGRAM_BOT_TOKEN ? process.env.TELEGRAM_BOT_TOKEN.substring(0, 10) + '...' : 'Not set',
        chat_id_value: process.env.TELEGRAM_CHAT_ID || 'Not set'
    });
});

// Admin notification webhook endpoint for all conversations (unlimited)
app.post('/admin-notifications', express.json({ limit: '10kb' }), async (req, res) => {
    const clientIP = getClientIP(req);
    
    // Validate webhook request
    const webhookValidation = validateWebhookRequest(req);
    if (!webhookValidation.valid) {
        console.log(`🚫 Invalid webhook request from ${clientIP}: ${webhookValidation.error}`);
        return res.status(400).send('Bad Request');
    }
    
    // Check rate limit
    const rateLimit = checkRateLimit(clientIP, 'webhook');
    if (!rateLimit.allowed) {
        console.log(`🚫 Rate limited webhook request from ${clientIP}`);
        return res.status(429).send('Too Many Requests');
    }
    
    const message = req.body.message;
    console.log(`📱 Received admin notification from ${clientIP}:`, message.text);
    console.log(`📱 Message object:`, JSON.stringify(message, null, 2));
    
    // Handle the message using conversation tracking
    const response = handleTelegramMessage(message);
    console.log(`📱 Response from admin notification handler:`, JSON.stringify(response, null, 2));
    
    // Process the response if it's successful
    if (response && response.success) {
        console.log('📱 Processing admin response:', response);
        
        // Process the response based on action
        switch (response.action) {
            case 'approve':
                // Approve the knock
                if (response.socketId) {
                    const socket = io.sockets.sockets.get(response.socketId);
                    const room = chatRooms.get(response.roomId);
                    
                    if (socket && room) {
                        // Activate the room
                        room.status = 'active';
                        
                        // Enable service for this session
                        serviceEnabled = true;
                        
                        // Set up user connection properly
                        const participantName = response.participantName;
                        participantRooms.set(participantName, response.roomId);
                        activeConnections.set(socket.id, {
                            type: 'participant',
                            name: participantName,
                            roomId: response.roomId
                        });
                        
                        // Join the room
                        socket.join(`room-${response.roomId}`);
                        
                        // Add welcome message
                        const welcomeMessage = {
                            id: Date.now(),
                            text: `Welcome ${participantName}! You can now chat with Rajendran D.`,
                            sender: 'System',
                            timestamp: new Date().toISOString(),
                            isAdmin: false
                        };
                        room.messages.push(welcomeMessage);
                        
                        // Notify admin
                        io.to('admin-room').emit('new-participant', {
                            roomId: response.roomId,
                            participant: { name: participantName }
                        });
                        
                        // Notify user
                        socket.emit('knock-approved', {
                            roomId: response.roomId,
                            message: 'You have been approved! Welcome to the chat.'
                        });
                        
                        console.log(`✅ User ${participantName} approved for Room ${response.roomId}`);
                    }
                }
                break;
                
            case 'reject':
            case 'away':
            case 'custom':
                // Reject the knock with message
                if (response.socketId) {
                    const socket = io.sockets.sockets.get(response.socketId);
                    if (socket) {
                        socket.emit('knock-rejected', { 
                            message: response.message,
                            roomId: response.roomId 
                        });
                        console.log(`❌ Rejected knock for ${response.participantName}: ${response.message}`);
                    }
                }
                break;
                
                case 'reply':
                    // Send admin response to user
                    const room = chatRooms.get(response.roomId);
                    if (room) {
                        const adminMessage = {
                            id: Date.now(),
                            text: response.message,
                            sender: ADMIN_NAME,
                            timestamp: new Date().toISOString(),
                            isAdmin: true
                        };
                        
                        room.messages.push(adminMessage);
                        
                        // Send to user in the room
                        io.to(`room-${response.roomId}`).emit('new-message', adminMessage);
                        
                        // Also notify admin interface
                        io.to('admin-room').emit('admin-message', { roomId: response.roomId, message: adminMessage });
                        
                        console.log(`📤 Admin response sent to Room ${response.roomId}: ${response.message}`);
                    }
                    break;
                    
                case 'close':
                    // Close the conversation
                    const roomToClose = chatRooms.get(response.roomId);
                    if (roomToClose) {
                        // Send close message to user
                        const closeMessage = {
                            id: Date.now(),
                            text: "The admin has closed this conversation. Thank you for chatting!",
                            sender: 'System',
                            timestamp: new Date().toISOString(),
                            isAdmin: false
                        };
                        
                        roomToClose.messages.push(closeMessage);
                        io.to(`room-${response.roomId}`).emit('new-message', closeMessage);
                        
                        // Notify admin interface
                        io.to('admin-room').emit('room-closed', { roomId: response.roomId });
                        
                        // Clean up the room
                        chatRooms.delete(response.roomId);
                        deleteBotForRoom(response.roomId);
                        
                        console.log(`🔒 Room ${response.roomId} closed by admin`);
                    }
                    break;
        }
    } else if (response && !response.success) {
        // Send helpful message back to admin if user didn't reply properly
        console.log('📱 Sending helpful message to admin:', response.message);
        try {
            const { sendTelegramMessage } = require('./config/telegram');
            await sendTelegramMessage(response.message, process.env.TELEGRAM_CHAT_ID);
        } catch (error) {
            console.error('Failed to send helpful message:', error);
        }
    }
    
    res.status(200).json(response || { success: false, message: 'No response generated' });
});


// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // Handle admin connection
    socket.on('admin-connect', () => {
        console.log('🔐 Admin connecting with socket ID:', socket.id);
        activeConnections.set(socket.id, { type: 'admin', name: ADMIN_NAME });
        socket.join('admin-room');
        
        // Verify admin joined the room
        const adminRoom = io.sockets.adapter.rooms.get('admin-room');
        console.log('👥 Admin joined admin-room. Total users in admin-room:', adminRoom ? adminRoom.size : 0);
        
        // Send current rooms with full data
        const currentRooms = Array.from(chatRooms.entries()).map(([roomId, room]) => ({
            roomId: parseInt(roomId),
            participant: room.participant,
            messages: room.messages
        }));
        
        socket.emit('admin-connected', { rooms: currentRooms });
        console.log('Admin connected, sent rooms:', currentRooms);
    });

    // Handle admin status changes
    socket.on('admin-status-change', (data) => {
        const connection = activeConnections.get(socket.id);
        if (connection && connection.type === 'admin') {
            adminStatus = {
                isActive: data.isActive,
                lastUpdate: data.timestamp
            };
            
            console.log(`👨‍💼 Admin status changed to: ${data.isActive ? 'active' : 'away'}`);
            
            // Broadcast admin status to all connected users
            io.emit('admin-status-update', adminStatus);
        }
    });

    // Handle service toggle
    socket.on('toggle-service', (data) => {
        const connection = activeConnections.get(socket.id);
        if (connection && connection.type === 'admin') {
            const wasEnabled = serviceEnabled;
            serviceEnabled = data.enabled;
            
            console.log(`🔌 Service ${serviceEnabled ? 'ENABLED' : 'DISABLED'} by admin`);
            
            // Broadcast service status to all connected users
            io.emit('service-status-update', { enabled: serviceEnabled });
            
            // If service was turned OFF, send shutdown message to all active users
            if (wasEnabled && !serviceEnabled) {
                console.log('🚫 Service disabled - sending shutdown message to all users');
                
                // Send shutdown message to all connected users
                const shutdownMessage = {
                    id: Date.now(),
                    text: "The Cat Has Left The House. Sorry. No More Play!",
                    sender: 'System',
                    timestamp: new Date().toISOString(),
                    isAdmin: false,
                    isShutdown: true
                };
                
                io.emit('service-shutdown', shutdownMessage);
            }
            
            // If service was turned ON, send welcome back message to all active users
            if (!wasEnabled && serviceEnabled) {
                console.log('✅ Service enabled - sending welcome back message to all users');
                
                // Send welcome back message to all connected users
                const welcomeBackMessage = {
                    id: Date.now(),
                    text: "The Cat is back! You can continue chatting now.",
                    sender: 'System',
                    timestamp: new Date().toISOString(),
                    isAdmin: false,
                    isWelcomeBack: true
                };
                
                io.emit('service-restored', welcomeBackMessage);
            }
        }
    });

    // Handle participant knock
    socket.on('knock', (data) => {
        const clientIP = socket.handshake.address;
        
        // Validate room creation
        const roomValidation = validateRoomCreation(clientIP, socket.id);
        if (!roomValidation.valid) {
            console.log(`🚫 Knock rejected for ${clientIP}: ${roomValidation.error}`);
            socket.emit('knock-rejected', { 
                message: roomValidation.error,
                resetTime: roomValidation.resetTime
            });
            return;
        }
        
        // Validate participant name
        const nameValidation = validateMessage(data.name || '');
        if (!nameValidation.valid) {
            console.log(`🚫 Invalid name from ${clientIP}: ${nameValidation.error}`);
            socket.emit('knock-rejected', { 
                message: 'Invalid name provided',
                resetTime: null
            });
            return;
        }
        
        // Always send Telegram notification first, regardless of service status
        let roomId = null;
        let participantName = data.name || `Anonymous${Math.floor(Math.random() * 1000)}`;
        
        // Try to find and claim an available room atomically
        for (let i = 1; i <= maxRooms; i++) {
            const room = chatRooms.get(i);
            
            // Check if room is truly available (doesn't exist OR is cleaned)
            if (!room || room.status === 'cleaned') {
                // ATOMIC CLAIM: Create room immediately to prevent race conditions
                const newRoom = {
                    id: i,
                    participant: { name: participantName },
                    messages: [],
                    status: 'pending', // Mark as pending until approved
                    created: Date.now(),
                    claimed: true // Mark as claimed immediately
                };
                
                // Set the room immediately to claim it
                chatRooms.set(i, newRoom);
                
                // DOUBLE-CHECK: Verify we actually got the room (prevent race conditions)
                const verifyRoom = chatRooms.get(i);
                if (verifyRoom && verifyRoom.participant.name === participantName) {
                    roomId = i;
                    console.log(`🔒 ATOMICALLY CLAIMED room ${i} for ${participantName} (pending approval)`);
                    break; // Exit loop immediately after claiming
                } else {
                    console.log(`⚠️ Race condition detected for room ${i}, trying next room`);
                    // Remove the room we just created since we didn't get it
                    chatRooms.delete(i);
                }
            } else {
                console.log(`Room ${i} is locked (status: ${room.status})`);
            }
        }

        if (roomId) {
            // Create a dedicated bot for this conversation
            createBotForRoom(roomId, participantName).then((botInfo) => {
                console.log(`🤖 Created dedicated bot for ${participantName} in Room ${roomId}: @${botInfo.botUsername}`);
                
                // Send knock notification using the new bot
                const knockMessage = `🔔 <b>Someone Knocked!</b>\n\n` +
                                   `👤 <b>Name:</b> ${participantName}\n` +
                                   `🏠 <b>Room:</b> ${roomId}\n` +
                                   `💬 <b>Conversation:</b> #${botInfo.conversationNumber}\n` +
                                   `⏰ <b>Time:</b> ${new Date().toLocaleString()}\n\n` +
                                   `⚠️ <b>IMPORTANT:</b> Use "Reply" button to respond to THIS specific knock!\n\n` +
                                   `Reply with:\n` +
                                   `• <code>approve</code> - Let them in\n` +
                                   `• <code>reject</code> - Reject them\n` +
                                   `• <code>away</code> - Send "away" message\n` +
                                   `• Any other text - Custom message`;
                
                return sendMessageWithBot(roomId, knockMessage);
            }).then((result) => {
                if (result.success) {
                    // Set active room context for Telegram responses
                    setActiveRoomContext({
                        type: 'knock',
                        roomId: roomId,
                        participantName: participantName,
                        socketId: socket.id,
                        replyMessageId: result.messageId,
                        botInfo: result.botInfo
                    });
                    console.log('📱 Admin knock notification sent with dedicated bot');
                } else {
                    console.error('❌ Failed to send admin knock notification');
                }
            }).catch(error => {
                console.error('❌ Failed to create bot or send notification:', error);
                // Fallback to regular notification if bot creation fails
                sendKnockNotification(participantName, roomId).then((result) => {
                    if (result.success) {
                        setActiveRoomContext({
                            type: 'knock',
                            roomId: roomId,
                            participantName: participantName,
                            socketId: socket.id,
                            replyMessageId: result.messageId
                        });
                        console.log('📱 Fallback notification sent');
                    }
                }).catch(fallbackError => {
                    console.error('❌ Fallback notification also failed:', fallbackError);
                });
            });
            
            // Check if service is enabled
            if (!serviceEnabled) {
                console.log('🚫 Knock received but service is disabled - waiting for admin approval');
                socket.emit('knock-pending', { 
                    message: "Knock received! Waiting for admin approval...",
                    roomId: roomId
                });
                return;
            }
        } else {
            socket.emit('no-rooms-available');
            return;
        }

        // If service is enabled, proceed with room activation
        if (roomId && serviceEnabled) {
            const newRoom = chatRooms.get(roomId);
            newRoom.status = 'active'; // Activate the room
            console.log(`🆕 Activated room ${roomId} for ${participantName}`);
            console.log(`🆕 Room messages count: ${newRoom.messages.length}`);

            // Store participant-room mapping
            participantRooms.set(participantName, roomId);

            socket.join(`room-${roomId}`);
            
            // Add welcome message
            const welcomeMessage = {
                id: Date.now(),
                text: `Welcome ${participantName}! You can now chat with Rajendran D.`,
                sender: 'System',
                timestamp: new Date().toISOString(),
                isAdmin: false
            };
            
            chatRooms.get(roomId).messages.push(welcomeMessage);
            
            // Save data after room creation
            // saveData(); // Temporarily disabled
            
            socket.emit('room-assigned', { roomId, name: participantName });
            
            // Notify admin
            const adminEvent = {
                roomId,
                participant: { name: participantName }
            };
            
            console.log('🎉 Sending new-participant event to admin-room:', adminEvent);
            console.log('🎉 Event data structure:', JSON.stringify(adminEvent));
            
            // Check if admin is connected
            const adminRoom = io.sockets.adapter.rooms.get('admin-room');
            if (adminRoom && adminRoom.size > 0) {
                io.to('admin-room').emit('new-participant', adminEvent);
                console.log('✅ new-participant event sent to admin-room');
            } else {
                console.log('❌ No admin connected to admin-room');
                console.log('👥 Admin room size:', adminRoom ? adminRoom.size : 0);
            }
            
            // Also log who's in admin-room
            console.log('👥 Users in admin-room:', adminRoom ? adminRoom.size : 0);
            if (adminRoom) {
                console.log('👥 Admin room socket IDs:', Array.from(adminRoom));
            }

            console.log(`Participant ${participantName} assigned to room ${roomId}`);
            console.log(`Current rooms:`, Array.from(chatRooms.keys()));
            console.log(`Participant rooms:`, Array.from(participantRooms.entries()));
        }
    });

    // Handle chat messages
    socket.on('send-message', (data) => {
        // Check if service is enabled
        if (!serviceEnabled) {
            console.log('🚫 Message rejected - service is disabled');
            return;
        }

        // Validate message content
        const messageValidation = validateMessage(data.text);
        if (!messageValidation.valid) {
            console.log(`🚫 Invalid message from socket ${socket.id}: ${messageValidation.error}`);
            socket.emit('message-error', { error: messageValidation.error });
            return;
        }

        // Check user rate limit
        const userRateLimit = checkUserRateLimit(socket.id, 'message');
        if (!userRateLimit.allowed) {
            console.log(`🚫 Message rate limited for socket ${socket.id}`);
            socket.emit('message-error', { 
                error: 'Too many messages. Please slow down.',
                resetTime: userRateLimit.resetTime
            });
            return;
        }

        console.log('📨 Message received from socket:', socket.id);
        const connection = activeConnections.get(socket.id);
        console.log('🔗 Connection found:', connection);
        if (!connection) {
            console.log('❌ No connection found for socket:', socket.id);
            console.log('📊 Active connections:', Array.from(activeConnections.entries()));
            return;
        }

        const message = {
            id: Date.now(),
            text: data.text,
            sender: connection.name,
            timestamp: new Date().toISOString(),
            isAdmin: connection.type === 'admin'
        };
        
        console.log('📅 Message timestamp created:', message.timestamp);
        console.log('📅 Timestamp type:', typeof message.timestamp);

        if (connection.type === 'admin') {
            // Admin message to specific room
            const roomId = data.roomId;
            const room = chatRooms.get(roomId);
            if (room) {
                                       room.messages.push(message);
                       // saveData(); // Temporarily disabled
                io.to(`room-${roomId}`).emit('new-message', message);
                socket.emit('message-sent', message);
            }
        } else {
            // Participant message
            const roomId = connection.roomId;
            const room = chatRooms.get(roomId);
            if (room) {
                                       room.messages.push(message);
                       // saveData(); // Temporarily disabled
                io.to(`room-${roomId}`).emit('new-message', message);
                io.to('admin-room').emit('admin-message', { roomId, message });
                socket.emit('message-sent', message);
                
                // Send Telegram notification for user message with chat history
                sendUserMessageNotification(connection.name, roomId, data.text, room.messages).then((result) => {
                    if (result.success) {
                        // Set active room context for Telegram responses
                        setActiveRoomContext({
                            type: 'message',
                            roomId: roomId,
                            participantName: connection.name,
                            replyMessageId: result.messageId
                        });
                        console.log('📱 Admin message notification sent with message ID:', result.messageId);
                    } else {
                        console.error('❌ Failed to send admin message notification');
                    }
                }).catch(error => {
                    console.error('❌ Failed to send admin message notification:', error);
                });
            }
        }
    });

    socket.on('join-room', (data) => {
        const roomId = parseInt(data.roomId, 10);
        const room = chatRooms.get(roomId);
        if (!room) { socket.emit('room-not-found'); return; }
    
        if (data.isAdmin) {
          socket.join(`room-${roomId}`);
          socket.emit('room-joined', { roomId, messages: room.messages, participant: room.participant });
          return;
        }
    
        const participantName = data.participantName;
        if (!participantName || room.participant?.name !== participantName) {
          socket.emit('room-not-found'); return;
        }
    
        // Cancel grace period if user is reconnecting (not actually leaving)
        if (room.disconnectGracePeriod) {
            room.disconnectGracePeriod = false;
            console.log(`🔍 User ${participantName} reconnected to room ${roomId} - grace period cancelled`);
        }
        
        activeConnections.set(socket.id, { type: 'participant', name: participantName, roomId });
        socket.join(`room-${roomId}`);
        console.log(`🔍 Join-room: Sending ${room.messages.length} messages to participant ${participantName}`);
        console.log(`🔍 Join-room: Room messages:`, room.messages);
        
        socket.emit('room-joined', { 
            roomId, 
            messages: room.messages, 
            participant: room.participant,
            adminStatus: adminStatus
        });
    });

    // Handle participant leaving room
    socket.on('leave-room', () => {
        const connection = activeConnections.get(socket.id);
        if (connection && connection.type === 'participant') {
            const roomId = connection.roomId;
            const room = chatRooms.get(roomId);
            
            if (room) {
                // Mark room as left (not deleted)
                room.status = 'left';
                room.leftAt = new Date().toISOString();
                
                // Add leave message to room
                const leaveMessage = {
                    id: Date.now(),
                    text: `${connection.name} has left the chat room.`,
                    sender: 'System',
                    timestamp: new Date().toISOString(),
                    isAdmin: false
                };
                
                room.messages.push(leaveMessage);
                // saveData(); // Temporarily disabled
                
                // Notify admin
                io.to('admin-room').emit('participant-left', { 
                    roomId, 
                    participant: connection,
                    message: leaveMessage
                });
                
                // Send final conversation summary to Telegram
                const { sendTelegramMessage } = require('./config/telegram');
                const time = new Date().toLocaleTimeString('en-IN', { 
                    timeZone: 'Asia/Kolkata',
                    hour12: true, 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                // Build conversation summary
                let conversationSummary = '';
                if (room.messages && room.messages.length > 0) {
                    // Filter out welcome messages and build clean history
                    const filteredMessages = room.messages.filter(msg => 
                        !msg.text.includes('Welcome to the chat room') && 
                        !msg.text.includes('You have joined the chat room')
                    );
                    
                    if (filteredMessages.length > 0) {
                        conversationSummary = '\n\n📜 <b>Final Conversation Summary:</b>\n';
                        filteredMessages.forEach(msg => {
                            let sender;
                            if (msg.isAdmin) {
                                sender = 'Rajendran';
                            } else if (msg.sender === 'System') {
                                sender = `[${msg.text}]`;
                                conversationSummary += `${sender}\n`;
                                return; // Skip the time and colon for system messages
                            } else {
                                sender = msg.sender;
                            }
                            
                            // Format time as HH:MM AM/PM in IST
                            const msgTime = new Date(msg.timestamp).toLocaleTimeString('en-IN', { 
                                timeZone: 'Asia/Kolkata',
                                hour12: true, 
                                hour: '2-digit', 
                                minute: '2-digit' 
                            });
                            
                            if (msg.sender !== 'System') {
                                conversationSummary += `${sender} (${msgTime}): ${msg.text}\n`;
                            }
                        });
                    }
                }
                
                const leaveNotification = `👋 ${connection.name} from Room ${roomId} left (${time})${conversationSummary}`;
                
                sendTelegramMessage(leaveNotification, process.env.TELEGRAM_CHAT_ID)
                    .then(() => console.log(`📱 Final conversation summary sent: User ${connection.name} left Room ${roomId}`))
                    .catch(error => console.error(`❌ Failed to send final summary:`, error));
                
                console.log(`Participant ${connection.name} left room ${roomId}`);
            }
            
            activeConnections.delete(socket.id);
        }
    });

    // Handle admin room cleanup
    socket.on('cleanup-room', (data) => {
        const connection = activeConnections.get(socket.id);
        if (connection && connection.type === 'admin') {
            const roomId = data.roomId;
            const room = chatRooms.get(roomId);
            
            if (room && room.status === 'left') {
                console.log(`🧹 Cleaning room ${roomId} - deleting completely`);
                console.log(`🧹 Room ${roomId} had ${room.messages.length} messages before deletion`);
                
                // Completely delete the room - fresh start
                chatRooms.delete(roomId);
                
                // Remove from participant mappings
                for (const [participant, mappedRoomId] of participantRooms.entries()) {
                    if (mappedRoomId === roomId) {
                        participantRooms.delete(participant);
                        console.log(`🧹 Removed participant mapping for ${participant}`);
                        break;
                    }
                }
                
                // saveData(); // Temporarily disabled
                console.log(`🧹 Room ${roomId} completely deleted from chatRooms`);
                console.log(`🧹 Current rooms after deletion:`, Array.from(chatRooms.keys()));
                
                // Notify admin that room is completely cleared
                io.to('admin-room').emit('room-cleaned', { 
                    roomId, 
                    message: {
                        id: Date.now(),
                        text: 'Room has been completely cleared and is ready for new participants.',
                        sender: 'System',
                        timestamp: new Date().toISOString(),
                        isAdmin: false
                    }
                });
                
                console.log(`Admin cleaned room ${roomId} - room completely deleted`);
            }
        }
    });

    // Handle admin stop chat request
    socket.on('stop-chat', (data) => {
        const connection = activeConnections.get(socket.id);
        if (connection && connection.type === 'admin') {
            const roomId = data.roomId;
            const room = chatRooms.get(roomId);
            
            if (room && room.status === 'active') {
                console.log(`🚫 Admin stopping chat in room ${roomId}`);
                
                // Send kick message to the participant
                const kickMessage = {
                    id: Date.now(),
                    text: "The admin is not able to continue this conversation any longer. Bye for now!",
                    sender: 'System',
                    timestamp: new Date().toISOString(),
                    isAdmin: false
                };
                
                // Send the kick message to the participant
                io.to(`room-${roomId}`).emit('new-message', kickMessage);
                
                // Update room status to 'left'
                room.status = 'left';
                
                // Notify admin that participant has been kicked
                io.to('admin-room').emit('participant-left', { 
                    roomId, 
                    participant: room.participant,
                    message: {
                        id: Date.now(),
                        text: `This chat has now ended. ${room.participant.name} has been moved out of the room.`,
                        sender: 'System',
                        timestamp: new Date().toISOString(),
                        isAdmin: false
                    }
                });
                
                console.log(`Admin stopped chat in room ${roomId} - participant kicked out`);
            }
        }
    });
    

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('🔌 DISCONNECT EVENT TRIGGERED for socket:', socket.id);
        const connection = activeConnections.get(socket.id);
        console.log('🔌 Connection found:', connection);
        
        if (connection) {
            if (connection.type === 'participant') {
                const roomId = connection.roomId;
                const room = chatRooms.get(roomId);
                console.log(`🔌 Participant ${connection.name} disconnecting from room ${roomId}`);
                console.log(`🔌 Room exists:`, !!room);
                console.log(`🔌 Room status:`, room ? room.status : 'N/A');
                
                // Only add "left" message if room is active (not pending)
                if (room && room.status === 'active') {
                    // Add a grace period to distinguish between page navigation and real leaving
                    // If user reconnects within 5 seconds, don't add "left" message
                    room.disconnectTime = Date.now();
                    room.disconnectGracePeriod = true;
                    
                    // Set a timeout to add the "left" message if user doesn't reconnect
                    setTimeout(() => {
                        const currentRoom = chatRooms.get(roomId);
                        if (currentRoom && currentRoom.disconnectGracePeriod && currentRoom.status === 'active') {
                            // User didn't reconnect, they actually left
                            currentRoom.status = 'left';
                            currentRoom.leftAt = Date.now();
                            
                            // Add leave message to room
                            const leaveMessage = {
                                id: Date.now(),
                                text: `${connection.name} has left the chat room.`,
                                sender: 'System',
                                timestamp: new Date().toISOString(),
                                isAdmin: false
                            };
                            
                            currentRoom.messages.push(leaveMessage);
                            
                            // Notify admin that participant left (so admin can see transcript and clean)
                            console.log(`🔌 EMITTING participant-left event for room ${roomId}`);
                            io.to('admin-room').emit('participant-left', {
                                roomId,
                                participant: connection,
                                message: leaveMessage
                            });

                            // Send Telegram notification with full conversation summary
                            const { sendTelegramMessage } = require('./config/telegram');
                            const time = new Date().toLocaleTimeString('en-IN', { 
                                timeZone: 'Asia/Kolkata',
                                hour12: true, 
                                hour: '2-digit', 
                                minute: '2-digit' 
                            });
                            
                            // Build conversation summary
                            let conversationSummary = '';
                            if (currentRoom.messages && currentRoom.messages.length > 0) {
                                // Filter out welcome messages and build clean history
                                const filteredMessages = currentRoom.messages.filter(msg => 
                                    !msg.text.includes('Welcome to the chat room') && 
                                    !msg.text.includes('You have joined the chat room')
                                );
                                
                                if (filteredMessages.length > 0) {
                                    conversationSummary = '\n\n📜 <b>Final Conversation Summary:</b>\n';
                                    filteredMessages.forEach(msg => {
                                        let sender;
                                        if (msg.isAdmin) {
                                            sender = 'Rajendran';
                                        } else if (msg.sender === 'System') {
                                            sender = `[${msg.text}]`;
                                            conversationSummary += `${sender}\n`;
                                            return; // Skip the time and colon for system messages
                                        } else {
                                            sender = msg.sender;
                                        }
                                        
                                        // Format time as HH:MM AM/PM in IST
                                        const msgTime = new Date(msg.timestamp).toLocaleTimeString('en-IN', { 
                                            timeZone: 'Asia/Kolkata',
                                            hour12: true, 
                                            hour: '2-digit', 
                                            minute: '2-digit' 
                                        });
                                        
                                        if (msg.sender !== 'System') {
                                            conversationSummary += `${sender} (${msgTime}): ${msg.text}\n`;
                                        }
                                    });
                                }
                            }
                            
                            const leaveNotification = `👋 ${connection.name} from Room ${roomId} left (${time})${conversationSummary}`;
                            
                            sendTelegramMessage(leaveNotification, process.env.TELEGRAM_CHAT_ID)
                                .then(() => console.log(`📱 Final conversation summary sent: User ${connection.name} left Room ${roomId}`))
                                .catch(error => console.error(`❌ Failed to send final summary:`, error));
                            
                            console.log(`✅ Participant ${connection.name} actually left room ${roomId} after grace period`);
                        }
                    }, 5000); // 5 second grace period
                    
                    console.log(`🔌 Participant ${connection.name} disconnected from room ${roomId} - grace period started`);
                } else if (room && room.status === 'pending') {
                    // For pending rooms, just clean up without adding "left" message
                    console.log(`🔌 Participant ${connection.name} disconnected from pending room ${roomId} - no "left" message added`);
                } else {
                    console.log(`⚠️ Room ${roomId} not found or not active, skipping participant-left event`);
                }
            }
            activeConnections.delete(socket.id);
        } else {
            console.log('⚠️ No connection found for disconnecting socket');
        }
        console.log('🔌 Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Anonymice server running on port ${PORT}`);
    console.log(`🔐 ADMIN URL: https://web-production-8d6b4.up.railway.app/admin/${ADMIN_URL}`);
    console.log(`🚪 Knock URL: https://web-production-8d6b4.up.railway.app/knock`);
    console.log('='.repeat(80));
});

// Export for testing
module.exports = { app, server, ADMIN_URL }; 