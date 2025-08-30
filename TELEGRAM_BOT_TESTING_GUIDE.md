# Telegram Bot Testing Guide

This guide provides comprehensive instructions for testing the Telegram bot functionality in your TradingView Alert Bot project.

## Prerequisites

### 1. Environment Setup
Ensure your `.env` file contains:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TEST_CHAT_ID=your_chat_id_here  # Optional, for automated testing
```

### 2. Get Your Chat ID (for testing)
1. Message `@userinfobot` on Telegram
2. Copy your chat ID
3. Add it to your `.env` file as `TEST_CHAT_ID`

### 3. Server Running
Make sure your server is running:
```bash
npm start
```

## Automated Testing

### Run the Test Suite
```bash
node test_telegram_bot.js
```

This will test:
- ✅ Bot connection and authentication
- ✅ Command setup verification
- ✅ Message sending capabilities
- ✅ Webhook endpoint functionality
- ✅ Database operations
- ✅ Error handling

## Manual Testing

### 1. Basic Bot Interaction

#### Find Your Bot
1. Open Telegram
2. Search for your bot using its username
3. Start a conversation

#### Test Commands
Try each command and verify the responses:

**Start Command:**
```
/start
```
**Expected:** Welcome message with inline keyboard buttons

**Help Command:**
```
/help
```
**Expected:** Detailed help message with all available commands

**Status Command:**
```
/status
```
**Expected:** User status information including subscriptions and statistics

**Subscribe Command:**
```
/subscribe
```
**Expected:** Subscription options with inline keyboard

### 2. Interactive Features Testing

#### Inline Keyboard Testing
1. Send `/start` command
2. Click on the inline keyboard buttons
3. Verify callback responses

#### Subscription Flow
1. Send `/subscribe`
2. Click "Subscribe to All" button
3. Verify subscription confirmation message
4. Check `/status` to confirm subscription is active

### 3. Webhook Testing

#### Test TradingView Webhook
Send a POST request to test the webhook:

```bash
curl -X POST http://localhost:3000/api/webhook/tradingview \
  -H "Content-Type: application/json" \
  -H "User-Agent: TradingView-Webhook" \
  -d '{
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "signal": "buy",
    "price": "45000.50",
    "strategy": "Test Strategy",
    "takeProfitPrice": "46000.00",
    "stopLossPrice": "44000.00",
    "timestamp": "2024-01-15T10:30:00Z",
    "metadata": {
      "volume": "1000",
      "rsi": "35.5",
      "macd": "bullish"
    }
  }'
```

**Expected Results:**
- Server responds with 200 status
- Subscribed users receive formatted alert message
- Alert is saved to database
- Trade record is created

### 4. Alert Message Testing

#### Test Different Signal Types

**Buy Signal:**
```json
{
  "symbol": "ETHUSDT",
  "signal": "buy",
  "price": "2500.00",
  "strategy": "RSI Oversold"
}
```

**Sell Signal:**
```json
{
  "symbol": "ETHUSDT",
  "signal": "sell",
  "price": "2600.00",
  "strategy": "RSI Overbought"
}
```

**Take Profit Hit:**
```json
{
  "symbol": "BTCUSDT",
  "signal": "tp_hit",
  "price": "46000.00",
  "originalEntry": "45000.00",
  "tradeNumber": "001"
}
```

**Stop Loss Hit:**
```json
{
  "symbol": "BTCUSDT",
  "signal": "sl_hit",
  "price": "44000.00",
  "originalEntry": "45000.00",
  "tradeNumber": "001"
}
```

### 5. Error Handling Testing

#### Test Invalid Webhook Data
```bash
curl -X POST http://localhost:3000/api/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "invalid": "data",
    "missing": "required fields"
  }'
```
**Expected:** 400 Bad Request with error message

#### Test Bot Error Handling
1. Send invalid commands: `/invalidcommand`
2. Send non-command text messages
3. Verify appropriate error responses

### 6. Database Verification

#### Check MongoDB Collections

**Telegram Users:**
```javascript
// In MongoDB shell or Compass
db.telegram_users.find().pretty()
```

**Alerts:**
```javascript
db.alerts.find().sort({createdAt: -1}).limit(5).pretty()
```

**Trades:**
```javascript
db.trades.find().sort({createdAt: -1}).limit(5).pretty()
```

### 7. Performance Testing

#### Multiple Users Testing
1. Create multiple Telegram accounts
2. Subscribe all accounts to alerts
3. Send webhook alerts
4. Verify all users receive messages
5. Check server logs for performance metrics

#### Load Testing
```bash
# Send multiple alerts rapidly
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/webhook/tradingview \
    -H "Content-Type: application/json" \
    -d '{"symbol":"TEST'$i'","signal":"buy","price":"100.00"}'
  sleep 1
done
```

## Troubleshooting

### Common Issues

#### Bot Not Responding
1. Check `TELEGRAM_BOT_TOKEN` in `.env`
2. Verify bot is created with @BotFather
3. Check server logs for errors
4. Ensure server is running on correct port

#### Messages Not Sending
1. Verify user has started the bot (`/start`)
2. Check if user blocked the bot
3. Verify database connection
4. Check Telegram API rate limits

#### Webhook Not Working
1. Verify server is accessible
2. Check webhook endpoint URL
3. Verify request headers and format
4. Check server logs for errors

#### Database Issues
1. Verify MongoDB connection
2. Check collection names and schemas
3. Verify user permissions
4. Check for validation errors

### Debug Commands

#### Check Bot Status
```bash
# Test bot connection
node -e "const bot = require('./src/services/telegramBot'); bot.initialize().then(() => console.log('Bot OK')).catch(console.error)"
```

#### Check Database Connection
```bash
# Test MongoDB connection
node -e "require('./src/config/database').then(() => console.log('DB OK')).catch(console.error)"
```

#### View Server Logs
```bash
# Monitor logs in real-time
tail -f logs/app.log
```

## Testing Checklist

### ✅ Basic Functionality
- [ ] Bot responds to `/start`
- [ ] Bot responds to `/help`
- [ ] Bot responds to `/status`
- [ ] Bot responds to `/subscribe`
- [ ] Inline keyboards work
- [ ] Callback queries handled

### ✅ Webhook Integration
- [ ] Webhook endpoint accessible
- [ ] Valid alerts processed
- [ ] Invalid alerts rejected
- [ ] Alerts saved to database
- [ ] Users receive notifications

### ✅ Database Operations
- [ ] Telegram users created/updated
- [ ] Alerts stored correctly
- [ ] Trades tracked properly
- [ ] Statistics updated
- [ ] Subscriptions managed

### ✅ Error Handling
- [ ] Invalid commands handled
- [ ] Network errors handled
- [ ] Database errors handled
- [ ] Rate limiting respected
- [ ] User blocking detected

### ✅ Performance
- [ ] Multiple users supported
- [ ] Concurrent requests handled
- [ ] Memory usage stable
- [ ] Response times acceptable
- [ ] No memory leaks

## Next Steps

After successful testing:

1. **Production Deployment**
   - Set up production environment
   - Configure proper logging
   - Set up monitoring
   - Configure backup systems

2. **Advanced Features**
   - Implement remaining commands
   - Add user preferences
   - Create admin panel integration
   - Add analytics and reporting

3. **Security**
   - Implement rate limiting
   - Add input validation
   - Set up webhook authentication
   - Monitor for abuse

4. **Monitoring**
   - Set up health checks
   - Monitor bot uptime
   - Track message delivery rates
   - Monitor database performance

## Support

If you encounter issues:
1. Check the troubleshooting section
2. Review server logs
3. Verify environment configuration
4. Test individual components
5. Check Telegram Bot API documentation