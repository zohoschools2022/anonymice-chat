# 🤖 Telegram Integration Setup

This guide will help you set up Telegram notifications for your Anonymice chat system.

## 🚀 Quick Setup

1. **Create a Telegram Bot:**
   - Open Telegram and search for `@BotFather`
   - Send `/newbot`
   - Choose a name: "Anonymice Chat Notifier"
   - Choose a username: "anonymice_chat_bot" (must end with 'bot')
   - Copy the bot token

2. **Run the Setup Script:**
   ```bash
   node setup-telegram.js
   ```

3. **Follow the prompts:**
   - Enter your bot token
   - Send a message to your bot
   - The script will find your chat ID automatically

## 📱 How It Works

### **Knock Notifications:**
- When someone knocks, you get a Telegram notification
- Reply with:
  - `approve` - Let them into the chat
  - `reject` - Reject them
  - `away` - Send "away" message
  - Any other text - Custom message

### **Message Notifications:**
- When someone sends a message, you get a Telegram notification
- Reply to send your response back to the web chat
- Users see your response as if you're typing from the admin page

## 🔧 Manual Setup (Alternative)

If the setup script doesn't work, you can set up manually:

1. **Create `.env` file:**
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   ```

2. **Get your chat ID:**
   - Send a message to your bot
   - Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Look for `"chat":{"id":123456789}`

## 🎯 Features

- ✅ **Free forever** - No costs
- ✅ **Instant notifications** - Never miss a knock or message
- ✅ **Mobile convenience** - Respond from anywhere
- ✅ **Anonymous users** - Users stay anonymous on web
- ✅ **Rich formatting** - Emojis, links, etc.

## 🚨 Security Notes

- Keep your bot token secret
- Don't share your chat ID publicly
- The `.env` file is already in `.gitignore`

## 🆘 Troubleshooting

**Bot not responding?**
- Check if bot token is correct
- Make sure you've sent a message to the bot
- Verify chat ID is correct

**Messages not sending?**
- Check server logs for errors
- Verify bot token and chat ID
- Make sure bot is not blocked

## 🎉 Ready to Use!

Once setup is complete, start your server:
```bash
npm start
```

Your Telegram bot will now send notifications for:
- 🔔 Someone knocks
- 💬 New messages
- 📤 Your responses

Enjoy your mobile admin interface! 🚀
