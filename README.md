# 🐭 Anonymice Chat

A web-based anonymous chat application with a tiled interface for managing up to 8 concurrent conversations.

## Features

- **Anonymous Chat**: Participants can use any name they want
- **Tiled Admin Interface**: Manage up to 8 concurrent chat sessions
- **Real-time Messaging**: Instant message delivery using WebSocket
- **No Persistence**: Messages are not saved for privacy
- **Simple Knock System**: Easy join mechanism for participants
- **Secure Admin Access**: Long, confusing alphanumeric URL for admin
- **Responsive Design**: Works on desktop and mobile devices

## Quick Start

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Server**:
   ```bash
   npm start
   ```

3. **Access the Application**:
   - **Home Page**: `https://web-production-8d6b4.up.railway.app/`
   - **Knock Page**: `https://web-production-8d6b4.up.railway.app/knock`
   - **Admin Dashboard**: `https://web-production-8d6b4.up.railway.app/admin/{ADMIN_URL}` (URL will be shown in console)

## How It Works

### For Participants:
1. Visit the knock page: `https://web-production-8d6b4.up.railway.app/knock`
2. Enter any name you'd like to use
3. Click "Knock & Join"
4. If a slot is available, you'll be assigned to a chat room
5. Start chatting with Rajendran D (the admin)

### For Admin (Rajendran D):
1. Use the special admin URL shown in the console when starting the server
2. Access the tiled dashboard with up to 8 chat windows
3. Each window represents one participant
4. Send messages to specific participants
5. Monitor all conversations simultaneously

## Technical Details

- **Backend**: Node.js with Express and Socket.IO
- **Frontend**: Vanilla HTML, CSS, and JavaScript
- **Real-time Communication**: WebSocket via Socket.IO
- **State Management**: In-memory (no database)
- **Security**: Admin access via long, randomly generated URL

## File Structure

```
Anonymice/
├── server.js          # Main server file
├── package.json       # Dependencies and scripts
├── README.md         # This file
└── public/           # Frontend files
    ├── index.html    # Landing page
    ├── knock.html    # Participant join page
    ├── admin.html    # Admin dashboard
    ├── chat.html     # Individual chat page
    └── styles.css    # All styling
```

## Development

To run in development mode with auto-restart:
```bash
npm run dev
```

## Security Notes

- Admin URL is randomly generated on each server start
- No message persistence for privacy
- No user authentication required
- Participants can use any name
- Maximum 8 concurrent conversations

## Browser Compatibility

- Modern browsers with WebSocket support
- Responsive design for mobile devices
- No external dependencies required

## License

MIT License - feel free to modify and use as needed. 