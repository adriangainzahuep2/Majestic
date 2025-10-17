# Stage 1: Build the application
FROM node:18-alpine AS builder

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .

# Stage 2: Production image
FROM node:18-alpine

# Set the working directory
WORKDIR /usr/src/app

# Copy dependencies from the builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy application code from the builder stage
COPY --from=builder /usr/src/app .

# Expose the port the app runs on
EXPOSE 5000

# Define the command to run the application
CMD ["node", "server.js"]