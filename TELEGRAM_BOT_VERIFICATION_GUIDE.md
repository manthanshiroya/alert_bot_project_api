# Telegram Bot Verification Guide

This guide provides comprehensive steps to verify that your Telegram bot is working correctly and ready for production use.

## Quick Verification Checklist

- [ ] Bot is initialized and connected
- [ ] All commands are configured
- [ ] Webhook endpoint is responding
- [ ] Database operations are working
- [ ] Error handling is functional
- [ ] Manual bot interaction works
- [ ] Alert processing is working
- [ ] User registration/linking works

## 1. Automated Testing

### Run the Test Script

```bash
node test_telegram_bot.js
```

**Expected Results:**
- ✅ Bot Connection: PASSED
- ✅ Command Setup: PASSED
- ✅ Webhook Endpoint: PASSED
- ✅ Error Handling: PASSED

### Enable Message Testing (Optional)

1. Get your Telegram chat ID:
   - Message `@userinfobot` on Telegram
   - Copy your chat ID

2. Add to your `.env` file:
   ```
   TEST_CHAT_ID=your_chat_id_here
   ```

3. Run the test again to verify message sending

## 2. Manual Bot Testing

### Find Your Bot

1. Open Telegram
2. Search for your bot using the username from BotFather
3. Start a conversation

### Test Basic Commands

#### 1. Start Command
```
/start
```
**Expected:** Welcome message with user registration

#### 2. Help Command
```
/help
```
**Expected:** List of available commands with descriptions

#### 3. Status Command
```
/status
```
**Expected:** Current subscription status and user info

#### 4. Subscribe Command
```
/subscribe
```
**Expected:** Subscription options with inline keyboard

#### 5. Settings Command
```
/settings
```
**Expected:** Notification preferences menu

#### 6. Stats Command
```
/stats
```
**Expected:** User trading statistics

### Test Interactive Features

#### Subscription Flow
1. Send `/subscribe`
2. Click on subscription buttons
3. Verify confirmation messages
4. Check database for subscription records

#### Settings Configuration
1. Send `/settings`
2. Modify notification preferences
3. Verify settings are saved

## 3. Webhook Testing

### Test TradingView Webhook

#### Using curl:
```bash
curl -X POST http://localhost:3000/api/webhooks/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "signal": "buy",
    "price": "45000.50",
    "strategy": "Test Strategy",
    "takeProfitPrice": "46000.00",
    "stopLossPrice": "44000.00",
    "timestamp": "2024-01-01T12:00:00Z"
  }'
```

#### Using Postman:
1. Create POST request to `http://localhost:3000/api/webhooks/tradingview`
2. Set Content-Type to `application/json`
3. Use the sample JSON above
4. Send request

**Expected Response:**
```json
{
  "success": true,
  "message": "Alert received and queued for processing",
  "alertId": "...",
  "timestamp": "..."
}
```

### Verify Alert Processing

1. Send webhook request
2. Check bot sends alert to subscribed users
3. Verify alert is stored in database
4. Check logs for processing confirmation

## 4. Database Verification

### Check Collections

#### TelegramUser Collection
```javascript
// In MongoDB shell or Compass
db.telegramusers.find().pretty()
```

**Verify:**
- User records are created when users interact with bot
- Telegram IDs are stored correctly
- Subscription data is updated

#### Alert Collection
```javascript
db.alerts.find().pretty()
```

**Verify:**
- Alerts are stored from webhook
- Processing status is tracked
- Trade numbers are sequential

### Test Database Operations

#### User Registration
1. New user sends `/start`
2. Check database for new TelegramUser record
3. Verify user data is complete

#### Subscription Management
1. User subscribes to alerts
2. Check subscription array in user record
3. Verify subscription status

## 5. Error Handling Verification

### Test Invalid Webhook Data
```bash
curl -X POST http://localhost:3000/api/webhooks/tradingview \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'
```

**Expected:** Error response with validation details

### Test Bot Error Scenarios

1. Send invalid commands to bot
2. Try to access restricted features
3. Send malformed callback data

**Expected:** Graceful error messages, no crashes

## 6. Performance Testing

### Load Testing

#### Multiple Webhook Requests
```bash
# Send 10 concurrent requests
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/webhooks/tradingview \
    -H "Content-Type: application/json" \
    -d '{"symbol":"TEST'$i'","signal":"buy","price":"100"}' &
done
wait
```

#### Multiple Bot Interactions
- Have multiple users interact with bot simultaneously
- Monitor response times and error rates

### Monitor Resources

```bash
# Check server logs
tail -f logs/app.log

# Monitor process
top -p $(pgrep node)
```

## 7. Production Readiness Checklist

### Environment Configuration
- [ ] `TELEGRAM_BOT_TOKEN` is set
- [ ] `TRADINGVIEW_WEBHOOK_SECRET` is configured
- [ ] Database connections are working
- [ ] Redis is connected
- [ ] All required environment variables are set

### Security
- [ ] Webhook signature verification is enabled
- [ ] Rate limiting is configured
- [ ] Input validation is working
- [ ] Error messages don't expose sensitive data

### Monitoring
- [ ] Logging is configured
- [ ] Error tracking is set up
- [ ] Performance metrics are collected
- [ ] Health checks are responding

### Functionality
- [ ] All bot commands work
- [ ] Webhook processing is reliable
- [ ] Database operations are consistent
- [ ] User management is working
- [ ] Alert distribution is functional

## 8. Troubleshooting

### Common Issues

#### Bot Not Responding
1. Check `TELEGRAM_BOT_TOKEN` in `.env`
2. Verify bot is not already running elsewhere
3. Check network connectivity
4. Review bot logs for errors

#### Webhook Failures
1. Verify endpoint URL is correct
2. Check webhook signature validation
3. Ensure server is accessible
4. Review request/response logs

#### Database Issues
1. Check MongoDB connection
2. Verify collection permissions
3. Review database logs
4. Test connection manually

### Debug Commands

#### Check Bot Status
```bash
# Get bot info
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"

# Get webhook info
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

#### Test Database Connection
```javascript
// In Node.js console
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);
mongoose.connection.on('connected', () => console.log('Connected'));
```

#### Check Server Health
```bash
curl http://localhost:3000/health
```

## 9. Next Steps

After successful verification:

1. **Deploy to Production**
   - Set up production environment
   - Configure domain and SSL
   - Set up monitoring and alerts

2. **User Onboarding**
   - Create user documentation
   - Set up support channels
   - Prepare marketing materials

3. **Monitoring Setup**
   - Configure log aggregation
   - Set up performance monitoring
   - Create alerting rules

4. **Backup and Recovery**
   - Set up database backups
   - Create disaster recovery plan
   - Test restore procedures

## Support

If you encounter issues:

1. Check the logs in `logs/` directory
2. Review the troubleshooting section
3. Verify environment configuration
4. Test individual components separately

For additional help, refer to:
- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [TradingView Webhook Documentation](https://www.tradingview.com/support/solutions/43000529348-about-webhooks/)
- Project documentation in `docs/` directory