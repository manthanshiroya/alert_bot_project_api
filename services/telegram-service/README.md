# Telegram Service

The Telegram Service is a core microservice of the Alert Bot Project that handles all Telegram bot interactions, message delivery, and alert management through the Telegram platform.

## 🚀 Features

### Bot Management
- **Multi-Bot Support**: Register and manage multiple Telegram bots
- **Bot Configuration**: Configure bot settings, webhooks, and permissions
- **Bot Health Monitoring**: Monitor bot status and connectivity
- **Webhook Management**: Secure webhook handling with signature verification

### Message Delivery
- **Rich Messages**: Support for text, images, documents, and interactive keyboards
- **Message Templates**: Pre-defined message formats for different alert types
- **Delivery Tracking**: Track message delivery status and failures
- **Rate Limiting**: Respect Telegram API rate limits

### Alert Integration
- **Real-time Alerts**: Instant delivery of price, volume, and technical alerts
- **Alert Formatting**: Beautiful, readable alert messages with charts and data
- **Alert History**: Track and manage alert delivery history
- **Alert Templates**: Customizable alert message templates

### User Management
- **Chat Management**: Handle individual and group chats
- **User Preferences**: Manage user notification preferences
- **Subscription Integration**: Integrate with subscription service for premium features
- **Permission System**: Role-based access control

## 🏗️ Architecture

```
Telegram Service
├── controllers/          # Request handlers
│   ├── TelegramController.js
│   ├── AlertController.js
│   └── index.js
├── models/              # Database models
│   ├── Bot.js
│   ├── Chat.js
│   ├── Message.js
│   ├── Alert.js
│   └── index.js
├── routes/              # API routes
│   ├── telegram.js
│   ├── alerts.js
│   └── index.js
├── middleware/          # Custom middleware
│   ├── auth.js
│   ├── validation.js
│   ├── rateLimiter.js
│   └── index.js
├── utils/               # Utility functions
│   ├── logger.js
│   ├── helpers.js
│   └── index.js
├── services/            # Business logic
│   ├── TelegramService.js
│   ├── AlertService.js
│   └── index.js
└── server.js           # Main application entry
```

## 🛠️ Installation

### Prerequisites
- Node.js 18+ 
- MongoDB 5.0+
- Redis 6.0+
- Telegram Bot Token(s)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd alert_bot_project_api/services/telegram-service
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the service**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

### Docker Deployment

1. **Build the image**
   ```bash
   docker build -t telegram-service .
   ```

2. **Run the container**
   ```bash
   docker run -p 3003:3003 \
     -e MONGODB_URI=mongodb://localhost:27017/alertbot \
     -e REDIS_URL=redis://localhost:6379 \
     -e JWT_SECRET=your-jwt-secret \
     telegram-service
   ```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Service port | `3003` | No |
| `NODE_ENV` | Environment | `development` | No |
| `MONGODB_URI` | MongoDB connection string | - | Yes |
| `REDIS_URL` | Redis connection string | - | Yes |
| `JWT_SECRET` | JWT signing secret | - | Yes |
| `API_KEY` | Inter-service API key | - | Yes |
| `TELEGRAM_WEBHOOK_DOMAIN` | Webhook domain | - | Yes |
| `TELEGRAM_WEBHOOK_PATH` | Webhook path | `/webhook` | No |

### Telegram Bot Setup

1. **Create a bot with BotFather**
   - Message [@BotFather](https://t.me/botfather) on Telegram
   - Use `/newbot` command
   - Save the bot token

2. **Register the bot**
   ```bash
   curl -X POST http://localhost:3003/api/bots \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{
       "name": "My Alert Bot",
       "token": "BOT_TOKEN_FROM_BOTFATHER",
       "description": "Bot for crypto alerts"
     }'
   ```

## 📡 API Endpoints

### Bot Management

```http
# Register a new bot
POST /api/bots
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Alert Bot",
  "token": "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz",
  "description": "Crypto alerts bot"
}

# Get user's bots
GET /api/bots
Authorization: Bearer <token>

# Update bot
PUT /api/bots/:botId
Authorization: Bearer <token>

# Delete bot
DELETE /api/bots/:botId
Authorization: Bearer <token>
```

### Message Management

```http
# Send message
POST /api/messages/send
Content-Type: application/json
Authorization: Bearer <token>

{
  "botId": "bot_id",
  "chatId": "chat_id",
  "text": "Hello from Alert Bot!",
  "parseMode": "Markdown"
}

# Get chat messages
GET /api/chats/:chatId/messages
Authorization: Bearer <token>
```

### Alert Management

```http
# Create alert
POST /api/alerts
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "BTC Price Alert",
  "type": "price",
  "conditions": {
    "symbol": "BTCUSDT",
    "operator": ">",
    "value": 50000
  },
  "chatId": "chat_id",
  "botId": "bot_id"
}

# Get user alerts
GET /api/alerts
Authorization: Bearer <token>

# Update alert
PUT /api/alerts/:alertId
Authorization: Bearer <token>

# Delete alert
DELETE /api/alerts/:alertId
Authorization: Bearer <token>
```

### Webhooks

```http
# Telegram webhook endpoint
POST /api/webhook/:botId
Content-Type: application/json
X-Telegram-Bot-Api-Secret-Token: <webhook_secret>

# Webhook from Alert Engine
POST /api/webhook/alert
Content-Type: application/json
X-API-Key: <api_key>
```

## 🔒 Security

### Authentication
- **JWT Tokens**: Secure user authentication
- **API Keys**: Service-to-service authentication
- **Webhook Verification**: Telegram webhook signature validation

### Rate Limiting
- **General**: 100 requests per 15 minutes
- **Bot Registration**: 5 registrations per hour
- **Message Sending**: 30 messages per minute
- **Alert Creation**: 10 alerts per minute

### Data Protection
- **Encryption**: Sensitive data encrypted at rest
- **Input Validation**: All inputs validated and sanitized
- **CORS**: Configured for secure cross-origin requests
- **Helmet**: Security headers for protection

## 📊 Monitoring

### Health Checks

```bash
# Basic health check
curl http://localhost:3003/health

# Detailed health check
curl http://localhost:3003/health?detailed=true

# Docker health check
docker exec <container_id> node healthcheck.js
```

### Logging

- **Structured Logging**: JSON formatted logs
- **Log Levels**: Error, Warn, Info, Debug
- **Log Rotation**: Automatic log file rotation
- **Request Logging**: HTTP request/response logging

### Metrics

- **Bot Performance**: Message delivery rates and response times
- **Alert Metrics**: Alert creation, delivery, and failure rates
- **API Metrics**: Request counts, response times, error rates
- **System Metrics**: Memory usage, CPU usage, database connections

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- --testPathPattern=telegram.test.js
```

### Test Structure

```
tests/
├── unit/                # Unit tests
│   ├── controllers/
│   ├── models/
│   ├── services/
│   └── utils/
├── integration/         # Integration tests
│   ├── api/
│   ├── database/
│   └── telegram/
└── fixtures/           # Test data
    ├── bots.json
    ├── chats.json
    └── alerts.json
```

## 🚀 Deployment

### Production Checklist

- [ ] Environment variables configured
- [ ] Database connections tested
- [ ] Redis connection tested
- [ ] Telegram bot tokens valid
- [ ] Webhook URLs configured
- [ ] SSL certificates installed
- [ ] Monitoring setup
- [ ] Backup strategy implemented
- [ ] Load balancer configured
- [ ] Health checks enabled

### Docker Compose

```yaml
version: '3.8'
services:
  telegram-service:
    build: .
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/alertbot
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongo
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: telegram-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: telegram-service
  template:
    metadata:
      labels:
        app: telegram-service
    spec:
      containers:
      - name: telegram-service
        image: telegram-service:latest
        ports:
        - containerPort: 3003
        env:
        - name: NODE_ENV
          value: "production"
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: telegram-secrets
              key: mongodb-uri
        livenessProbe:
          httpGet:
            path: /health
            port: 3003
          initialDelaySeconds: 60
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3003
          initialDelaySeconds: 30
          periodSeconds: 10
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Style

- **ESLint**: Follow the configured ESLint rules
- **Prettier**: Use Prettier for code formatting
- **Naming**: Use camelCase for variables and functions
- **Comments**: Add JSDoc comments for functions

### Commit Messages

```
type(scope): description

feat(telegram): add multi-bot support
fix(alerts): resolve alert delivery issue
docs(readme): update API documentation
test(controllers): add telegram controller tests
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check this README and inline code comments
- **Issues**: Report bugs and request features via GitHub issues
- **Discussions**: Join project discussions for questions and ideas

## 🔄 Changelog

### v1.0.0 (Initial Release)
- Multi-bot support
- Message delivery system
- Alert integration
- Webhook handling
- Rate limiting
- Authentication and authorization
- Comprehensive logging
- Health monitoring
- Docker support