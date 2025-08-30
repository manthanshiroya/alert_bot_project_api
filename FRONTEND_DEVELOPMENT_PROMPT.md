# TradingView Alert Distribution System - Frontend Development Guide

## Project Overview

You are tasked with developing the complete frontend for a TradingView Alert Distribution System. This system processes trading alerts from TradingView webhooks and distributes them to subscribers via Telegram based on their subscription plans.

### Backend Integration
- **Backend Status**: Fully implemented and operational - NO BACKEND DEVELOPMENT REQUIRED
- **API Documentation**: Complete REST API with authentication and all endpoints ready
- **Base URL**: `http://localhost:3000/api`
- **Frontend Task**: Build React.js frontend that consumes existing backend APIs
- **Focus**: Frontend development only - backend APIs are complete and tested

## System Architecture

- **Backend**: Node.js with Express.js (Already implemented)
- **Database**: MongoDB with Redis caching
- **Frontend**: HTML/CSS/JavaScript (To be developed)
- **API**: RESTful APIs with comprehensive endpoints
- **Base URL**: `http://localhost:3000/api`

## Technology Stack

### Frontend Technologies
- **Framework**: React.js 18+ with functional components and hooks
- **Styling**: CSS Modules or Styled Components, CSS Grid/Flexbox
- **State Management**: React Context API or Redux Toolkit (for complex state)
- **HTTP Client**: Axios for API communication
- **Routing**: React Router DOM
- **UI Components**: Custom components with modern design
- **Icons**: React Icons or Font Awesome
- **Charts**: Chart.js with react-chartjs-2 wrapper
- **Build Tools**: Create React App or Vite
- **Environment**: Environment variables for API configuration

### Environment Configuration
- Create `.env` file for API base URL configuration
- Use `REACT_APP_API_BASE_URL=http://localhost:3000/api` for development
- Implement environment-specific configurations for production deployment

### Project Setup Instructions
1. **Initialize React Project**:
   ```bash
   npx create-react-app trading-signals-frontend
   cd trading-signals-frontend
   ```

2. **Install Required Dependencies**:
   ```bash
   npm install axios react-router-dom chart.js react-chartjs-2 react-icons
   ```

3. **Environment Setup**:
   Create `.env` file in project root:
   ```env
   REACT_APP_API_BASE_URL=http://localhost:3000/api
   REACT_APP_APP_NAME=Trading Signals Platform
   ```

4. **API Integration**:
   - Create `src/services/api.js` for centralized API calls
   - Use Axios interceptors for authentication headers
   - Implement error handling for API responses
   - Store JWT tokens in localStorage or secure storage

## Frontend Requirements

### Part 1: User Frontend Website

#### Pages Required:
1. **Homepage** (`/index.html`)
2. **About Us** (`/about.html`)
3. **Pricing** (`/pricing.html`)
4. **Terms & Conditions** (`/terms.html`)
5. **Subscription/Signup** (`/signup.html`)
6. **Login** (`/login.html`)
7. **User Dashboard** (`/dashboard.html`)

#### Content Management:
- All pages (except pricing and signup) should use JSON configuration files for easy content updates
- Create `config/content.json` for homepage, about, terms content
- Admin can update content without touching code

### Part 2: Admin Panel

#### Admin Pages Required:
1. **Admin Login** (`/admin/login.html`)
2. **Dashboard** (`/admin/dashboard.html`)
3. **Subscription Management** (`/admin/subscriptions.html`)
4. **User Management** (`/admin/users.html`)
5. **Payment Requests** (`/admin/payments.html`)
6. **UPI Configuration** (`/admin/upi-config.html`)

## API Documentation

### API Categories Overview

#### User APIs
- **Authentication**: Registration, login, logout
- **Subscriptions**: View plans, create requests, manage subscriptions
- **Payments**: Upload proof, view payment status
- **Profile**: View/update user profile and dashboard

#### Admin APIs
- **Authentication**: Admin login and session management
- **Dashboard**: Statistics, analytics, and overview data
- **User Management**: View, update, delete users
- **Payment Management**: Approve/reject payments, view pending requests
- **Subscription Management**: CRUD operations on subscription plans
- **UPI Configuration**: Manage payment gateway settings
- **System Statistics**: Revenue, user stats, alert statistics

### Authentication APIs

#### User Authentication
```
POST /api/auth/register
Content-Type: application/json

Request:
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "telegram": {
    "username": "johndoe",
    "userId": "123456789"
  }
}

Response:
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "userId",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

```
POST /api/auth/login
Content-Type: application/json

Request:
{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "userId",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### Admin Authentication
```
POST /api/admin/login
Content-Type: application/json

Request:
{
  "username": "admin",
  "password": "admin123"
}

Response:
{
  "success": true,
  "token": "admin_jwt_token",
  "admin": {
    "id": "adminId",
    "username": "admin",
    "permissions": {...}
  }
}
```

### Subscription APIs

#### Get All Subscription Plans (For Pricing Page)
```
GET /api/subscriptions/plans

Response:
{
  "success": true,
  "plans": [
    {
      "_id": "planId",
      "name": "Basic Plan",
      "description": "Basic trading alerts",
      "pricing": {
        "amount": 999,
        "currency": "INR",
        "duration": 30
      },
      "features": [
        "Real-time alerts",
        "Basic strategies",
        "Email support"
      ],
      "alertConfigurations": [...],
      "isActive": true
    }
  ]
}
```

#### Create Subscription Request
```
POST /api/subscriptions/request
Authorization: Bearer {user_token}
Content-Type: application/json

Request:
{
  "planId": "subscription_plan_id",
  "paymentMethod": "UPI"
}

Response:
{
  "success": true,
  "subscription": {
    "id": "subscriptionId",
    "status": "pending_payment"
  },
  "payment": {
    "id": "paymentId",
    "amount": 999,
    "qrCodeUrl": "/qr-codes/qr_12345.png",
    "upiString": "upi://pay?pa=alerts@paytm&pn=TradingBot&am=999...",
    "transactionId": "TXN12345"
  }
}
```

### Payment APIs

#### Upload Payment Proof
```
POST /api/payments/{paymentId}/proof
Authorization: Bearer {user_token}
Content-Type: multipart/form-data

Request:
Form Data:
- proof: [image file]
- notes: "Payment completed via PhonePe"

Response:
{
  "success": true,
  "message": "Payment proof uploaded successfully",
  "payment": {
    "id": "paymentId",
    "status": "proof_uploaded",
    "proofUrl": "/uploads/payment-proofs/proof_12345.jpg"
  }
}
```

### Admin APIs

#### Dashboard Statistics
```
GET /api/admin/dashboard
Authorization: Bearer {admin_token}

Response:
{
  "success": true,
  "stats": {
    "totalUsers": 150,
    "activeSubscriptions": 89,
    "pendingPayments": 12,
    "totalRevenue": 125000,
    "monthlyRevenue": 45000,
    "subscriptionBreakdown": {
      "Basic Plan": 45,
      "Premium Plan": 30,
      "Pro Plan": 14
    }
  }
}
```

#### Get All Users
```
GET /api/admin/users?page=1&limit=10&search=john
Authorization: Bearer {admin_token}

Response:
{
  "success": true,
  "users": [
    {
      "_id": "userId",
      "email": "user@example.com",
      "name": "John Doe",
      "status": "active",
      "subscriptions": [...],
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 15,
    "totalUsers": 150
  }
}
```

#### Get Pending Payments
```
GET /api/admin/payments/pending
Authorization: Bearer {admin_token}

Response:
{
  "success": true,
  "payments": [
    {
      "_id": "paymentId",
      "user": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "plan": {
        "name": "Basic Plan",
        "amount": 999
      },
      "status": "proof_uploaded",
      "proofUrl": "/uploads/payment-proofs/proof_12345.jpg",
      "transactionId": "TXN12345",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Approve/Reject Payment
```
POST /api/admin/payments/{paymentId}/approve
Authorization: Bearer {admin_token}
Content-Type: application/json

Request:
{
  "notes": "Payment verified and approved"
}

Response:
{
  "success": true,
  "message": "Payment approved successfully",
  "subscription": {
    "id": "subscriptionId",
    "status": "active",
    "startDate": "2024-01-15T10:30:00Z",
    "endDate": "2024-02-14T10:30:00Z"
  }
}
```

```
POST /api/admin/payments/{paymentId}/reject
Authorization: Bearer {admin_token}
Content-Type: application/json

Request:
{
  "reason": "Invalid payment proof",
  "notes": "Screenshot appears to be fake"
}

Response:
{
  "success": true,
  "message": "Payment rejected successfully"
}
```

#### Subscription Plan Management
```
# Get All Subscription Plans (Admin)
GET /api/admin/subscription-plans?page=1&limit=20&status=active
Authorization: Bearer {admin_token}

Response:
{
  "status": "success",
  "data": {
    "plans": [
      {
        "_id": "planId",
        "name": "Basic Plan",
        "description": "Basic trading alerts",
        "price": 999,
        "duration": 30,
        "durationType": "days",
        "features": ["Real-time alerts", "Email support"],
        "status": "active",
        "stats": {
          "activeSubscriptions": 45,
          "totalSubscriptions": 67
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "pages": 1
    }
  }
}

# Create Subscription Plan
POST /api/admin/subscription-plans
Authorization: Bearer {admin_token}
Content-Type: application/json

Request:
{
  "name": "Premium Plan",
  "description": "Advanced trading strategies",
  "price": 1999,
  "duration": 30,
  "durationType": "days",
  "features": [
    "Real-time alerts",
    "Advanced strategies",
    "Priority support",
    "Custom indicators"
  ],
  "status": "active"
}

Response:
{
  "status": "success",
  "data": {
    "plan": {
      "_id": "newPlanId",
      "name": "Premium Plan",
      "price": 1999,
      "duration": 30,
      "durationType": "days",
      "features": [...],
      "status": "active"
    }
  },
  "message": "Subscription plan created successfully"
}

# Update Subscription Plan
PUT /api/admin/subscription-plans/{planId}
Authorization: Bearer {admin_token}
Content-Type: application/json

Request:
{
  "name": "Updated Premium Plan",
  "price": 2499,
  "features": ["Updated features list"]
}

Response:
{
  "status": "success",
  "data": {
    "plan": {
      "_id": "planId",
      "name": "Updated Premium Plan",
      "price": 2499,
      ...
    }
  },
  "message": "Subscription plan updated successfully"
}

# Delete Subscription Plan
DELETE /api/admin/subscription-plans/{planId}
Authorization: Bearer {admin_token}

Response:
{
  "status": "success",
  "message": "Subscription plan deleted successfully"
}
```

#### UPI Configuration Management
```
# Get UPI Configuration
GET /api/admin/upi/config
Authorization: Bearer {admin_token}

Response:
{
  "status": "success",
  "data": {
    "config": {
      "merchantName": "TradingBot Alerts",
      "merchantCode": "TB001",
      "vpa": "alerts@paytm"
    }
  }
}

# Update UPI Configuration
PUT /api/admin/upi/config
Authorization: Bearer {admin_token}
Content-Type: application/json

Request:
{
  "merchantName": "Updated Trading Alerts",
  "merchantCode": "UTA001",
  "vpa": "newalerts@paytm"
}

Response:
{
  "status": "success",
  "data": {
    "config": {
      "merchantName": "Updated Trading Alerts",
      "merchantCode": "UTA001",
      "vpa": "newalerts@paytm"
    }
  },
  "message": "UPI configuration updated successfully. Restart server to apply changes."
}
```

## Frontend Implementation Guidelines

### Frontend Implementation Guidelines

### User Frontend Flow

1. **Homepage**: 
   - Attractive landing page with hero section, features, testimonials
   - **NO SUBSCRIPTION DATA** - Keep it clean and focused on platform introduction
   - Include trading-themed animations and visual elements
   - Call-to-action directing to pricing page for plans

2. **Pricing Page**: 
   - **MANDATORY**: Fetch ALL plans dynamically from `/api/subscriptions/plans`
   - **NO HARDCODED/DEMO DATA** - All content must come from backend
   - Display plans in cards with features fetched from API
   - Real-time pricing and features from database
   - "Subscribe" button redirects to signup with selected plan

3. **Signup Process**:
   - User registration form
   - Plan selection (populated from API)
   - Payment QR code display (generated by backend)
   - Payment proof upload
   - Success message with next steps

### Admin Panel Flow

**CRITICAL**: Create a complete, functional admin panel with the following sections:

1. **Dashboard**: 
   - **ALL DATA FROM API**: Fetch statistics from `/api/admin/dashboard`
   - Real-time statistics cards (users, revenue, subscriptions)
   - Dynamic charts for revenue trends using Chart.js
   - Live recent activity feed from backend
   - **NO HARDCODED DATA** - Everything must be dynamic

2. **Payment Management**:
   - **API Integration**: `/api/admin/payments/pending` for payment list
   - Real-time pending payments table with pagination
   - Payment proof modal with image viewer
   - Functional approve/reject buttons with API calls
   - Status updates reflected immediately

3. **Subscription Management**:
   - **CRUD Operations**: Full create/edit/delete subscription plans
   - **API Endpoints**: Use `/api/admin/subscription-plans` endpoints
   - Dynamic features and pricing management
   - Real-time plan status toggle
   - Plan statistics and subscriber counts

4. **UPI Configuration**:
   - **API Integration**: `/api/admin/upi/config` for settings
   - Live UPI merchant details management
   - VPA (Virtual Payment Address) configuration
   - Merchant name and code settings
   - QR code generation settings with preview

5. **User Management**:
   - **API Integration**: `/api/admin/users` with search and pagination
   - User list with search, filter, and sort capabilities
   - User profile management and status updates
   - Subscription history for each user

### Technical Requirements

#### Data Integration (CRITICAL)
- **MANDATORY**: ALL data must come from backend APIs
- **STRICTLY FORBIDDEN**: No hardcoded, demo, or placeholder data
- **Real-time Updates**: Fetch fresh data on page loads and user actions
- **Dynamic Content**: All pricing, plans, statistics, and user data from database
- **API-First Approach**: Every piece of information should have a corresponding API endpoint

#### Authentication
- Store JWT tokens in localStorage
- Add Authorization header to all authenticated requests
- Implement token expiry handling
- Redirect to login on 401 responses

#### Error Handling
- Display user-friendly error messages
- Handle network errors gracefully
- Show loading states during API calls
- Implement retry mechanisms for failed API calls

#### Responsive Design
- Mobile-first approach
- CSS Grid/Flexbox for layouts
- Ensure all components work on mobile devices
- Trading-themed responsive breakpoints

#### File Upload
- Drag & drop for payment proof upload
- Image preview before upload
- Progress indicators with trading-style animations
- File type validation (jpg, png, pdf)
- Real-time upload status updates

### Design Requirements

#### Theme: Stock Market/Trading/Crypto/Forex
- **Color Scheme**: 
  - Primary: Dark blues (#1a1a2e, #16213e) and greens (#00d4aa, #4caf50) for profits
  - Secondary: Reds (#f44336, #e53e3e) for losses/alerts
  - Accent: Gold/Yellow (#ffd700, #ffb300) for premium features
  - Background: Dark theme preferred (#0f0f23, #1a1a2e)
  - Text: Light colors (#ffffff, #e0e0e0) on dark backgrounds

- **Typography**:
  - Use modern, clean fonts (Inter, Roboto, or system fonts)
  - Monospace fonts for numbers, prices, and data
  - Clear hierarchy with proper font weights

- **Visual Elements & Animations**:
  - **Candlestick Charts**: Animated candlestick patterns as background elements
  - **Live Charts**: Real-time chart animations with moving price lines
  - **Trading Symbols**: Animated currency symbols (₹, $, €, ₿, etc.)
  - **Trend Indicators**: Animated arrow indicators (↗️ ↘️) showing market movements
  - **Price Tickers**: Scrolling price ticker animations
  - **Chart Patterns**: Animated support/resistance lines and technical patterns
  - **Candle Animations**: Smooth candle formation animations
  - **Market Pulse**: Subtle pulsing effects for active trading elements
  - **Graph Backgrounds**: Dynamic chart grid patterns with subtle animations

- **UI Components**:
  - Card-based layouts with subtle shadows and hover animations
  - Animated buttons with trading-themed hover effects
  - Progress bars with chart-like styling for subscription status
  - Badge/chip components styled like trading tags
  - Modal dialogs with chart-inspired borders
  - Toast notifications styled like trading alerts with animations

#### Minimal & Professional Design
- **Layout**: Clean, spacious layouts with plenty of white space
- **Navigation**: Simple, intuitive navigation structure
- **Content**: Focus on essential information only
- **Interactions**: Smooth transitions and micro-animations
- **Forms**: Clean, well-spaced form fields with clear labels
- **Tables**: Minimal, data-focused tables with good readability

#### Avoid AI-Generated Look
- **Custom Elements**: Create unique, purposeful design elements
- **Authentic Content**: Use realistic trading terminology and data
- **Human Touch**: Add subtle imperfections and natural spacing
- **Consistent Branding**: Maintain consistent visual identity
- **Real-world Context**: Use actual trading scenarios and examples
- **Professional Polish**: Ensure high-quality, production-ready appearance

### Sample Code Structure (React.js)

```
trading-signals-frontend/
├── public/
│   ├── index.html
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── common/
│   │   │   ├── Header.jsx
│   │   │   ├── Footer.jsx
│   │   │   ├── LoadingSpinner.jsx
│   │   │   └── TradingChart.jsx
│   │   ├── animations/
│   │   │   ├── CandlestickAnimation.jsx
│   │   │   ├── PriceTicker.jsx
│   │   │   ├── TrendIndicator.jsx
│   │   │   └── ChartBackground.jsx
│   │   ├── user/
│   │   │   ├── HomePage.jsx
│   │   │   ├── PricingPage.jsx
│   │   │   ├── SignupPage.jsx
│   │   │   └── Dashboard.jsx
│   │   └── admin/
│   │       ├── AdminDashboard.jsx
│   │       ├── PaymentManagement.jsx
│   │       ├── SubscriptionManagement.jsx
│   │       ├── UserManagement.jsx
│   │       └── UPIConfiguration.jsx
│   ├── services/
│   │   ├── api.js
│   │   ├── auth.js
│   │   └── chartData.js
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useApi.js
│   │   └── useChartAnimation.js
│   ├── styles/
│   │   ├── globals.css
│   │   ├── trading-theme.css
│   │   └── animations.css
│   ├── utils/
│   │   ├── constants.js
│   │   └── helpers.js
│   ├── App.jsx
│   └── index.js
├── .env
├── package.json
└── README.md
```

### Required Trading Animations & Visual Elements

#### 1. Homepage Animations
- **Hero Section**: Animated candlestick chart background
- **Price Ticker**: Scrolling cryptocurrency/forex prices
- **Trend Arrows**: Animated up/down indicators
- **Chart Grid**: Subtle animated grid lines

#### 2. Interactive Chart Components
- **Live Chart Simulation**: Use Chart.js to create realistic trading charts
- **Candle Formation**: Smooth candle drawing animations
- **Volume Bars**: Animated volume indicators
- **Moving Averages**: Animated trend lines

#### 3. CSS Animations for Trading Theme
```css
/* Example trading animations */
.candle-animation {
  animation: candleGrow 2s ease-in-out infinite;
}

.price-ticker {
  animation: scroll 30s linear infinite;
}

.trend-up {
  color: #4caf50;
  animation: pulse 1.5s ease-in-out infinite;
}

.chart-grid {
  background: linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px);
  animation: gridMove 10s linear infinite;
}
```

### Content Configuration Example

```json
{
  "homepage": {
    "hero": {
      "title": "Professional Trading Alerts",
      "subtitle": "Get real-time TradingView alerts delivered to your Telegram",
      "ctaText": "Start Trading"
    },
    "features": [
      {
        "title": "Real-time Alerts",
        "description": "Instant notifications when trading opportunities arise",
        "icon": "⚡"
      }
    ]
  },
  "about": {
    "title": "About Our Trading System",
    "content": "We provide professional trading alerts..."
  }
}
```

### Key Features to Implement

#### User Frontend:
- ✅ Responsive design
- ✅ Plan comparison table
- ✅ Secure payment flow
- ✅ File upload with preview
- ✅ User dashboard with subscription status
- ✅ Content management via JSON

#### Admin Panel:
- ✅ Clean, professional interface
- ✅ Real-time statistics
- ✅ Payment approval workflow
- ✅ Subscription plan CRUD operations
- ✅ User management with search/pagination
- ✅ UPI configuration management
- ✅ QR code generation settings
- ✅ Payment method configuration

### Security Considerations

- Validate all inputs on frontend
- Sanitize user content
- Use HTTPS in production
- Implement CSRF protection
- Secure file upload handling

### Performance Optimization

- Lazy load images
- Minify CSS/JS
- Use CDN for assets
- Implement caching strategies
- Optimize API calls

## Getting Started

1. Set up the project structure as outlined above
2. Create the basic HTML templates
3. Implement authentication flow
4. Build the pricing page with API integration
5. Create the signup/payment flow
6. Develop the admin panel
7. Add responsive styling
8. Test all user flows

## Notes


- Ensure the payment flow works smoothly
- Admin panel should be intuitive for non-technical users
- All APIs are already implemented and tested
- Backend server runs on `http://localhost:3000`

Good luck with the development! The backend is fully functional and ready to support your frontend implementation.