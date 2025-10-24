#!/bin/bash
# ============================================================================
# User Data Script for AWS Lightsail - Majestic Health App
# This script runs automatically when the instance starts
# ============================================================================

set -e
export DEBIAN_FRONTEND=noninteractive

# Logging
exec > >(tee -a /var/log/user-data.log)
exec 2>&1

echo "======================================"
echo "User Data Script Started: $(date)"
echo "======================================"

# ============================================================================
# INSTALL DEPENDENCIES
# ============================================================================

echo "[$(date)] Installing system dependencies..."
apt-get update
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    software-properties-common \
    unzip \
    postgresql-client \
    jq

# Install Docker
echo "[$(date)] Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker ubuntu

# Install Docker Compose
echo "[$(date)] Installing Docker Compose..."
DOCKER_COMPOSE_VERSION="2.23.0"
curl -L "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install AWS CLI
echo "[$(date)] Installing AWS CLI..."
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install
rm -rf aws awscliv2.zip

# Install Node.js
echo "[$(date)] Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# ============================================================================
# PREPARE APPLICATION DIRECTORY
# ============================================================================

echo "[$(date)] Creating application directory..."
mkdir -p /opt/majestic-app
cd /opt/majestic-app

# ============================================================================
# DOWNLOAD APPLICATION FROM S3 (if S3_BUCKET is set)
# ============================================================================

if [ -n "${S3_BUCKET}" ]; then
    echo "[$(date)] Downloading application from S3..."
    aws s3 cp s3://${S3_BUCKET}/application/ /opt/majestic-app/ --recursive
else
    echo "[$(date)] No S3_BUCKET specified, using pre-configured files..."
fi

# ============================================================================
# CREATE ENVIRONMENT FILE
# ============================================================================

echo "[$(date)] Creating environment configuration..."
cat > .env <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=${DATABASE_URL}
JWT_SECRET=${JWT_SECRET}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
OPENAI_API_KEY=${OPENAI_API_KEY}
DIAG_TOKEN=${DIAG_TOKEN}
ADMIN_EMAILS=${ADMIN_EMAILS}
SKIP_DB_INIT=${SKIP_DB_INIT:-false}
SKIP_GLOBAL_JOBS=${SKIP_GLOBAL_JOBS:-false}
EOF

# ============================================================================
# CREATE DOCKER COMPOSE FILE
# ============================================================================

echo "[$(date)] Creating docker-compose.yml..."
cat > docker-compose.yml <<'DOCKERCOMPOSE'
version: '3.8'

services:
  app:
    image: ${DOCKER_IMAGE}
    container_name: majestic-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
DOCKERCOMPOSE

# ============================================================================
# INITIALIZE DATABASE
# ============================================================================

if [ "${SKIP_DB_INIT}" != "true" ]; then
    echo "[$(date)] Initializing database..."
    
    # Download schema if available
    if [ -f "sql/schema.sql" ]; then
        echo "[$(date)] Applying database schema..."
        PGPASSWORD=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p') \
        psql $DATABASE_URL < sql/schema.sql || echo "Schema may already exist"
    fi
fi

# ============================================================================
# LOGIN TO ECR AND PULL IMAGE
# ============================================================================

echo "[$(date)] Logging in to ECR..."
AWS_REGION=$(echo $DATABASE_URL | sed -n 's/.*\.rds\.\([^.]*\)\..*/\1/p')
AWS_ACCOUNT_ID=$(echo ${DOCKER_IMAGE} | cut -d'.' -f1)

aws ecr get-login-password --region ${AWS_REGION:-us-east-1} | \
    docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION:-us-east-1}.amazonaws.com

echo "[$(date)] Pulling Docker image: ${DOCKER_IMAGE}..."
docker pull ${DOCKER_IMAGE}

# ============================================================================
# START APPLICATION
# ============================================================================

echo "[$(date)] Starting application with Docker Compose..."
docker-compose up -d

# ============================================================================
# SETUP NGINX REVERSE PROXY
# ============================================================================

echo "[$(date)] Setting up Nginx..."
apt-get install -y nginx

cat > /etc/nginx/sites-available/majestic-app <<'NGINXCONF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    server_name _;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
NGINXCONF

# Enable site
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/majestic-app /etc/nginx/sites-enabled/
systemctl restart nginx
systemctl enable nginx

# ============================================================================
# CREATE MONITORING SCRIPT
# ============================================================================

echo "[$(date)] Creating monitoring script..."
cat > /opt/majestic-app/monitor.sh <<'MONITOR'
#!/bin/bash
echo "=== Majestic App Status ==="
echo ""
echo "Docker Containers:"
docker ps -a
echo ""
echo "Application Health:"
curl -s http://localhost/health | jq . || echo "Application not responding"
echo ""
echo "Nginx Status:"
systemctl status nginx --no-pager
echo ""
echo "Recent Logs (last 20 lines):"
docker logs majestic-app --tail 20
MONITOR

chmod +x /opt/majestic-app/monitor.sh

# ============================================================================
# VERIFY DEPLOYMENT
# ============================================================================

echo "[$(date)] Waiting for application to start..."
sleep 30

# Wait for health check (up to 5 minutes)
MAX_ATTEMPTS=30
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health || echo "000")
    
    if [ "$HTTP_CODE" == "200" ]; then
        echo "[$(date)] ✓ Application is healthy!"
        break
    fi
    
    echo "[$(date)] Waiting for application... (attempt $((ATTEMPT+1))/$MAX_ATTEMPTS)"
    sleep 10
    ATTEMPT=$((ATTEMPT+1))
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo "[$(date)] ✗ Application failed to become healthy"
    echo "[$(date)] Docker logs:"
    docker logs majestic-app
else
    echo "[$(date)] ✓ Deployment successful!"
fi

# ============================================================================
# COMPLETION
# ============================================================================

echo "======================================"
echo "User Data Script Completed: $(date)"
echo "======================================"
echo ""
echo "Application URL: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
echo "Health Check: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)/health"
echo ""
echo "To monitor: /opt/majestic-app/monitor.sh"
echo "To view logs: docker logs majestic-app -f"
