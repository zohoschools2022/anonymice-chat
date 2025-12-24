/**
 * Anonymice Chat Server
 * 
 * This is the main server file for the anonymous chat application.
 * It handles:
 * - Socket.IO connections for real-time chat
 * - Room management (creation, cleanup, reuse)
 * - Admin notifications via Telegram
 * - Message routing between participants and admin
 * - Persistence of chat data
 * 
 * Architecture:
 * - Express server for HTTP endpoints
 * - Socket.IO for WebSocket connections
 * - Telegram Bot API for admin notifications
 * - File-based persistence (chat_data.json)
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

// ============================================================================
// MODULE IMPORTS - External configuration and utility modules
// ============================================================================

// Telegram integration: Send notifications to admin via Telegram
const { sendKnockNotification, sendUserMessageNotification } = require('./config/telegram');

// Telegram webhook handler: Process admin responses from Telegram
const { handleTelegramMessage, setActiveRoomContext, clearActiveRoomContext } = require('./config/telegram-webhook');

// Bot factory: Create and manage Telegram bots for each conversation
const { createBotForRoom, sendMessageWithBot, deleteBotForRoom, getBotInfo } = require('./config/bot-factory');

// Security module: Rate limiting, validation, and security checks
const { 
    SECURITY_CONFIG, 
    checkRateLimit, 
    checkUserRateLimit, 
    validateMessage, 
    validateRoomCreation, 
    validateWebhookRequest, 
    getClientIP 
} = require('./config/security');

// ============================================================================
// BOT MESSAGE HANDLING
// ============================================================================

/**
 * Handle messages from dynamic Telegram bots
 * 
 * This function processes admin responses sent via Telegram bots.
 * Each room has its own bot instance for conversation tracking.
 * 
 * @param {number} roomId - The room ID this message is for
 * @param {object} message - The Telegram message object
 */
function handleDynamicBotMessage(roomId, message) {
    const text = message.text;
    const botInfo = getBotInfo(roomId);
    
    if (!botInfo) {
        console.log(`⚠️ No bot found for Room ${roomId}`);
        return;
    }
    
    console.log(`📱 Processing message for Room ${roomId} from bot @${botInfo.botUsername}`);
    
    // Handle different response types based on message content
    switch (text.toLowerCase().trim()) {
        case 'approve':
            // Admin approved the knock - let user into the chat room
            approveUserForRoom(roomId, botInfo);
            break;
        case 'reject':
            // Admin rejected the knock - send rejection message
            rejectUserForRoom(roomId, botInfo, 'Your request has been rejected.');
            break;
        case 'away':
            // Admin is away - send away message
            rejectUserForRoom(roomId, botInfo, 'The admin is currently away. Please try again later.');
            break;
        default:
            // Custom message or reply to user message
            // Check if message contains keywords for special actions
            if (text.toLowerCase().includes('approve') || text.toLowerCase().includes('reject') || text.toLowerCase().includes('away')) {
                // Handle special cases where keywords are embedded in message
                if (text.toLowerCase().includes('approve')) {
                    approveUserForRoom(roomId, botInfo);
                } else if (text.toLowerCase().includes('reject')) {
                    rejectUserForRoom(roomId, botInfo, 'Your request has been rejected.');
                } else if (text.toLowerCase().includes('away')) {
                    rejectUserForRoom(roomId, botInfo, 'The admin is currently away. Please try again later.');
                }
            } else {
                // Regular message - send to user in the chat room
                sendMessageToUser(roomId, text, botInfo);
            }
            break;
    }
}

// ============================================================================
// ROOM MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Approve a user's knock request and activate their room
 * 
 * When admin approves a knock via Telegram, this function:
 * 1. Changes room status from 'pending' to 'active'
 * 2. Finds the user's socket connection
 * 3. Joins them to the room
 * 4. Sends welcome message
 * 5. Notifies admin interface
 * 
 * @param {number} roomId - The room ID to approve
 * @param {object} botInfo - The bot information for this conversation
 */
function approveUserForRoom(roomId, botInfo) {
    const room = chatRooms.get(roomId);
    if (!room) {
        console.log(`⚠️ Room ${roomId} not found for approval`);
        return;
    }
    
    // Activate the room - change status from 'pending' to 'active'
    room.status = 'active';
    room.lastActivity = Date.now(); // Initialize activity tracking for inactivity timeout
    // Note: We don't enable service globally - keep it disabled for new knocks
    
    // Set up user connection mapping
    const participantName = room.participant.name;
    participantRooms.set(participantName, roomId); // Map participant name to room ID
    
    // Find the socket connection for this room
    // We need to find the socket that belongs to this room's participant
    const socket = Array.from(io.sockets.sockets.values()).find(s => {
        const connection = activeConnections.get(s.id);
        return connection && connection.roomId === roomId;
    });
    
    if (socket) {
        // Join the socket to the room's Socket.IO room
        socket.join(`room-${roomId}`);
        
        // Update the connection record
        activeConnections.set(socket.id, {
            type: 'participant',
            name: participantName,
            roomId: roomId
        });
        
        // Add welcome message to the room's message history
        const welcomeMessage = {
            id: Date.now(),
            text: `Welcome ${participantName}! You can now chat with Rajendran D.`,
            sender: 'System',
            timestamp: new Date().toISOString(),
            isAdmin: false
        };
        room.messages.push(welcomeMessage);
        
        // Notify admin interface that a new participant joined
        io.to('admin-room').emit('new-participant', {
            roomId,
            participant: { name: participantName }
        });
        
        // Send approval notification to the user's socket
        socket.emit('knock-approved', { roomId });
        
        console.log(`✅ Approved ${participantName} for Room ${roomId} via bot @${botInfo.botUsername}`);
    }
}

/**
 * Reject a user's knock request
 * 
 * When admin rejects a knock via Telegram, this function:
 * 1. Finds the user's socket connection
 * 2. Sends rejection message to user
 * 3. Deletes the room completely
 * 4. Deletes the bot for this room
 * 
 * @param {number} roomId - The room ID to reject
 * @param {object} botInfo - The bot information for this conversation
 * @param {string} message - The rejection message to send to user
 */
function rejectUserForRoom(roomId, botInfo, message) {
    const room = chatRooms.get(roomId);
    if (!room) {
        console.log(`⚠️ Room ${roomId} not found for rejection`);
        return;
    }
    
    // Find the socket connection for this room
    const socket = Array.from(io.sockets.sockets.values()).find(s => {
        const connection = activeConnections.get(s.id);
        return connection && connection.roomId === roomId;
    });
    
    if (socket) {
        // Send rejection message to user
        socket.emit('knock-rejected', { message, roomId });
        console.log(`❌ Rejected user for Room ${roomId} via bot @${botInfo.botUsername}: ${message}`);
    }
    
    // Clean up the room and bot completely
    // This frees up the room number for reuse
    chatRooms.delete(roomId);
    deleteBotForRoom(roomId);
}

/**
 * Clean up a room after user leaves (delete completely to free up room number)
 * 
 * This is a critical function for room number reuse. When a user leaves:
 * 1. Remove participant mapping (so name can be reused)
 * 2. Delete the Telegram bot for this room
 * 3. Delete the room from chatRooms Map (frees up room number)
 * 4. Save data to persistence (excluding this deleted room)
 * 
 * IMPORTANT: This function completely removes the room, allowing the room number
 * to be reused by the next user. Without this, room numbers would increment indefinitely.
 * 
 * @param {number|string} roomId - The room ID to clean up (can be number for sequential or string for timestamp-based)
 */
function cleanupRoom(roomId) {
    const room = chatRooms.get(roomId);
    if (!room) {
        console.log(`⚠️ Room ${roomId} not found for cleanup (may already be deleted)`);
        return;
    }
    
    console.log(`🧹 Cleaning up room ${roomId} (status: ${room.status})`);
    console.log(`🧹 Room ${roomId} exists in Map before cleanup:`, chatRooms.has(roomId));
    
    // Remove from participant mappings
    // This allows the participant name to be reused by another user
    for (const [participant, mappedRoomId] of participantRooms.entries()) {
        if (mappedRoomId === roomId) {
            participantRooms.delete(participant);
            console.log(`🧹 Removed participant mapping for ${participant} -> Room ${roomId}`);
            break;
        }
    }
    
    // Delete the Telegram bot for this room
    // This cleans up the bot instance and conversation tracking
    deleteBotForRoom(roomId);
    
    // Completely delete the room from the Map
    // This is the key step that frees up the room number for reuse
    const deleted = chatRooms.delete(roomId);
    
    // Verify deletion
    if (chatRooms.has(roomId)) {
        console.error(`❌ CRITICAL: Room ${roomId} still exists in Map after delete() call!`);
        // Force delete again
        chatRooms.delete(roomId);
        if (chatRooms.has(roomId)) {
            console.error(`❌ CRITICAL: Room ${roomId} STILL exists after second delete attempt!`);
        }
    } else {
        console.log(`✅ Room ${roomId} successfully deleted from Map`);
    }
    
    // Save data to persistence
    // Note: saveData() filters out 'left' and 'cleaned' rooms, so this won't be saved
    saveData();
    console.log(`🧹 Room ${roomId} cleanup complete. Room number is now available for reuse.`);
    console.log(`🧹 Current total rooms in Map: ${chatRooms.size}`);
}

// Kick user due to inactivity (5 minutes)
function kickInactiveUser(roomId) {
    const room = chatRooms.get(roomId);
    if (!room || room.status !== 'active') {
        return; // Room doesn't exist or is not active
    }
    
    const participantName = room.participant?.name || 'Unknown';
    console.log(`⏰ Kicking inactive user ${participantName} from Room ${roomId} (5 minutes of inactivity)`);
    
    // Send bye message to user
    const byeMessage = {
        id: Date.now(),
        text: "You have been inactive for 5 minutes. The conversation has been closed.",
        sender: 'System',
        timestamp: new Date().toISOString(),
        isAdmin: false
    };
    room.messages.push(byeMessage);
    io.to(`room-${roomId}`).emit('new-message', byeMessage);
    
    // Mark room as left
    room.status = 'left';
    room.leftAt = Date.now();
    
    // Build and send final summary to Telegram (only actual conversation messages)
    const { sendFinalConversationSummary } = require('./config/telegram');
    
    let conversationSummary = '';
    if (room.messages && room.messages.length > 0) {
        // Filter out system messages, welcome messages, and other non-conversation messages
        const filteredMessages = room.messages.filter(msg => 
            msg.sender !== 'System' && 
            !msg.text.includes('Welcome') && 
            !msg.text.includes('has left') &&
            !msg.text.includes('has been inactive') &&
            !msg.text.includes('not able to continue')
        );
        
        if (filteredMessages.length > 0) {
            conversationSummary = '\n\n📜 <b>Final Conversation Summary:</b>\n';
            filteredMessages.forEach(msg => {
                const sender = msg.isAdmin ? 'Rajendran' : msg.sender;
                const msgTime = new Date(msg.timestamp).toLocaleTimeString('en-IN', { 
                    timeZone: 'Asia/Kolkata', 
                    hour12: true, 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                conversationSummary += `${sender} (${msgTime}): ${msg.text}\n`;
            });
        }
    }
    
    // Send final summary and delete all intermediate messages
    sendFinalConversationSummary(participantName, roomId, conversationSummary)
        .then(() => console.log(`📱 Final summary sent and intermediate messages deleted: ${participantName} Room ${roomId} (inactivity)`))
        .catch(error => console.error(`❌ Failed to send final summary:`, error));
    
    // Notify admin interface
    io.to('admin-room').emit('participant-left', { 
        roomId, 
        participant: room.participant,
        message: byeMessage
    });
    
    // Clean up the room after a short delay (30 seconds) to allow admin to see the summary
    setTimeout(() => {
        cleanupRoom(roomId);
    }, 30000); // 30 second delay before cleanup
}

// Check for inactive users and kick them
function checkInactiveUsers() {
    const now = Date.now();
    const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    for (let [roomId, room] of chatRooms) {
        if (room.status === 'active' && room.lastActivity) {
            const timeSinceActivity = now - room.lastActivity;
            if (timeSinceActivity >= INACTIVITY_TIMEOUT) {
                kickInactiveUser(roomId);
            }
        }
    }
}

// Send message to user
function sendMessageToUser(roomId, message, botInfo) {
    const room = chatRooms.get(roomId);
    if (!room) {
        console.log(`⚠️ Room ${roomId} not found for message`);
        return;
    }
    
    // Update last activity timestamp (admin message counts as activity)
    room.lastActivity = Date.now();
    
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

// ============================================================================
// SERVER INITIALIZATION
// ============================================================================

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO for real-time bidirectional communication
// This enables WebSocket connections for instant messaging
// Configure CORS to allow connections from any origin (needed for Railway deployment)
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'] // Support both WebSocket and polling
});
console.log('📡 Socket.IO initialized with CORS enabled');

// ============================================================================
// ADMIN CONFIGURATION
// ============================================================================

/**
 * Generate a secure, random admin URL
 * This creates a long hex string that's hard to guess
 * Used to protect the admin interface from unauthorized access
 */
const generateAdminUrl = () => {
    return crypto.randomBytes(32).toString('hex');
};

const ADMIN_URL = generateAdminUrl(); // Random URL generated on each server restart
const ADMIN_NAME = "Rajendran D"; // Admin's display name

// ============================================================================
// STATE MANAGEMENT - In-Memory Data Structures
// ============================================================================

/**
 * chatRooms: Map<roomId, roomObject>
 * Stores all active and pending chat rooms
 * Room object structure:
 *   - id: string (timestamp-based room ID: ddmmyyhhmmssXXX format)
 *   - participant: { name: string }
 *   - messages: Array<messageObject>
 *   - status: 'pending' | 'active' | 'left' | 'cleaned'
 *   - created: timestamp
 *   - lastActivity: timestamp (for inactivity timeout)
 *   - lastTelegramMessageId: number (for message deletion)
 */
const chatRooms = new Map();

/**
 * activeConnections: Map<socketId, connectionInfo>
 * Tracks all active Socket.IO connections
 * Connection info structure:
 *   - type: 'admin' | 'participant'
 *   - name: string (participant name or admin name)
 *   - roomId: string (for participants - timestamp-based format: ddmmyyhhmmssXXX)
 */
const activeConnections = new Map();

/**
 * participantRooms: Map<participantName, roomId>
 * Maps participant names to their room IDs
 * Used to prevent duplicate knocks and find rooms by participant name
 */
const participantRooms = new Map();

/**
 * Room ID Generation - Sequential numbering with reuse
 * 
 * Finds the next available sequential room number (1, 2, 3, ...)
 * Reuses room numbers from cleaned/left rooms to prevent infinite incrementing
 * 
 * Algorithm:
 * 1. First, clean up any 'left' or 'cleaned' rooms that might still be in memory
 * 2. Find the lowest available room number by checking existing rooms
 * 3. If all numbers up to current max are taken, use max + 1
 * 
 * This ensures:
 * - Room numbers are reused when possible (efficient)
 * - Room numbers increment only when necessary (no gaps)
 * - No upper limit (can go as high as needed)
 */
function generateRoomId() {
    // First, clean up any 'left' or 'cleaned' rooms that might still be in memory
    // This ensures we can reuse their numbers
    const roomsToClean = [];
    for (let [roomId, room] of chatRooms) {
        if (room.status === 'left' || room.status === 'cleaned') {
            roomsToClean.push(roomId);
        }
    }
    
    // Clean up these rooms
    for (const roomId of roomsToClean) {
        const room = chatRooms.get(roomId);
        const status = room ? room.status : 'unknown';
        console.log(`🧹 Pre-cleanup: Removing ${status} room ${roomId} before finding available room`);
        cleanupRoom(roomId);
    }
    
    // Find the lowest available room number
    // Start from 1 and find the first number that's not in use
    let roomId = 1;
    const maxAttempts = 10000; // Upper limit: 10,000 rooms (safety limit - should never be reached in practice)
    let attempts = 0;
    
    while (chatRooms.has(roomId) && attempts < maxAttempts) {
        roomId++;
        attempts++;
    }
    
    if (attempts >= maxAttempts) {
        console.error('❌ CRITICAL: Could not find available room number after 10000 attempts!');
        // Fallback: use timestamp-based ID
        return `fallback-${Date.now()}`;
    }
    
    console.log(`🆕 Generated sequential room ID: ${roomId} (total rooms: ${chatRooms.size})`);
    return roomId;
}

// ============================================================================
// ADMIN STATUS TRACKING
// ============================================================================

/**
 * adminStatus: Tracks whether admin is active or away
 * Used to show admin presence in the chat interface
 */
let adminStatus = { isActive: true, lastUpdate: new Date().toISOString() };

/**
 * serviceEnabled: Global service toggle
 * When false, new knocks are queued for approval
 * When true, new knocks are automatically approved
 * Default: false (requires manual approval)
 */
let serviceEnabled = false;

/**
 * sleepUntil: Sleep mode timestamp
 * When set, knocks are blocked until this time
 * 0 means sleep mode is not active
 * Used when admin wants to temporarily disable new knocks
 */
let sleepUntil = 0; // epoch ms; 0 means not sleeping

// ============================================================================
// PERSISTENCE CONFIGURATION
// ============================================================================

/**
 * DATA_FILE: Path to the persistence file
 * Stores chat rooms and participant mappings to disk
 * Allows data to survive server restarts
 */
const DATA_FILE = path.join(__dirname, 'chat_data.json');

/**
 * Load existing data from persistence file on server startup
 * 
 * This function:
 * 1. Reads chat_data.json if it exists
 * 2. Restores only 'active' and 'pending' rooms (skips 'left' and 'cleaned')
 * 3. Restores participant mappings (only for rooms that still exist)
 * 4. Initializes missing fields for backward compatibility
 * 
 * IMPORTANT: We intentionally skip 'left' and 'cleaned' rooms to prevent
 * "ghost rooms" from persisting. This ensures room numbers can be reused.
 */
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            console.log('📂 Loading existing chat data...');
            
            // Restore chat rooms - ONLY active and pending rooms (skip 'left' and 'cleaned' rooms)
            // This prevents "ghost" rooms from persisting after users leave
            if (data.chatRooms) {
                let loadedCount = 0;
                let skippedCount = 0;
                
                data.chatRooms.forEach(([roomId, room]) => {
                    // Skip rooms that should have been cleaned up
                    if (room.status === 'left' || room.status === 'cleaned') {
                        skippedCount++;
                        console.log(`⏭️ Skipping ${room.status} room ${roomId} (should be cleaned up)`);
                        return; // Don't restore this room
                    }
                    
                    // Only restore active or pending rooms
                    if (room.status === 'active' || room.status === 'pending') {
                        // Ensure lastActivity is set for active rooms (migration for old data)
                        if (room.status === 'active' && !room.lastActivity) {
                            room.lastActivity = Date.now();
                        }
                        // Ensure lastTelegramMessageId is initialized (migration for old data)
                        if (!room.hasOwnProperty('lastTelegramMessageId')) {
                            room.lastTelegramMessageId = null;
                        }
                        chatRooms.set(roomId, room);
                        loadedCount++;
                    } else {
                        skippedCount++;
                        console.log(`⏭️ Skipping room ${roomId} with unknown status: ${room.status}`);
                    }
                });
                
                console.log(`📂 Loaded ${loadedCount} active/pending rooms, skipped ${skippedCount} left/cleaned rooms`);
            }
            
            // Restore participant mappings - but only for rooms that still exist
            if (data.participantRooms) {
                let loadedMappings = 0;
                let skippedMappings = 0;
                
                data.participantRooms.forEach(([participant, roomId]) => {
                    // Only restore mapping if the room still exists in chatRooms
                    if (chatRooms.has(roomId)) {
                        participantRooms.set(participant, roomId);
                        loadedMappings++;
                    } else {
                        skippedMappings++;
                        console.log(`⏭️ Skipping participant mapping for ${participant} -> Room ${roomId} (room no longer exists)`);
                    }
                });
                
                console.log(`📂 Loaded ${loadedMappings} participant mappings, skipped ${skippedMappings} orphaned mappings`);
            }
        }
    } catch (error) {
        console.log('📂 No existing data found or error loading:', error.message);
    }
}

/**
 * Save current state to persistence file
 * 
 * This function:
 * 1. Filters out 'left' and 'cleaned' rooms before saving
 * 2. Saves only 'active' and 'pending' rooms
 * 3. Saves participant mappings
 * 4. Writes to chat_data.json
 * 
 * IMPORTANT: We intentionally exclude 'left' and 'cleaned' rooms to prevent
 * "ghost rooms" from persisting. This ensures:
 * - Room numbers can be reused
 * - No stale data accumulates
 * - Clean state on server restart
 */
function saveData() {
    try {
        // Filter out 'left' and 'cleaned' rooms before saving
        // This ensures they don't get restored on next startup
        const roomsToSave = Array.from(chatRooms.entries()).filter(([roomId, room]) => {
            return room.status === 'active' || room.status === 'pending';
        });
        
        const data = {
            chatRooms: roomsToSave,
            participantRooms: Array.from(participantRooms.entries()),
            timestamp: new Date().toISOString()
        };
        
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        
        const savedCount = roomsToSave.length;
        const totalCount = chatRooms.size;
        if (savedCount < totalCount) {
            console.log(`💾 Saved ${savedCount} active/pending rooms (${totalCount - savedCount} left/cleaned rooms excluded from persistence)`);
        } else {
            console.log('💾 Chat data saved successfully');
        }
    } catch (error) {
        console.log('❌ Error saving chat data:', error.message);
    }
}

// Load data on startup
loadData();
console.log('📂 File persistence enabled');

// Test endpoint to verify server is running
// IMPORTANT: Register this BEFORE static middleware to ensure it's matched
app.get('/test', (req, res) => {
    console.log('🧪 /test endpoint hit!');
    console.log('🧪 Request method:', req.method);
    console.log('🧪 Request path:', req.path);
    console.log('🧪 Request URL:', req.url);
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        rooms: chatRooms.size,
        serviceEnabled: serviceEnabled,
        message: 'Server is running with latest code',
        version: '20250101-route-before-static',
        socketIoConnected: io ? 'YES' : 'NO',
        activeConnections: io ? io.sockets.sockets.size : 0
    });
});
console.log('✅ /test route registered');

// Socket.IO connection test endpoint
app.get('/socket-test', (req, res) => {
    console.log('🔌 /socket-test endpoint hit - checking Socket.IO status');
    res.json({
        socketIoInitialized: io ? 'YES' : 'NO',
        activeConnections: io ? io.sockets.sockets.size : 0,
        serverUrl: req.protocol + '://' + req.get('host'),
        message: 'Socket.IO server is running. Check browser console for client connection status.'
    });
});
console.log('✅ /socket-test route registered');

// Serve static files (after specific routes)
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

// Admin: set sleep window in minutes (blocks new knocks)
// Usage: POST /admin/sleep { minutes: 60 }  with header X-Admin-Secret: <ADMIN_SECRET>
app.post('/admin/sleep', express.json(), (req, res) => {
    const adminSecret = req.headers['x-admin-secret'];
    if (process.env.ADMIN_SECRET && adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    const minutes = parseInt(req.body?.minutes, 10) || 60;
    const now = Date.now();
    sleepUntil = now + minutes * 60 * 1000;
    console.log(`😴 Sleep mode enabled for ${minutes} minutes (until ${new Date(sleepUntil).toISOString()})`);
    return res.json({ ok: true, sleep_until: new Date(sleepUntil).toISOString() });
});

// Admin: clear sleep window
app.post('/admin/sleep/clear', (req, res) => {
    const adminSecret = req.headers['x-admin-secret'];
    if (process.env.ADMIN_SECRET && adminSecret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    sleepUntil = 0;
    console.log('😴 Sleep mode cleared');
    return res.json({ ok: true });
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
    // Any admin message implies presence online; broadcast to active rooms
    for (let [roomId, room] of chatRooms) {
        io.to(`room-${roomId}`).emit('admin-presence', { status: 'online', admin: ADMIN_NAME });
    }
    console.log(`📱 Response from admin notification handler:`, JSON.stringify(response, null, 2));
    
    // Process the response if it's successful
    if (response && response.success) {
        console.log('📱 Processing admin response:', response);
        
        // Process the response based on action
        const { sendTelegramMessage } = require('./config/telegram');
        switch (response.action) {
            case 'approve':
                // Approve the knock
                if (response.socketId) {
                    const socket = io.sockets.sockets.get(response.socketId);
                    const room = chatRooms.get(response.roomId);
                    
                    if (socket && room) {
                        // Activate the room
                        room.status = 'active';
                        room.lastActivity = Date.now(); // Initialize activity tracking
                        
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
                console.log(`📱 Attempting to reject knock for ${response.participantName} in Room ${response.roomId}`);
                console.log(`📱 Socket ID: ${response.socketId}`);
                
                if (response.socketId) {
                    const socket = io.sockets.sockets.get(response.socketId);
                    if (socket) {
                        socket.emit('knock-rejected', { 
                            message: response.message,
                            roomId: response.roomId 
                        });
                        console.log(`❌ Rejected knock for ${response.participantName}: ${response.message}`);
                    } else {
                        console.log(`⚠️ Socket ${response.socketId} not found - user may have disconnected`);
                        // Clean up the pending knock and room since socket is not available
                        clearActiveRoomContext(response.roomId);
                        // Also clean up the room from chatRooms
                        const room = chatRooms.get(response.roomId);
                        if (room && room.status === 'pending') {
                            chatRooms.delete(response.roomId);
                            console.log(`🗑️ Cleaned up pending room ${response.roomId} after socket disconnect`);
                        }
                    }
                } else {
                    console.log(`⚠️ No socket ID provided for rejection`);
                }
                break;
                
            case 'nudge': {
                // Send nudge message to everyone in the room to ensure delivery even if user hasn't sent a message yet
                const context = response.context || response;
                console.log(`📱 Sending nudge to Room ${context.roomId} (participant: ${context.participantName})`);

                const nudgeMessage = {
                    id: Date.now(),
                    text: "Hello! I'm here and ready to help. What would you like to discuss?",
                    sender: 'System',
                    timestamp: new Date().toISOString(),
                    isAdmin: false
                };

                // Broadcast to the room
                io.to(`room-${context.roomId}`).emit('nudge-message', nudgeMessage);
                console.log(`👋 Nudge broadcast to room-${context.roomId}: ${nudgeMessage.text}`);
                break;
            }

            // (removed) typing indicator case
                
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
                        saveData();
                        
                        // Send to user in the room
                        console.log(`📤 Broadcasting admin message to room-${response.roomId}:`, adminMessage);
                        io.to(`room-${response.roomId}`).emit('new-message', adminMessage);
                        
                        // Also notify admin interface
                        io.to('admin-room').emit('admin-message', { roomId: response.roomId, message: adminMessage });
                        
                        console.log(`📤 Admin response sent to Room ${response.roomId}: ${response.message}`);
                    } else {
                        console.log(`⚠️ Room ${response.roomId} not found for admin reply`);
                    }
                    break;
                    
                case 'close':
                case 'kick': {
                    // Close the conversation (explicitly kicked by admin)
                    const ctx = response.context || response;
                    const roomToClose = chatRooms.get(ctx.roomId);
                    if (roomToClose) {
                        // Send polite bye message to user
                        const byeMessage = {
                            id: Date.now(),
                            text: "The admin is not able to continue this conversation any longer. Thank you for chatting!",
                            sender: 'System',
                            timestamp: new Date().toISOString(),
                            isAdmin: false
                        };
                        roomToClose.messages.push(byeMessage);
                        io.to(`room-${ctx.roomId}`).emit('new-message', byeMessage);

                        // Build and send final summary to Telegram (only actual conversation messages)
                        const { sendFinalConversationSummary } = require('./config/telegram');
                        const participantName = roomToClose.participant?.name || 'Unknown';

                        let conversationSummary = '';
                        if (roomToClose.messages && roomToClose.messages.length > 0) {
                            // Filter out system messages, welcome messages, and other non-conversation messages
                            const filteredMessages = roomToClose.messages.filter(msg => 
                                msg.sender !== 'System' && 
                                !msg.text.includes('Welcome') && 
                                !msg.text.includes('has left') &&
                                !msg.text.includes('has been inactive') &&
                                !msg.text.includes('not able to continue')
                            );
                            
                            if (filteredMessages.length > 0) {
                                conversationSummary = '\n\n📜 <b>Final Conversation Summary:</b>\n';
                                filteredMessages.forEach(msg => {
                                    const sender = msg.isAdmin ? 'Rajendran' : msg.sender;
                                    const msgTime = new Date(msg.timestamp).toLocaleTimeString('en-IN', { 
                                        timeZone: 'Asia/Kolkata', 
                                        hour12: true, 
                                        hour: '2-digit', 
                                        minute: '2-digit' 
                                    });
                                    conversationSummary += `${sender} (${msgTime}): ${msg.text}\n`;
                                });
                            }
                        }
                        
                        // Send final summary and delete all intermediate messages
                        sendFinalConversationSummary(participantName, ctx.roomId, conversationSummary)
                            .then(() => console.log(`📱 Final summary sent and intermediate messages deleted: ${participantName} Room ${ctx.roomId} (kicked)`))
                            .catch(error => console.error(`❌ Failed to send final summary (kick):`, error));

                        // Mark room as left first, then clean up after a delay
                        roomToClose.status = 'left';
                        roomToClose.leftAt = Date.now();
                        
                        // Notify admin interface
                        io.to('admin-room').emit('room-closed', { roomId: ctx.roomId });

                        // Clean up the room after a short delay (30 seconds) to allow admin to see the summary
                        setTimeout(() => {
                            cleanupRoom(ctx.roomId);
                        }, 30000); // 30 second delay before cleanup
                        
                        console.log(`🔒 Room ${ctx.roomId} closed by admin (kick), will be cleaned up in 30 seconds`);
                    }
                    break;
                }
                    
            case 'sleep_set':
                    // Set sleep time
                    if (response.minutes && response.minutes > 0) {
                        serviceSleepUntil = new Date(Date.now() + (response.minutes * 60 * 1000));
                        console.log(`😴 Sleep time set for ${response.minutes} minutes until ${serviceSleepUntil.toLocaleString()}`);
                        
                        // Send confirmation to Telegram
                        sendTelegramMessage(`😴 Sleep mode activated for ${response.minutes} minutes.\n⏰ Will resume at ${serviceSleepUntil.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}`);
                    // Broadcast admin presence as away
                    io.to('admin-room').emit('admin-presence', { status: 'away', admin: ADMIN_NAME });
                    for (let [roomId, room] of chatRooms) {
                        io.to(`room-${roomId}`).emit('admin-presence', { status: 'away', admin: ADMIN_NAME });
                    }
                    }
                    break;
                    
            case 'sleep_clear':
                    // Clear sleep time
                    serviceSleepUntil = null;
                    console.log('😴 Sleep time cleared - service is now active');
                    
                    // Send confirmation to Telegram
                    sendTelegramMessage('😴 Sleep mode cleared - service is now active!');
                // Broadcast admin presence as online
                io.to('admin-room').emit('admin-presence', { status: 'online', admin: ADMIN_NAME });
                for (let [roomId, room] of chatRooms) {
                    io.to(`room-${roomId}`).emit('admin-presence', { status: 'online', admin: ADMIN_NAME });
                }
                    break;
                    
                case 'sleep_status':
                    // Check sleep status
                    if (serviceSleepUntil) {
                        const remainingMinutes = Math.ceil((serviceSleepUntil - new Date()) / (60 * 1000));
                        sendTelegramMessage(`😴 Sleep mode is active.\n⏰ ${remainingMinutes} minutes remaining until ${serviceSleepUntil.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}`);
                    } else {
                        sendTelegramMessage('😴 Sleep mode is not active - service is running normally.');
                    }
                    break;
                    
                case 'status':
                    // Show room statistics
                    const totalRooms = chatRooms.size;
                    const activeRooms = Array.from(chatRooms.values()).filter(room => room.status === 'active').length;
                    const pendingRooms = Array.from(chatRooms.values()).filter(room => room.status === 'pending').length;
                    const leftRooms = Array.from(chatRooms.values()).filter(room => room.status === 'left').length;
                    const cleanedRooms = Array.from(chatRooms.values()).filter(room => room.status === 'cleaned').length;
                    
                    const statusMessage = `📊 <b>Room Status Report</b>\n\n` +
                        `🏠 <b>Total Rooms:</b> ${totalRooms} (unlimited)\n` +
                        `🟢 <b>Active:</b> ${activeRooms}\n` +
                        `⏳ <b>Pending:</b> ${pendingRooms}\n` +
                        `🚪 <b>Left:</b> ${leftRooms}\n` +
                        `🧹 <b>Cleaned:</b> ${cleanedRooms}\n\n` +
                        `💬 <b>Actively Engaged:</b> ${activeRooms} room${activeRooms !== 1 ? 's' : ''}`;
                    
                    sendTelegramMessage(statusMessage);
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
console.log('📡 Socket.IO server initialized and listening for connections...');
console.log('📡 Socket.IO CORS: Enabled for all origins');
console.log('📡 Socket.IO transports: websocket, polling');

// Log connection attempts (even failed ones)
io.engine.on('connection_error', (err) => {
    console.error('❌ Socket.IO connection error:', err);
    console.error('❌ Error details:', err.message, err.stack);
});

io.on('connection', (socket) => {
    console.log('🔌 ========== NEW SOCKET CONNECTION ==========');
    console.log('🔌 Socket ID:', socket.id);
    console.log('🔌 Socket connected:', socket.connected);
    console.log('🔌 Total active connections:', io.sockets.sockets.size);
    console.log('🔌 Socket handshake:', {
        address: socket.handshake.address,
        headers: socket.handshake.headers,
        query: socket.handshake.query,
        url: socket.handshake.url
    });
    console.log('🔌 Socket transport:', socket.conn.transport.name);

    // Log all socket events for debugging
    const originalEmit = socket.emit;
    socket.emit = function(event, ...args) {
        console.log(`📤 [Socket ${socket.id}] Emitting event: ${event}`, args.length > 0 ? JSON.stringify(args[0]).substring(0, 100) : '');
        return originalEmit.apply(this, [event, ...args]);
    };
    
    // Log socket disconnection
    socket.on('disconnect', (reason) => {
        console.log(`🔌 Socket ${socket.id} disconnected. Reason: ${reason}`);
    });
    
    // Handle admin connection
    socket.on('admin-connect', () => {
        console.log('🔐 Admin connecting with socket ID:', socket.id);
        activeConnections.set(socket.id, { type: 'admin', name: ADMIN_NAME });
        socket.join('admin-room');
        
        // Verify admin joined the room
        const adminRoom = io.sockets.adapter.rooms.get('admin-room');
        console.log('👥 Admin joined admin-room. Total users in admin-room:', adminRoom ? adminRoom.size : 0);
        
        // Send current rooms with full data
        // Room IDs are now strings (timestamp-based), so no need to parseInt
        const currentRooms = Array.from(chatRooms.entries()).map(([roomId, room]) => ({
            roomId: roomId, // Keep as string (timestamp-based format)
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

    // Handle participant knock - COMPLETE REWRITE: Simple, bulletproof logic
    // Register knock handler - this MUST happen for every connection
    console.log('📝 Registering knock handler for socket:', socket.id);
    console.log('📝 Handler registration timestamp:', new Date().toISOString());
    
    socket.on('knock', (data) => {
        console.log('🔔 ========== KNOCK RECEIVED ==========');
        console.log('🔔 Socket ID:', socket.id);
        console.log('🔔 Socket connected:', socket.connected);
        console.log('🔔 Data received:', JSON.stringify(data));
        console.log('🔔 Data type:', typeof data);
        console.log('🔔 Data keys:', data ? Object.keys(data) : 'null');
        
        // CRITICAL: Send acknowledgment immediately to prove handler is running
        try {
            socket.emit('knock-acknowledged', { received: true, timestamp: Date.now() });
            console.log('✅ Sent immediate acknowledgment to client');
        } catch (ackErr) {
            console.error('❌ CRITICAL: Failed to send acknowledgment:', ackErr);
            console.error('❌ Acknowledgment error stack:', ackErr.stack);
        }
        
        let participantName = null;
        let roomId = null;
        let clientResponseSent = false;
        
        // Helper function to ensure client always gets a response
        const sendClientResponse = (event, payload) => {
            if (clientResponseSent) {
                console.log(`⚠️ Client response already sent, skipping ${event}`);
                return;
            }
            try {
                console.log(`📤 ATTEMPTING TO SEND: ${event}`, JSON.stringify(payload));
                socket.emit(event, payload);
                clientResponseSent = true;
                console.log(`✅ CLIENT RESPONSE SENT: ${event}`, JSON.stringify(payload));
            } catch (err) {
                console.error(`❌ Failed to send ${event} to client:`, err);
                console.error(`❌ Error details:`, err.message, err.stack);
            }
        };
        
        // CRITICAL: Send response IMMEDIATELY - before any validation or processing
        // This ensures the client knows we received the knock, even if something fails later
        console.log('🚨 SENDING IMMEDIATE RESPONSE TO CLIENT...');
        try {
            // Generate sequential room ID (finds next available number)
            // Wrap in try-catch to handle any errors
            try {
                roomId = generateRoomId();
                console.log(`✅ Generated room ID: ${roomId}`);
            } catch (roomIdError) {
                console.error('❌ Failed to generate room ID:', roomIdError);
                // Fallback: use a simple incrementing counter
                let fallbackId = 1;
                while (chatRooms.has(fallbackId) && fallbackId < 10000) {
                    fallbackId++;
                }
                if (fallbackId >= 10000) {
                    // Last resort: use timestamp
                    roomId = `fallback-${Date.now()}`;
                } else {
                    roomId = fallbackId;
                }
                console.log(`✅ Using fallback room ID: ${roomId}`);
            }
            
            participantName = (data && data.name) ? String(data.name).trim() : `Anonymous${Math.floor(Math.random() * 1000)}`;
            
            // Create room immediately
            const tempRoom = {
                id: roomId,
                participant: { name: participantName },
                messages: [],
                status: serviceEnabled ? 'active' : 'pending',
                created: Date.now(),
                lastActivity: Date.now(),
                lastTelegramMessageId: null
            };
            chatRooms.set(roomId, tempRoom);
            participantRooms.set(participantName, roomId);
            activeConnections.set(socket.id, {
                type: 'participant',
                name: participantName,
                roomId: roomId
            });
            socket.join(`room-${roomId}`);
            
            console.log(`✅ Room ${roomId} created for ${participantName} (status: ${tempRoom.status})`);
            
            // Send response IMMEDIATELY - this MUST succeed
            try {
                if (serviceEnabled) {
                    const welcomeMessage = {
                        id: Date.now(),
                        text: `Welcome ${participantName}! You can now chat with Rajendran D.`,
                        sender: 'System',
                        timestamp: new Date().toISOString(),
                        isAdmin: false
                    };
                    tempRoom.messages.push(welcomeMessage);
                    saveData();
                    
                    socket.emit('room-assigned', { roomId, name: participantName });
                    console.log(`✅ IMMEDIATE RESPONSE SENT: room-assigned for room ${roomId}`);
                } else {
                    socket.emit('knock-pending', { 
                        message: "Knock received! Waiting for admin approval...",
                        roomId: roomId
                    });
                    console.log(`✅ IMMEDIATE RESPONSE SENT: knock-pending for room ${roomId}`);
                }
                clientResponseSent = true;
            } catch (emitError) {
                console.error('❌ CRITICAL: Failed to emit response:', emitError);
                // Last resort: try to send ANY response
                try {
                    socket.emit('knock-pending', { 
                        message: "Knock received! Processing...",
                        roomId: roomId || 'unknown'
                    });
                    clientResponseSent = true;
                    console.log('✅ Fallback response sent');
                } catch (fallbackError) {
                    console.error('❌ CRITICAL: Even fallback response failed:', fallbackError);
                }
            }
            
            // Now continue with validation and Telegram notification in background
            console.log('✅ Client response sent, continuing with background processing...');
        } catch (immediateError) {
            console.error('❌ CRITICAL: Failed to send immediate response:', immediateError);
            console.error('❌ Error stack:', immediateError.stack);
            // Last resort: send error response
            try {
                socket.emit('knock-rejected', { 
                    message: 'System error: Failed to create room. Please try again.',
                    roomId: null
                });
                clientResponseSent = true;
            } catch (finalError) {
                console.error('❌ CRITICAL: Could not send any response to client:', finalError);
            }
        }
        
        // Continue with validation and cleanup (room already created above)
        try {
            const clientIP = socket.handshake.address;
            
            // Room should already be created above, but if not, create it now
            if (!roomId) {
                console.log('⚠️ Room not created in immediate response, creating now...');
                roomId = generateRoomId();
                participantName = (data && data.name) ? String(data.name).trim() : `Anonymous${Math.floor(Math.random() * 1000)}`;
                
                const newRoom = {
                    id: roomId,
                    participant: { name: participantName },
                    messages: [],
                    status: serviceEnabled ? 'active' : 'pending',
                    created: Date.now(),
                    lastActivity: Date.now(),
                    lastTelegramMessageId: null
                };
                chatRooms.set(roomId, newRoom);
                participantRooms.set(participantName, roomId);
                activeConnections.set(socket.id, {
                    type: 'participant',
                    name: participantName,
                    roomId: roomId
                });
                socket.join(`room-${roomId}`);
                
                if (!clientResponseSent) {
                    if (serviceEnabled) {
                        const welcomeMessage = {
                            id: Date.now(),
                            text: `Welcome ${participantName}! You can now chat with Rajendran D.`,
                            sender: 'System',
                            timestamp: new Date().toISOString(),
                            isAdmin: false
                        };
                        newRoom.messages.push(welcomeMessage);
                        saveData();
                        socket.emit('room-assigned', { roomId, name: participantName });
                        clientResponseSent = true;
                    } else {
                        socket.emit('knock-pending', { 
                            message: "Knock received! Waiting for admin approval...",
                            roomId: roomId
                        });
                        clientResponseSent = true;
                    }
                }
            }
            
            console.log(`🔔 Processing knock from: ${participantName} (IP: ${clientIP}, Room: ${roomId})`);
            
            // Validation (non-blocking - room already created)
            const roomValidation = validateRoomCreation(clientIP, socket.id);
            if (!roomValidation.valid) {
                console.log(`⚠️ Rate limit violation (room already created): ${roomValidation.error}`);
                // Room already created, so we continue
            }
            
            const nameValidation = validateMessage(participantName);
            if (!nameValidation.valid) {
                console.log(`⚠️ Name validation failed (room already created): ${nameValidation.error}`);
                // Room already created, so we continue
            }

            const now = Date.now();
            if (sleepUntil && now < sleepUntil) {
                console.log(`⚠️ Sleep window active (room already created)`);
                // Room already created, so we continue
            }
            
            // Check for duplicate (but room is already created, so just log)
            for (let [existingRoomId, room] of chatRooms) {
                if (room.participant && room.participant.name === participantName && room.status === 'pending' && existingRoomId !== roomId) {
                    console.log(`⚠️ Duplicate knock detected: ${participantName} in Room ${existingRoomId}`);
                    // Room already created, so we continue
                }
            }
            
            // Notify admin if service enabled
            if (serviceEnabled) {
                const adminRoom = io.sockets.adapter.rooms.get('admin-room');
                if (adminRoom && adminRoom.size > 0) {
                    io.to('admin-room').emit('new-participant', {
                        roomId,
                        participant: { name: participantName }
                    });
                    console.log('✅ Notified admin of new participant');
                }
            }
            
            // Step 10: Send Telegram notification (ASYNC - non-blocking)
            // This happens in background and failures don't affect client
            createBotForRoom(roomId, participantName)
                .then((botInfo) => {
                    console.log(`🤖 Bot created: @${botInfo.botUsername}`);
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
                                       `• <code>nudge</code> - Send gentle prompt (after approval)\n` +
                                       `• <code>sleep 60</code> - Set sleep for 60 minutes\n` +
                                       `• <code>sleep clear</code> - Clear sleep time\n` +
                                       `• <code>sleep status</code> - Check sleep status\n` +
                                       `• Any other text - Custom message`;
                    return sendMessageWithBot(roomId, knockMessage);
                })
                .then((result) => {
                    if (result && result.success) {
                        setActiveRoomContext({
                            type: 'knock',
                            roomId: roomId,
                            participantName: participantName,
                            socketId: socket.id,
                            replyMessageId: result.messageId,
                            botInfo: result.botInfo
                        });
                        console.log('📱 Telegram notification sent');
                    } else {
                        // Fallback
                        return sendKnockNotification(participantName, roomId);
                    }
                })
                .then((result) => {
                    if (result && result.success && !result.botInfo) {
                        setActiveRoomContext({
                            type: 'knock',
                            roomId: roomId,
                            participantName: participantName,
                            socketId: socket.id,
                            replyMessageId: result.messageId
                        });
                        console.log('📱 Fallback Telegram notification sent');
                    }
                })
                .catch((error) => {
                    console.error('❌ Telegram notification failed (non-critical):', error.message);
                });
            
            console.log(`✅ ========== KNOCK HANDLER COMPLETE ==========`);
            
        } catch (error) {
            console.error('❌ ========== CRITICAL ERROR IN KNOCK HANDLER ==========');
            console.error('❌ Error:', error.message);
            console.error('❌ Stack:', error.stack);
            console.error('❌ Participant:', participantName);
            console.error('❌ Room ID:', roomId);
            
            // GUARANTEE client gets a response
            if (!clientResponseSent) {
                if (roomId && chatRooms.has(roomId)) {
                    sendClientResponse('knock-pending', { 
                        message: "Knock received! Processing...",
                        roomId: roomId
                    });
                } else {
                    sendClientResponse('knock-rejected', { 
                        message: 'System error: Failed to create room. Please try again.',
                        roomId: null
                    });
                }
            }
        }
    });

    // Handle chat messages
    socket.on('send-message', (data) => {
        // Get connection info first to check room status
        const connection = activeConnections.get(socket.id);
        if (!connection) {
            console.log('❌ No connection found for socket:', socket.id);
            return;
        }
        
        // For participants, check if their room is active
        if (connection.type === 'participant') {
            const room = chatRooms.get(connection.roomId);
            if (!room || room.status !== 'active') {
                console.log('🚫 Message rejected - room not active for participant');
                socket.emit('message-error', { error: 'Room is not active. Please wait for approval.' });
                return;
            }
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
        console.log('🔗 Connection found:', connection);

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
                // Update last activity timestamp (admin message counts as activity)
                room.lastActivity = Date.now();
                
                room.messages.push(message);
                saveData();
                io.to(`room-${roomId}`).emit('new-message', message);
                socket.emit('message-sent', message);
            }
        } else {
            // Participant message
            const roomId = connection.roomId;
            const room = chatRooms.get(roomId);
            if (room) {
                // Update last activity timestamp
                room.lastActivity = Date.now();
                
                room.messages.push(message);
                saveData();
                io.to(`room-${roomId}`).emit('new-message', message);
                io.to('admin-room').emit('admin-message', { roomId, message });
                socket.emit('message-sent', message);
                
                // Send Telegram notification for user message with chat history
                // Pass lastTelegramMessageId to delete previous message
                // IMPORTANT: Store the current message ID BEFORE sending to prevent race conditions
                const currentLastMessageId = room.lastTelegramMessageId;
                
                console.log(`📤 [Room ${roomId}] Sending user message notification. Previous message ID: ${currentLastMessageId || 'none'}`);
                
                sendUserMessageNotification(connection.name, roomId, data.text, room.messages, currentLastMessageId).then((result) => {
                    if (result.success && result.messageId) {
                        // Atomically update the message ID - this prevents race conditions
                        // Only update if this is still the current room state
                        const currentRoom = chatRooms.get(roomId);
                        if (currentRoom && currentRoom.lastTelegramMessageId === currentLastMessageId) {
                            currentRoom.lastTelegramMessageId = result.messageId;
                            saveData(); // Save the updated room with message ID
                            console.log(`📱 Stored new Telegram message ID ${result.messageId} for Room ${roomId}`);
                        } else {
                            console.log(`⚠️ Room ${roomId} state changed during message send, not updating message ID`);
                        }
                        
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
        // Room IDs are sequential numbers (1, 2, 3, ...)
        const roomId = Number(data.roomId);
        const room = chatRooms.get(roomId);
        if (!room) { 
            console.log(`⚠️ Room ${roomId} not found for join-room`);
            socket.emit('room-not-found'); 
            return; 
        }
    
        if (data.isAdmin) {
          socket.join(`room-${roomId}`);
          socket.emit('room-joined', { roomId, messages: room.messages, participant: room.participant });
          return;
        }
    
        const participantName = data.participantName;
        if (!participantName || room.participant?.name !== participantName) {
            console.log(`⚠️ Invalid participant name ${participantName} for room ${roomId}`);
            socket.emit('room-not-found'); 
            return;
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
        console.log(`🔍 Join-room: Socket ${socket.id} joined room-${roomId}`);
        
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
                saveData();
                
                // Notify admin
                io.to('admin-room').emit('participant-left', { 
                    roomId, 
                    participant: connection,
                    message: leaveMessage
                });
                
                // Build conversation summary (only actual conversation messages)
                const { sendFinalConversationSummary } = require('./config/telegram');
                
                let conversationSummary = '';
                if (room.messages && room.messages.length > 0) {
                    // Filter out system messages, welcome messages, and other non-conversation messages
                    const filteredMessages = room.messages.filter(msg => 
                        msg.sender !== 'System' && 
                        !msg.text.includes('Welcome') && 
                        !msg.text.includes('has left') &&
                        !msg.text.includes('has been inactive') &&
                        !msg.text.includes('not able to continue')
                    );
                    
                    if (filteredMessages.length > 0) {
                        conversationSummary = '\n\n📜 <b>Final Conversation Summary:</b>\n';
                        filteredMessages.forEach(msg => {
                            const sender = msg.isAdmin ? 'Rajendran' : msg.sender;
                            
                            // Format time as HH:MM AM/PM in IST
                            const msgTime = new Date(msg.timestamp).toLocaleTimeString('en-IN', { 
                                timeZone: 'Asia/Kolkata',
                                hour12: true, 
                                hour: '2-digit', 
                                minute: '2-digit' 
                            });
                            
                            conversationSummary += `${sender} (${msgTime}): ${msg.text}\n`;
                        });
                    }
                }
                
                // Send final summary and delete all intermediate messages
                sendFinalConversationSummary(connection.name, roomId, conversationSummary)
                    .then(() => console.log(`📱 Final conversation summary sent and intermediate messages deleted: User ${connection.name} left Room ${roomId}`))
                    .catch(error => console.error(`❌ Failed to send final summary:`, error));
                
                console.log(`Participant ${connection.name} left room ${roomId}`);
                
                // Clean up the room after a short delay (30 seconds) to allow admin to see the summary
                setTimeout(() => {
                    cleanupRoom(roomId);
                }, 30000); // 30 second delay before cleanup
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
                
                saveData();
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

                            // Build and send final conversation summary (only actual conversation messages)
                            const { sendFinalConversationSummary } = require('./config/telegram');
                            
                            // Build conversation summary
                            let conversationSummary = '';
                            if (currentRoom.messages && currentRoom.messages.length > 0) {
                                // Filter out system messages, welcome messages, and other non-conversation messages
                                const filteredMessages = currentRoom.messages.filter(msg => 
                                    msg.sender !== 'System' && 
                                    !msg.text.includes('Welcome') && 
                                    !msg.text.includes('has left') &&
                                    !msg.text.includes('has been inactive') &&
                                    !msg.text.includes('not able to continue')
                                );
                                
                                if (filteredMessages.length > 0) {
                                    conversationSummary = '\n\n📜 <b>Final Conversation Summary:</b>\n';
                                    filteredMessages.forEach(msg => {
                                        const sender = msg.isAdmin ? 'Rajendran' : msg.sender;
                                        
                                        // Format time as HH:MM AM/PM in IST
                                        const msgTime = new Date(msg.timestamp).toLocaleTimeString('en-IN', { 
                                            timeZone: 'Asia/Kolkata',
                                            hour12: true, 
                                            hour: '2-digit', 
                                            minute: '2-digit' 
                                        });
                                        
                                        conversationSummary += `${sender} (${msgTime}): ${msg.text}\n`;
                                    });
                                }
                            }
                            
                            // Send final summary and delete all intermediate messages
                            sendFinalConversationSummary(connection.name, roomId, conversationSummary)
                                .then(() => console.log(`📱 Final summary sent and intermediate messages deleted: User ${connection.name} left Room ${roomId}`))
                                .catch(error => console.error(`❌ Failed to send final summary:`, error));
                            
                            console.log(`✅ Participant ${connection.name} actually left room ${roomId} after grace period`);
                            
                            // Clean up the room after a short delay (30 seconds) to allow admin to see the summary
                            setTimeout(() => {
                                cleanupRoom(roomId);
                            }, 30000); // 30 second delay before cleanup
                        }
                    }, 5000); // 5 second grace period
                    
                    console.log(`🔌 Participant ${connection.name} disconnected from room ${roomId} - grace period started`);
                } else if (room && room.status === 'pending') {
                    // For pending rooms, clean up immediately (no grace period needed)
                    console.log(`🔌 Participant ${connection.name} disconnected from pending room ${roomId} - cleaning up immediately`);
                    // Clean up the pending room immediately
                    cleanupRoom(roomId);
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

// Add catch-all route for debugging (after all other routes)
app.use((req, res, next) => {
    console.log(`🔍 Unmatched route: ${req.method} ${req.path} ${req.url}`);
    console.log(`🔍 Registered routes check: /test route should be available`);
    next(); // Let Express continue to 404 handler
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('='.repeat(80));
    console.log(`🚀 Anonymice server running on port ${PORT}`);
    console.log(`🔐 ADMIN URL: https://web-production-8d6b4.up.railway.app/admin/${ADMIN_URL}`);
    console.log(`🚪 Knock URL: https://web-production-8d6b4.up.railway.app/knock`);
    console.log(`🧪 Test endpoint: https://web-production-8d6b4.up.railway.app/test`);
    console.log(`📡 Socket.IO initialized: ${io ? 'YES' : 'NO'}`);
    console.log(`📊 Current rooms: ${chatRooms.size}`);
    console.log(`🔌 Service enabled: ${serviceEnabled}`);
    console.log(`✅ /test route registered: YES`);
    console.log('='.repeat(80));
    console.log('✅ Server is ready to accept connections!');
    
    // Set up periodic check for inactive users (every minute)
    setInterval(() => {
        checkInactiveUsers();
    }, 60000); // Check every 60 seconds (1 minute)
    console.log('⏰ Inactivity checker started (5 minute timeout)');
});

// Export for testing
module.exports = { app, server, ADMIN_URL }; 