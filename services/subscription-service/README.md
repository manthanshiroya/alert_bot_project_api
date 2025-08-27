# Alert Bot - Subscription Service

The Subscription Service is a core microservice of the Alert Bot platform that handles user subscriptions, billing, payment processing, and plan management. It provides a comprehensive solution for managing SaaS subscriptions with support for multiple payment gateways, usage tracking, and advanced billing features.

## 🚀 Features

### Core Subscription Management
- **Plan Management**: Create, update, and manage subscription plans with flexible pricing models
- **Subscription Lifecycle**: Handle subscription creation, updates, cancellations, and renewals
- **Trial Management**: Support for free trials with configurable durations and extensions
- **Usage Tracking**: Monitor and track usage across multiple metrics (alerts, API calls, webhooks, storage)
- **Subscription Pausing**: Temporarily pause and resume subscriptions

### Billing & Payments
- **Multi-Gateway Support**: Integration with Stripe and PayPal payment gateways
- **Invoice Management**: Generate, retrieve, and manage invoices
- **Payment Processing**: Handle one-time and recurring payments
- **Refund Management**: Process refunds and handle payment disputes
- **Tax Calculation**: Support for tax calculations and compliance
- **Proration**: Automatic proration for plan changes and upgrades

### Advanced Features
- **Coupon System**: Create and manage discount coupons and promotional codes
- **Usage Analytics**: Comprehensive usage reporting and analytics
- **Dunning Management**: Automated retry logic for failed payments
- **Multi-Currency Support**: Handle payments in multiple currencies
- **Webhook Processing**: Real-time webhook handling for payment events
- **Reporting**: Generate detailed reports on revenue, churn, and performance

### User Management
- **Profile Management**: Handle user profile updates and preferences
- **Avatar Upload**: Support for user avatar uploads with image processing
- **Two-Factor Authentication**: Enhanced security with 2FA support
- **Session Management**: Secure session handling and management
- **Data Export**: Export user data in multiple formats (JSON, CSV)
- **Account Deletion**: Secure account deletion with grace periods

## 🏗️ Architecture

### Technology Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Cache**: Redis for caching and session storage
- **Payment Gateways**: Stripe, PayPal
- **Authentication**: JWT with refresh tokens
- **File Processing**: Sharp for image processing
- **Email**: Nodemailer with template support
- **SMS**: Twilio integration
- **Monitoring**: Winston logging, health checks

### Service Structure
```
subscription-service/
├── app.js                 # Main application entry point
├── package.json           # Dependencies and scripts
├── Dockerfile            # Container configuration
├── healthcheck.js        # Health check script
├── .env.example          # Environment variables template
├── controllers/          # Business logic controllers
│   ├── SubscriptionController.js
│   ├── PlanController.js
│   ├── BillingController.js
│   ├── UserController.js
│   ├── WebhookController.js
│   ├── ReportController.js
│   └── index.js
├── routes/               # API route definitions
│   ├── subscriptions.js
│   ├── plans.js
│   ├── billing.js
│   ├── users.js
│   ├── webhooks.js
│   ├── reports.js
│   └── index.js
├── models/               # Database models
│   ├── Subscription.js
│   ├── Plan.js
│   ├── Invoice.js
│   ├── Transaction.js
│   ├── Usage.js
│   ├── Coupon.js
│   └── index.js
├── middleware/           # Custom middleware
├── services/             # External service integrations
├── utils/                # Utility functions
├── tests/                # Test suites
├── docs/                 # API documentation
└── scripts/              # Database migrations and seeds
```

## 🚦 Getting Started

### Prerequisites
- Node.js 18.0.0 or higher
- MongoDB 5.0 or higher
- Redis 6.0 or higher
- npm 8.0.0 or higher

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd alert_bot_project_api/services/subscription-service
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Database Setup**
   ```bash
   # Start MongoDB and Redis
   # Run migrations
   npm run migrate
   
   # Seed initial data (optional)
   npm run seed
   ```

5. **Start the service**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

### Docker Setup

1. **Build the Docker image**
   ```bash
   npm run docker:build
   ```

2. **Run the container**
   ```bash
   npm run docker:run
   ```

3. **Using Docker Compose** (from project root)
   ```bash
   docker-compose up subscription-service
   ```

## 📚 API Documentation

### Base URL
```
http://localhost:3002/api
```

### Authentication
Most endpoints require authentication using JWT tokens:
```
Authorization: Bearer <your-jwt-token>
```

### Core Endpoints

#### Subscriptions
- `GET /subscriptions` - Get user subscriptions
- `POST /subscriptions` - Create new subscription
- `GET /subscriptions/:id` - Get subscription details
- `PUT /subscriptions/:id` - Update subscription
- `DELETE /subscriptions/:id` - Cancel subscription
- `POST /subscriptions/:id/pause` - Pause subscription
- `POST /subscriptions/:id/resume` - Resume subscription
- `GET /subscriptions/:id/usage` - Get usage statistics

#### Plans
- `GET /plans` - Get available plans
- `GET /plans/:id` - Get plan details
- `GET /plans/compare` - Compare multiple plans
- `POST /plans` - Create plan (admin)
- `PUT /plans/:id` - Update plan (admin)
- `DELETE /plans/:id` - Delete plan (admin)

#### Billing
- `GET /billing/invoices` - Get user invoices
- `GET /billing/invoices/:id` - Get invoice details
- `POST /billing/invoices/:id/pay` - Pay invoice
- `GET /billing/payment-methods` - Get payment methods
- `POST /billing/payment-methods` - Add payment method
- `PUT /billing/payment-methods/:id` - Update payment method
- `DELETE /billing/payment-methods/:id` - Delete payment method
- `GET /billing/transactions` - Get transaction history
- `POST /billing/refunds` - Request refund

#### Users
- `GET /users/profile` - Get user profile
- `PUT /users/profile` - Update user profile
- `POST /users/avatar` - Upload avatar
- `DELETE /users/avatar` - Delete avatar
- `GET /users/preferences` - Get user preferences
- `PUT /users/preferences` - Update preferences
- `GET /users/sessions` - Get active sessions
- `DELETE /users/sessions/:id` - Revoke session
- `POST /users/2fa/enable` - Enable 2FA
- `POST /users/2fa/verify` - Verify 2FA
- `POST /users/2fa/disable` - Disable 2FA

#### Webhooks
- `POST /webhooks/stripe` - Stripe webhook endpoint
- `POST /webhooks/paypal` - PayPal webhook endpoint
- `GET /webhooks/stats` - Webhook statistics (admin)

#### Reports
- `GET /reports/revenue` - Revenue reports (admin)
- `GET /reports/subscriptions` - Subscription analytics (admin)
- `GET /reports/churn` - Churn analysis (admin)
- `GET /reports/usage` - Usage analytics (admin)
- `POST /reports/custom` - Generate custom report (admin)

### Health Checks
- `GET /health` - Service health status
- `GET /ready` - Service readiness check

## 🔧 Configuration

### Environment Variables

Key environment variables (see `.env.example` for complete list):

```bash
# Server
NODE_ENV=development
SUBSCRIPTION_SERVICE_PORT=3002

# Database
MONGODB_URI=mongodb://localhost:27017/alert_bot_subscription
REDIS_HOST=localhost
REDIS_PORT=6379

# Authentication
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=24h

# Payment Gateways
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret

# Email
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# SMS
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
```

### Payment Gateway Setup

#### Stripe
1. Create a Stripe account
2. Get your API keys from the Stripe dashboard
3. Set up webhook endpoints for real-time events
4. Configure webhook secrets for security

#### PayPal
1. Create a PayPal developer account
2. Create an application to get client credentials
3. Set up webhook notifications
4. Configure webhook verification

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run integration tests
npm run test:integration

# Generate coverage report
npm run test -- --coverage
```

### Test Structure
```
tests/
├── unit/                 # Unit tests
│   ├── controllers/
│   ├── models/
│   ├── services/
│   └── utils/
├── integration/          # Integration tests
│   ├── api/
│   ├── webhooks/
│   └── payments/
├── fixtures/             # Test data
├── helpers/              # Test utilities
└── setup.js             # Test configuration
```

## 📊 Monitoring & Observability

### Health Monitoring
- Health check endpoint: `GET /health`
- Readiness check endpoint: `GET /ready`
- Docker health checks configured

### Logging
- Structured logging with Winston
- Request/response logging
- Error tracking and alerting
- Log rotation and archival

### Metrics
- Application performance metrics
- Business metrics (subscriptions, revenue)
- System metrics (memory, CPU)
- Custom dashboards available

## 🔒 Security

### Security Features
- JWT authentication with refresh tokens
- Rate limiting and DDoS protection
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CSRF protection
- Secure headers (Helmet.js)
- Payment data encryption
- PCI DSS compliance considerations

### Best Practices
- Regular security audits
- Dependency vulnerability scanning
- Secure coding practices
- Environment variable protection
- API key rotation
- Access logging and monitoring

## 🚀 Deployment

### Production Deployment
1. **Environment Setup**
   - Configure production environment variables
   - Set up production databases
   - Configure SSL certificates

2. **Build and Deploy**
   ```bash
   # Build production image
   docker build -t subscription-service:latest .
   
   # Deploy to container orchestration platform
   kubectl apply -f k8s/
   ```

3. **Post-Deployment**
   - Run database migrations
   - Verify health checks
   - Monitor application logs
   - Set up monitoring and alerting

### Scaling Considerations
- Horizontal scaling with load balancers
- Database read replicas
- Redis clustering for cache
- CDN for static assets
- Queue systems for background jobs

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

### Code Standards
- ESLint configuration for code quality
- Prettier for code formatting
- Conventional commits for commit messages
- JSDoc for code documentation

### Pull Request Process
1. Ensure all tests pass
2. Update documentation as needed
3. Add appropriate labels
4. Request review from maintainers
5. Address feedback and merge

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help
- Check the [documentation](docs/)
- Search [existing issues](issues)
- Create a [new issue](issues/new)
- Contact the development team

### Troubleshooting

Common issues and solutions:

1. **Database Connection Issues**
   - Verify MongoDB is running
   - Check connection string format
   - Ensure network connectivity

2. **Payment Gateway Errors**
   - Verify API keys are correct
   - Check webhook endpoint configuration
   - Review payment gateway logs

3. **Authentication Problems**
   - Verify JWT secret configuration
   - Check token expiration settings
   - Review user permissions

## 🗺️ Roadmap

### Upcoming Features
- [ ] Advanced analytics dashboard
- [ ] Multi-tenant support
- [ ] Advanced dunning management
- [ ] Subscription marketplace
- [ ] Mobile SDK integration
- [ ] Advanced reporting engine
- [ ] AI-powered churn prediction
- [ ] Blockchain payment support

### Version History
- **v1.0.0** - Initial release with core subscription management
- **v1.1.0** - Added payment gateway integrations
- **v1.2.0** - Enhanced reporting and analytics
- **v1.3.0** - Advanced billing features

---

**Alert Bot Subscription Service** - Powering subscription management for the Alert Bot platform.