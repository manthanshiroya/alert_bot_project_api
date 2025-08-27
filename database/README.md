# Alert Bot Database Setup

This directory contains the database configuration, initialization scripts, and management tools for the Alert Bot project. The system uses MongoDB for persistent data storage and Redis for caching, session management, and real-time data processing.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Database Architecture](#database-architecture)
- [Configuration](#configuration)
- [Initialization](#initialization)
- [Backup & Restore](#backup--restore)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Production Deployment](#production-deployment)

## 🔍 Overview

### MongoDB
- **Purpose**: Primary database for persistent data storage
- **Collections**: Users, Alerts, Market Data, Subscriptions, Notifications
- **Features**: ACID transactions, replica sets, sharding support
- **Version**: 7.0+

### Redis
- **Purpose**: Caching, session storage, pub/sub messaging, rate limiting
- **Data Types**: Strings, Hashes, Lists, Sets, Sorted Sets, Streams
- **Features**: Persistence, clustering, sentinel support
- **Version**: 7.2+

## 📦 Prerequisites

### System Requirements
- **OS**: Linux, macOS, or Windows
- **RAM**: Minimum 4GB (8GB+ recommended)
- **Storage**: 20GB+ available space
- **Network**: Internet access for Docker images

### Software Dependencies
- [Docker](https://docs.docker.com/get-docker/) 20.10+
- [Docker Compose](https://docs.docker.com/compose/install/) 2.0+
- [Node.js](https://nodejs.org/) 18+ (for scripts)
- [MongoDB Tools](https://docs.mongodb.com/database-tools/) (for backup/restore)

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Clone the repository
git clone <repository-url>
cd alert_bot_project_api/database

# Copy environment configuration
cp .env.example .env

# Edit configuration (optional)
nano .env
```

### 2. Start Database Services

```bash
# Start all database services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### 3. Initialize Databases

```bash
# Wait for services to be ready (30-60 seconds)
sleep 60

# Verify initialization
docker-compose logs mongodb-init
docker-compose logs redis-init
```

### 4. Access Admin Interfaces (Development)

```bash
# Start development profile
docker-compose --profile dev up -d

# Access MongoDB Express: http://localhost:8081
# Access Redis Commander: http://localhost:8082
```

## 🏗️ Database Architecture

### MongoDB Collections

#### Users Collection
```javascript
{
  _id: ObjectId,
  email: String,
  username: String,
  passwordHash: String,
  role: String, // 'user', 'admin', 'moderator'
  subscriptionPlan: String, // 'free', 'basic', 'pro', 'premium'
  profile: {
    firstName: String,
    lastName: String,
    timezone: String,
    preferences: Object
  },
  telegramUserId: String,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

#### Alerts Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  name: String,
  type: String, // 'price', 'volume', 'technical'
  symbol: String,
  exchange: String,
  conditions: [{
    field: String,
    operator: String, // 'gt', 'lt', 'eq', 'between'
    value: Number,
    secondValue: Number // for 'between' operator
  }],
  technicalIndicators: [{
    indicator: String, // 'sma', 'ema', 'rsi', 'macd'
    period: Number,
    conditions: Object
  }],
  priority: String, // 'low', 'medium', 'high', 'critical'
  frequency: String, // 'once', 'recurring'
  cooldown: Number, // minutes
  notificationChannels: [String], // 'telegram', 'email', 'webhook'
  webhookUrl: String,
  isActive: Boolean,
  lastTriggered: Date,
  triggerCount: Number,
  expiresAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

#### Market Data Collection
```javascript
{
  _id: ObjectId,
  symbol: String,
  exchange: String,
  price: Number,
  volume: Number,
  high24h: Number,
  low24h: Number,
  change24h: Number,
  changePercent24h: Number,
  marketCap: Number,
  timestamp: Date,
  technicalIndicators: {
    sma: { sma20: Number, sma50: Number, sma200: Number },
    ema: { ema12: Number, ema26: Number },
    rsi: { rsi14: Number },
    macd: { macd: Number, signal: Number, histogram: Number },
    bollinger: { upper: Number, middle: Number, lower: Number }
  }
}
```

### Redis Data Structures

#### Cache Keys
- `cache:market_data:{symbol}:{exchange}` - Market data cache
- `cache:technical_indicators:{symbol}:{exchange}:{indicator}` - Technical indicators
- `cache:user_session:{sessionId}` - User sessions
- `cache:api_response:{endpoint}:{params_hash}` - API response cache

#### Rate Limiting
- `rate_limit:{service}:{endpoint}:{identifier}` - Rate limit counters
- `rate_limit:ip:{ip_address}` - IP-based rate limiting

#### Queues
- `queue:alerts:{priority}` - Alert processing queues
- `queue:notifications:{channel}` - Notification queues
- `queue:market_data` - Market data processing queue

#### Pub/Sub Channels
- `alert:triggered` - Alert trigger notifications
- `market:update` - Market data updates
- `user:subscription:changed` - Subscription changes
- `system:shutdown` - System shutdown signals

## ⚙️ Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# MongoDB Configuration
MONGO_HOST=localhost
MONGO_PORT=27017
MONGO_DATABASE=alert_bot_dev
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=admin123

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Backup Configuration
BACKUP_DIR=./backups
BACKUP_RETENTION_DAYS=7
COMPRESS=true
ENCRYPT=false
```

### Docker Compose Profiles

- **Default**: Core database services (MongoDB, Redis)
- **dev**: Includes admin interfaces (Mongo Express, Redis Commander)
- **debug**: Additional debugging tools
- **production**: Production optimizations and backup service

```bash
# Development with admin interfaces
docker-compose --profile dev up -d

# Production with backup service
docker-compose --profile production up -d
```

## 🔧 Initialization

### MongoDB Initialization

The MongoDB initialization script (`init/mongodb/init.js`) performs:

1. **Database Creation**: Creates the main database
2. **Collection Setup**: Creates collections with validation schemas
3. **Index Creation**: Optimizes query performance
4. **Default Data**: Inserts subscription plans and system configuration
5. **Admin User**: Creates initial admin user

### Redis Initialization

The Redis initialization script (`init/redis/init.redis`) sets up:

1. **Configuration**: Memory policies and persistence settings
2. **Data Structures**: Initial cache keys and queues
3. **Feature Flags**: System feature toggles
4. **Metrics**: Performance monitoring keys

### Manual Initialization

```bash
# MongoDB manual initialization
mongosh --host localhost:27017 --username admin --password admin123 --authenticationDatabase admin < init/mongodb/init.js

# Redis manual initialization
redis-cli -h localhost -p 6379 < init/redis/init.redis
```

## 💾 Backup & Restore

### Automated Backups

```bash
# Run backup script
./scripts/backup.sh all

# MongoDB only
./scripts/backup.sh mongodb

# Redis only
./scripts/backup.sh redis

# Compressed and encrypted backup
./scripts/backup.sh all --compress --encrypt
```

### Backup Schedule

Backups run automatically via cron in the backup container:

```bash
# Daily at 2 AM
0 2 * * * /backup.sh all
```

### Restore from Backup

```bash
# List available backups
./scripts/restore.sh list

# Restore MongoDB
./scripts/restore.sh mongodb /backups/mongodb/mongodb_backup_20240101_120000.tar.gz

# Restore Redis
./scripts/restore.sh redis /backups/redis/redis_backup_20240101_120000.rdb.gz

# Restore both (with force flag to skip confirmations)
./scripts/restore.sh all /backups/mongodb/mongo.tar.gz /backups/redis/redis.rdb.gz --force

# Restore encrypted backup
./scripts/restore.sh mongodb /backups/mongodb/backup.tar.gz.enc --decrypt
```

### Backup Storage

Backups are stored locally by default. For production, configure cloud storage:

```bash
# AWS S3 configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET=your_backup_bucket
AWS_S3_REGION=us-east-1
```

## 📊 Monitoring

### Health Checks

```bash
# Check service health
docker-compose ps

# MongoDB health
mongosh --host localhost:27017 --eval "db.runCommand('ping')"

# Redis health
redis-cli -h localhost -p 6379 ping
```

### Performance Monitoring

```bash
# MongoDB stats
mongosh --host localhost:27017 --eval "db.stats()"

# Redis info
redis-cli -h localhost -p 6379 info

# Docker stats
docker stats
```

### Log Monitoring

```bash
# View all logs
docker-compose logs -f

# MongoDB logs
docker-compose logs -f mongodb

# Redis logs
docker-compose logs -f redis

# Backup logs
ls -la backups/*.log
```

### Admin Interfaces

#### MongoDB Express
- **URL**: http://localhost:8081
- **Username**: admin
- **Password**: admin123
- **Features**: Browse collections, run queries, manage indexes

#### Redis Commander
- **URL**: http://localhost:8082
- **Username**: admin
- **Password**: admin123
- **Features**: Browse keys, monitor memory, execute commands

## 🔧 Troubleshooting

### Common Issues

#### MongoDB Connection Issues

```bash
# Check if MongoDB is running
docker-compose ps mongodb

# Check MongoDB logs
docker-compose logs mongodb

# Test connection
mongosh --host localhost:27017 --username admin --password admin123

# Restart MongoDB
docker-compose restart mongodb
```

#### Redis Connection Issues

```bash
# Check if Redis is running
docker-compose ps redis

# Check Redis logs
docker-compose logs redis

# Test connection
redis-cli -h localhost -p 6379 ping

# Restart Redis
docker-compose restart redis
```

#### Initialization Failures

```bash
# Check initialization logs
docker-compose logs mongodb-init
docker-compose logs redis-init

# Re-run initialization
docker-compose up mongodb-init redis-init

# Manual initialization
mongosh < init/mongodb/init.js
redis-cli < init/redis/init.redis
```

#### Disk Space Issues

```bash
# Check disk usage
df -h
du -sh data/

# Clean old backups
find backups/ -name "*backup*" -mtime +7 -delete

# Clean Docker volumes
docker system prune -v
```

#### Performance Issues

```bash
# MongoDB slow queries
mongosh --eval "db.setProfilingLevel(2, {slowms: 100})"
mongosh --eval "db.system.profile.find().sort({ts: -1}).limit(5)"

# Redis memory usage
redis-cli info memory
redis-cli --bigkeys

# System resources
top
iotop
```

### Recovery Procedures

#### Complete System Recovery

```bash
# Stop all services
docker-compose down -v

# Remove all data
sudo rm -rf data/

# Restore from backup
./scripts/restore.sh all /path/to/mongodb/backup /path/to/redis/backup

# Restart services
docker-compose up -d
```

#### Partial Recovery

```bash
# MongoDB only
docker-compose stop mongodb
sudo rm -rf data/mongodb/
./scripts/restore.sh mongodb /path/to/backup
docker-compose start mongodb

# Redis only
docker-compose stop redis
sudo rm -rf data/redis/
./scripts/restore.sh redis /path/to/backup
docker-compose start redis
```

## 🚀 Production Deployment

### Security Hardening

1. **Change Default Passwords**
   ```bash
   # Generate strong passwords
   openssl rand -base64 32
   ```

2. **Enable SSL/TLS**
   ```bash
   # MongoDB SSL
   MONGO_SSL_ENABLED=true
   MONGO_SSL_CERT_PATH=/path/to/cert.pem
   MONGO_SSL_KEY_PATH=/path/to/key.pem
   
   # Redis TLS
   REDIS_TLS_ENABLED=true
   REDIS_TLS_CERT_PATH=/path/to/cert.pem
   REDIS_TLS_KEY_PATH=/path/to/key.pem
   ```

3. **Network Security**
   ```bash
   # Restrict access
   DB_IP_WHITELIST=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
   
   # Firewall rules
   ufw allow from 10.0.0.0/8 to any port 27017
   ufw allow from 10.0.0.0/8 to any port 6379
   ```

### High Availability

1. **MongoDB Replica Set**
   ```yaml
   # docker-compose.prod.yml
   mongodb-primary:
     command: mongod --replSet rs0 --bind_ip_all
   
   mongodb-secondary1:
     command: mongod --replSet rs0 --bind_ip_all
   
   mongodb-secondary2:
     command: mongod --replSet rs0 --bind_ip_all
   ```

2. **Redis Sentinel**
   ```yaml
   # docker-compose.prod.yml
   redis-master:
     command: redis-server --appendonly yes
   
   redis-slave1:
     command: redis-server --slaveof redis-master 6379
   
   redis-sentinel1:
     command: redis-sentinel /etc/redis/sentinel.conf
   ```

### Performance Optimization

1. **MongoDB Optimization**
   ```javascript
   // Create compound indexes
   db.alerts.createIndex({userId: 1, isActive: 1, symbol: 1})
   db.marketdata.createIndex({symbol: 1, exchange: 1, timestamp: -1})
   
   // Enable sharding
   sh.enableSharding("alert_bot_prod")
   sh.shardCollection("alert_bot_prod.marketdata", {symbol: 1, timestamp: 1})
   ```

2. **Redis Optimization**
   ```bash
   # Memory optimization
   maxmemory 2gb
   maxmemory-policy allkeys-lru
   
   # Persistence optimization
   save 900 1
   save 300 10
   save 60 10000
   ```

### Monitoring & Alerting

1. **Prometheus Metrics**
   ```yaml
   # docker-compose.monitoring.yml
   mongodb-exporter:
     image: percona/mongodb_exporter
   
   redis-exporter:
     image: oliver006/redis_exporter
   ```

2. **Health Check Endpoints**
   ```bash
   # MongoDB health
   curl http://localhost:9216/metrics
   
   # Redis health
   curl http://localhost:9121/metrics
   ```

### Backup Strategy

1. **Automated Backups**
   ```bash
   # Production backup schedule
   0 2 * * * /backup.sh all --compress --encrypt
   0 14 * * * /backup.sh mongodb --compress
   ```

2. **Cloud Storage**
   ```bash
   # S3 sync
   aws s3 sync /backups/ s3://your-backup-bucket/alert-bot/
   
   # Retention policy
   aws s3api put-bucket-lifecycle-configuration --bucket your-backup-bucket --lifecycle-configuration file://lifecycle.json
   ```

## 📚 Additional Resources

- [MongoDB Documentation](https://docs.mongodb.com/)
- [Redis Documentation](https://redis.io/documentation)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [MongoDB Best Practices](https://docs.mongodb.com/manual/administration/production-notes/)
- [Redis Best Practices](https://redis.io/topics/admin)

## 🤝 Contributing

When contributing to the database setup:

1. Test changes in development environment
2. Update documentation
3. Ensure backward compatibility
4. Add appropriate indexes for new queries
5. Update backup/restore scripts if needed

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.