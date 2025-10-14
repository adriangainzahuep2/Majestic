# Stage 1: Builder
# This stage installs dependencies and builds the application if necessary.
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install production dependencies
# Using 'npm ci' for faster, more reliable builds from package-lock.json
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# If you had a build step (e.g., for TypeScript), it would go here:
# RUN npm run build

# Stage 2: Production
# This stage creates the final, lean image.
FROM node:18-alpine

# Install dumb-init for proper signal handling and process management
RUN apk add --no-cache dumb-init

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set the working directory
WORKDIR /app

# Copy dependencies from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application code from the builder stage
COPY --from=builder /app .

# Change ownership of the app directory to the non-root user
RUN chown -R appuser:appgroup /app

# Switch to the non-root user
USER appuser

# Expose the port the app runs on
EXPOSE 5000

# Health check to ensure the container is running correctly
# This is used by Docker and ECS to verify application health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

# Use dumb-init as the entrypoint to be the PID 1 process
# It correctly passes signals to the node process.
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Command to run the application
CMD ["node", "server.js"]