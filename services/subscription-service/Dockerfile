# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory in container
WORKDIR /app

# Install system dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S subscription -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy shared utilities (if they exist)
COPY ../../shared ./shared

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p logs temp uploads && \
    chown -R subscription:nodejs /app

# Switch to non-root user
USER subscription

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node healthcheck.js

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3002
ENV HOST=0.0.0.0

# Start the application
CMD ["npm", "start"]

# Labels for metadata
LABEL maintainer="Alert Bot Team"
LABEL version="1.0.0"
LABEL description="Subscription Service for Alert Bot"
LABEL service="subscription-service"