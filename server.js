const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');

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
        activeConnections.set(socket.id, { type: 'admin', name: ADMIN_NAME });
        socket.join('admin-room');
        socket.emit('admin-connected', { rooms: Array.from(chatRooms.keys()) });
        console.log('Admin connected');
    });

    // Handle participant knock
    socket.on('knock', (data) => {
        const availableRooms = [];
        
        // Find available rooms
        for (let i = 0; i < maxRooms; i++) {
            if (!chatRooms.has(i)) {
                availableRooms.push(i);
            }
        }

        if (availableRooms.length > 0) {
            const roomId = availableRooms[0];
            const participantName = data.name || `Anonymous${Math.floor(Math.random() * 1000)}`;
            
            // Create room
            chatRooms.set(roomId, {
                id: roomId,
                participant: { name: participantName },
                messages: [],
                created: Date.now()
            });

            // Store participant-room mapping
            participantRooms.set(participantName, roomId);

            socket.join(`room-${roomId}`);
            
            // Add welcome message
            const welcomeMessage = {
                id: Date.now(),
                text: `Welcome ${participantName}! You can now chat with Rajendran D.`,
                sender: 'System',
                timestamp: new Date().toLocaleTimeString(),
                isAdmin: false
            };
            
            chatRooms.get(roomId).messages.push(welcomeMessage);
            
            socket.emit('room-assigned', { roomId, name: participantName });
            
            // Notify admin
            io.to('admin-room').emit('new-participant', {
                roomId,
                participant: { name: participantName }
            });

            console.log(`Participant ${participantName} assigned to room ${roomId}`);
            console.log(`Current rooms:`, Array.from(chatRooms.keys()));
            console.log(`Participant rooms:`, Array.from(participantRooms.entries()));
        } else {
            socket.emit('no-rooms-available');
        }
    });

    // Handle chat messages
    socket.on('send-message', (data) => {
        const connection = activeConnections.get(socket.id);
        if (!connection) return;

        const message = {
            id: Date.now(),
            text: data.text,
            sender: connection.name,
            timestamp: new Date().toLocaleTimeString(),
            isAdmin: connection.type === 'admin'
        };

        if (connection.type === 'admin') {
            // Admin message to specific room
            const roomId = data.roomId;
            const room = chatRooms.get(roomId);
            if (room) {
                room.messages.push(message);
                io.to(`room-${roomId}`).emit('new-message', message);
                socket.emit('message-sent', message);
            }
        } else {
            // Participant message
            const roomId = connection.roomId;
            const room = chatRooms.get(roomId);
            if (room) {
                room.messages.push(message);
                io.to(`room-${roomId}`).emit('new-message', message);
                io.to('admin-room').emit('admin-message', { roomId, message });
                socket.emit('message-sent', message);
            }
        }
    });

    // Handle room join requests
    socket.on('join-room', (data) => {
        const roomId = parseInt(data.roomId);
        const participantName = data.name || data.participantName;
        
        console.log('Join room request:', { roomId, participantName });
        
        // Check if this participant is assigned to this room
        const assignedRoomId = participantRooms.get(participantName);
        const room = chatRooms.get(roomId);
        
        console.log('Room check:', { 
            roomId, 
            assignedRoomId, 
            roomExists: !!room, 
            allRooms: Array.from(chatRooms.keys()),
            participantRooms: Array.from(participantRooms.entries())
        });
        
        if (room && assignedRoomId === roomId) {
            // Update connection mapping
            activeConnections.set(socket.id, { 
                type: 'participant', 
                name: participantName, 
                roomId: roomId 
            });
            
            socket.join(`room-${roomId}`);
            socket.emit('room-joined', { 
                roomId, 
                messages: room.messages,
                participant: room.participant
            });
            
            console.log(`Participant ${participantName} joined room ${roomId}`);
        } else {
            console.log(`Room ${roomId} not found or participant ${participantName} not assigned to this room`);
            socket.emit('room-not-found');
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const connection = activeConnections.get(socket.id);
        if (connection) {
            if (connection.type === 'participant') {
                const roomId = connection.roomId;
                chatRooms.delete(roomId);
                io.to('admin-room').emit('participant-left', { roomId, participant: connection });
                console.log(`Participant ${connection.name} left room ${roomId}`);
            }
            activeConnections.delete(socket.id);
        }
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin URL: http://localhost:${PORT}/admin/${ADMIN_URL}`);
    console.log(`Knock URL: http://localhost:${PORT}/knock`);
});

// Export for testing
module.exports = { app, server, ADMIN_URL }; 