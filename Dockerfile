# ============================================================================
# Majestic Health App - Docker Image
# ============================================================================

FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    postgresql-client

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
#COPY . .

# Copy application files
COPY app/ ./

# Build if needed (uncomment if using TypeScript or build step)
# RUN npm run build

# Production stage
FROM node:20-alpine

# Install dumb-init for proper signal handling
#RUN apk add --no-cache dumb-init


# Create app user
#RUN addgroup -g 1001 -S nodejs && \
#    adduser -S nodejs -u 1001

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Copy dependencies from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .


# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://0.0.0.0:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "server.js"]