const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

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
        // Check if service is enabled
        if (!serviceEnabled) {
            console.log('🚫 Knock rejected - service is disabled');
            socket.emit('service-disabled', { 
                message: "The Cat is away. The mice can't play!" 
            });
            return;
        }

        // ATOMIC ROOM ASSIGNMENT - Find and claim a room in one operation
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
                    status: 'active',
                    created: Date.now(),
                    claimed: true // Mark as claimed immediately
                };
                
                // Set the room immediately to claim it
                chatRooms.set(i, newRoom);
                
                // DOUBLE-CHECK: Verify we actually got the room (prevent race conditions)
                const verifyRoom = chatRooms.get(i);
                if (verifyRoom && verifyRoom.participant.name === participantName) {
                    roomId = i;
                    console.log(`🔒 ATOMICALLY CLAIMED room ${i} for ${participantName}`);
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
            const newRoom = chatRooms.get(roomId);
            console.log(`🆕 Created fresh room ${roomId} for ${participantName}`);
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
        } else {
            socket.emit('no-rooms-available');
        }
    });

    // Handle chat messages
    socket.on('send-message', (data) => {
        // Check if service is enabled
        if (!serviceEnabled) {
            console.log('🚫 Message rejected - service is disabled');
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
        const connection = activeConnections.get(socket.id);
        if (connection) {
            if (connection.type === 'participant') {
                const roomId = connection.roomId;
                const room = chatRooms.get(roomId);
                
                if (room && room.status === 'active') {
                    // Mark room as "left" instead of deleting it
                    room.status = 'left';
                    room.leftAt = Date.now();
                    
                    // Add leave message to room
                    const leaveMessage = {
                        id: Date.now(),
                        text: `${connection.name} has left the chat room.`,
                        sender: 'System',
                        timestamp: new Date().toISOString(),
                        isAdmin: false
                    };
                    
                    room.messages.push(leaveMessage);
                    
                    // Notify admin that participant left (so admin can see transcript and clean)
                    io.to('admin-room').emit('participant-left', { 
                        roomId, 
                        participant: connection,
                        message: leaveMessage
                    });
                    
                    console.log(`Participant ${connection.name} disconnected from room ${roomId} - room marked as 'left'`);
                }
            }
            activeConnections.delete(socket.id);
        }
        console.log('Client disconnected:', socket.id);
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