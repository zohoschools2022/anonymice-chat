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
        
        // Send current rooms with full data
        const currentRooms = Array.from(chatRooms.entries()).map(([roomId, room]) => ({
            roomId: parseInt(roomId),
            participant: room.participant,
            messages: room.messages
        }));
        
        socket.emit('admin-connected', { rooms: currentRooms });
        console.log('Admin connected, sent rooms:', currentRooms);
    });

    // Handle participant knock
    socket.on('knock', (data) => {
        const availableRooms = [];
        
        // Find available rooms (1-8)
        for (let i = 1; i <= maxRooms; i++) {
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
        socket.emit('room-joined', { roomId, messages: room.messages, participant: room.participant });
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
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔐 ADMIN URL: http://localhost:${PORT}/admin/${ADMIN_URL}`);
    console.log(`🔐 ADMIN URL (Railway): https://web-production-8d6b4.up.railway.app/admin/${ADMIN_URL}`);
    console.log(`🚪 Knock URL: http://localhost:${PORT}/knock`);
    console.log(`🚪 Knock URL (Railway): https://web-production-8d6b4.up.railway.app/knock`);
    console.log('='.repeat(80));
});

// Export for testing
module.exports = { app, server, ADMIN_URL }; 