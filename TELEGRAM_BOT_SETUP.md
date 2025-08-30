# Telegram Bot Setup Guide

This guide will help you set up the Telegram bot integration for the TradingView Alert Distribution System.

## Prerequisites

- A Telegram account
- Access to the Telegram app (mobile or desktop)
- Admin access to the alert bot project

## Step 1: Create a Telegram Bot

1. **Open Telegram** and search for `@BotFather`
2. **Start a conversation** with BotFather by clicking "Start" or sending `/start`
3. **Create a new bot** by sending the command:
   ```
   /newbot
   ```
4. **Choose a name** for your bot (e.g., "TradingView Alert Bot")
5. **Choose a username** for your bot (must end with "bot", e.g., "tradingview_alert_bot")
6. **Copy the bot token** that BotFather provides (it looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

## Step 2: Configure the Bot Token

1. **Open the `.env` file** in your project root
2. **Find the line** `TELEGRAM_BOT_TOKEN=`
3. **Add your bot token** after the equals sign:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
4. **Save the file**

## Step 3: Start the Server

1. **Restart your server** if it's already running:
   ```bash
   npm start
   ```
2. **Check the logs** for successful bot initialization:
   ```
   ✅ Telegram bot initialized successfully
   ```

## Step 4: Test the Bot

1. **Find your bot** on Telegram by searching for its username
2. **Start a conversation** with your bot by clicking "Start" or sending `/start`
3. **Try basic commands**:
   - `/help` - Show available commands
   - `/status` - Check bot status
   - `/subscribe` - Subscribe to alerts

## Available Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Initialize bot and show welcome message |
| `/help` | Display help information and available commands |
| `/subscribe` | Subscribe to trading alerts |
| `/unsubscribe` | Unsubscribe from trading alerts |
| `/status` | Show your subscription status |
| `/alerts` | View recent alerts |
| `/settings` | Configure notification preferences |
| `/stats` | View your trading statistics |
| `/link` | Link your Telegram account with web account |

## Bot Features

### 🔔 Alert Notifications
- Receive real-time TradingView alerts
- Formatted messages with trade details
- Entry and exit signals
- Take profit and stop loss notifications

### 📊 Trade Tracking
- Sequential trade numbering
- P&L calculations
- Trade statistics
- Performance metrics

### ⚙️ User Management
- Subscription management
- Notification preferences
- Account linking
- User statistics

## API Endpoints

The bot also provides HTTP API endpoints for management:

### Bot Control
- `POST /api/telegram/bot/start` - Start the bot
- `POST /api/telegram/bot/stop` - Stop the bot
- `GET /api/telegram/bot/status` - Get bot status

### User Management
- `GET /api/telegram/users` - Get all Telegram users
- `GET /api/telegram/users/:telegramId` - Get specific user
- `PUT /api/telegram/users/:telegramId` - Update user
- `POST /api/telegram/users/:telegramId/block` - Block user
- `POST /api/telegram/users/:telegramId/unblock` - Unblock user

### Messaging
- `POST /api/telegram/send` - Send message to user
- `POST /api/telegram/broadcast` - Broadcast to all users

### Account Linking
- `POST /api/telegram/link` - Link Telegram with web account
- `DELETE /api/telegram/unlink` - Unlink accounts

## Troubleshooting

### Bot Not Responding
1. Check if `TELEGRAM_BOT_TOKEN` is correctly set in `.env`
2. Verify the token is valid (no extra spaces or characters)
3. Check server logs for initialization errors
4. Restart the server

### Bot Token Invalid
1. Go back to BotFather
2. Send `/token` to get your bot token again
3. Update the `.env` file with the correct token

### Commands Not Working
1. Make sure you've sent `/start` to the bot first
2. Check if the bot is running (`GET /api/telegram/bot/status`)
3. Verify database connection is working

### No Alerts Received
1. Make sure you're subscribed (`/subscribe`)
2. Check if TradingView webhooks are being received
3. Verify webhook processing is working
4. Check server logs for Telegram notification errors

## Security Notes

- **Keep your bot token secret** - never share it publicly
- **Use environment variables** for sensitive configuration
- **Implement proper user authentication** for production use
- **Consider rate limiting** for bot commands
- **Monitor bot usage** and implement abuse prevention

## Next Steps

1. **Customize alert formatting** in `src/utils/telegramFormatter.js`
2. **Implement user subscription logic** in webhook processing
3. **Add more advanced commands** and features
4. **Set up webhook URL** for production deployment
5. **Implement user authentication** and authorization

## Support

For issues or questions:
1. Check the server logs for error messages
2. Review the API documentation at `/api/docs`
3. Test endpoints using the Swagger UI
4. Check Telegram bot logs in the console

---

**Note**: This is a development setup. For production deployment, consider additional security measures, proper error handling, and scalability optimizations.