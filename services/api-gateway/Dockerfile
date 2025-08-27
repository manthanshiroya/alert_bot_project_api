# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory in container
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S alertbot -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy shared modules
COPY ../../shared ./shared

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p logs temp

# Set proper permissions
RUN chown -R alertbot:nodejs /app
RUN chmod -R 755 /app

# Switch to non-root user
USER alertbot

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["npm", "start"]