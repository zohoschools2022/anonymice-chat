const { Server } = require('socket.io');

// In-memory storage for chat state
const chatRooms = new Map();
const activeConnections = new Map();
const maxRooms = 8;

// Generate admin URL
const generateAdminUrl = () => {
    return require('crypto').randomBytes(32).toString('hex');
};

const ADMIN_URL = generateAdminUrl();
const ADMIN_NAME = "Rajendran D";

exports.handler = async (event, context) => {
    // Handle WebSocket upgrade
    if (event.httpMethod === 'GET' && event.headers.Upgrade === 'websocket') {
        return {
            statusCode: 101,
            headers: {
                'Upgrade': 'websocket',
                'Connection': 'Upgrade'
            }
        };
    }

    // Handle regular HTTP requests
    const path = event.path;
    
    if (path === '/api/admin-url') {
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ adminUrl: ADMIN_URL })
        };
    }

    if (path === '/api/knock') {
        const body = JSON.parse(event.body || '{}');
        const { name } = body;
        
        // Find available room
        const availableRooms = [];
        for (let i = 0; i < maxRooms; i++) {
            if (!chatRooms.has(i)) {
                availableRooms.push(i);
            }
        }

        if (availableRooms.length > 0) {
            const roomId = availableRooms[0];
            const participantName = name || `Anonymous${Math.floor(Math.random() * 1000)}`;
            
            chatRooms.set(roomId, {
                id: roomId,
                participant: { name: participantName },
                messages: [],
                created: Date.now()
            });

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    success: true, 
                    roomId, 
                    name: participantName 
                })
            };
        } else {
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    success: false, 
                    message: 'No rooms available' 
                })
            };
        }
    }

    return {
        statusCode: 404,
        body: 'Not Found'
    };
}; 