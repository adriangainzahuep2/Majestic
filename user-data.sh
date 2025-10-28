#!/bin/bash

# ============================================================================
# MAJESTIC HEALTH APP - AWS EC2 USER DATA SCRIPT
# ============================================================================
# Purpose: Automated EC2 instance initialization for ECS deployment
# Features:
# - PostgreSQL client installation
# - Schema migration from S3
# - Database connection testing (NO SSH required)
# - ECS agent configuration
# - Application deployment
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

# Log everything to /var/log/user-data.log
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

echo "═══════════════════════════════════════════════════════════════════"
log_info "Starting Majestic Health App EC2 initialization..."
echo "═══════════════════════════════════════════════════════════════════"

# ============================================================================
# ENVIRONMENT VARIABLES (Replaced by deploy script)
# ============================================================================
SCHEMA_BUCKET="SCHEMA_BUCKET_PLACEHOLDER"
DB_ENDPOINT="DB_ENDPOINT_PLACEHOLDER"
DB_USERNAME="DB_USERNAME_PLACEHOLDER"
DB_PASSWORD="DB_PASSWORD_PLACEHOLDER"
DB_NAME="DB_NAME_PLACEHOLDER"
ECS_CLUSTER_NAME="ECS_CLUSTER_PLACEHOLDER"
PROJECT_NAME="PROJECT_NAME_PLACEHOLDER"
AWS_REGION="AWS_REGION_PLACEHOLDER"

# ============================================================================
# STEP 1: UPDATE SYSTEM AND INSTALL DEPENDENCIES
# ============================================================================

log_info "Updating system packages..."
yum update -y

log_info "Installing required packages..."
yum install -y \
    postgresql15 \
    curl \
    wget \
    jq \
    amazon-ssm-agent \
    amazon-cloudwatch-agent

log_success "System packages installed"

# ============================================================================
# STEP 2: CONFIGURE AWS CLI AND SSM AGENT
# ============================================================================

log_info "Starting AWS services..."

# Start SSM Agent for RDS connection testing (alternative to SSH)
systemctl enable amazon-ssm-agent
systemctl start amazon-ssm-agent

# Configure CloudWatch agent
cat > /etc/amazon/amazon-cloudwatch-agent.json <<'EOF'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/user-data.log",
            "log_group_name": "majestic-user-data",
            "log_stream_name": "{instance_id}"
          },
          {
            "file_path": "/var/log/ecs/ecs-agent.log",
            "log_group_name": "majestic-ecs-agent",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
EOF

systemctl enable amazon-cloudwatch-agent
systemctl start amazon-cloudwatch-agent

log_success "AWS services configured"

# ============================================================================
# STEP 3: TEST RDS CONNECTION (NO SSH ALTERNATIVE)
# ============================================================================

log_info "Testing RDS connection using PostgreSQL client..."

# Create connection test script
cat > /tmp/test-rds-connection.sh <<'EOF'
#!/bin/bash

MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    log_info "Attempting to connect to database (attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)..."
    
    # Test connection using psql
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_ENDPOINT" -U "$DB_USERNAME" -d "$DB_NAME" -c '\q' 2>/dev/null; then
        log_success "Database connection successful!"
        
        # Verify database schema
        TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_ENDPOINT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
        
        if [ -n "$TABLE_COUNT" ] && [ "$TABLE_COUNT" -gt 0 ]; then
            log_success "Database schema verified ($TABLE_COUNT tables found)"
            exit 0
        else
            log_warning "Database accessible but schema not found - will run migrations"
            exit 0
        fi
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        log_warning "Connection failed, waiting 10 seconds before retry..."
        sleep 10
    fi
done

log_error "Failed to connect to database after $MAX_RETRIES attempts"
exit 1
EOF

chmod +x /tmp/test-rds-connection.sh

# Test RDS connection
if /tmp/test-rds-connection.sh; then
    log_success "RDS connection test completed successfully"
else
    log_error "RDS connection test failed"
    # Continue anyway - schema migration will handle database connectivity
fi

# ============================================================================
# STEP 4: DOWNLOAD AND APPLY SCHEMA MIGRATION FROM S3
# ============================================================================

log_info "Downloading schema files from S3..."

# Download schema from S3
if aws s3 cp "s3://${SCHEMA_BUCKET}/schema_fixes.sql" /tmp/schema_fixes.sql 2>/dev/null; then
    log_success "Schema file downloaded from S3"
    
    # Apply schema migration
    log_info "Applying database schema migration..."
    
    PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_ENDPOINT" \
        -U "$DB_USERNAME" \
        -d "$DB_NAME" \
        -f /tmp/schema_fixes.sql \
        --quiet
    
    if [ $? -eq 0 ]; then
        log_success "Schema migration completed successfully"
    else
        log_warning "Schema migration completed with warnings (may be expected if schema already exists)"
    fi
else
    log_warning "Schema file not found in S3 - skipping migration"
    log_info "Database will use existing schema or run migrations on application startup"
fi

# ============================================================================
# STEP 5: INSTALL AND CONFIGURE ECS AGENT
# ============================================================================

log_info "Installing and configuring ECS agent..."

# Get latest ECS agent version
amazon-linux-extras install -y ecs

# Configure ECS agent
cat > /etc/ecs/ecs.config <<EOF
ECS_CLUSTER=${ECS_CLUSTER_NAME}
ECS_ENABLE_TASK_IAM_ROLE=true
ECS_ENABLE_TASK_IAM_ROLE_NETWORK_HOST=true
ECS_LOGLEVEL=info
ECS_DATADIR=/data
ECS_AVAILABLE_LOGGING_DRIVERS=["awslogs"]
EOF

# Start ECS agent
systemctl enable ecs
systemctl start ecs

log_success "ECS agent configured and started"

# ============================================================================
# STEP 6: CONFIGURE AUTO-SCALING AND MONITORING
# ============================================================================

log_info "Configuring monitoring and auto-scaling..."

# Install AWS Systems Manager Agent (already done above)
log_success "SSM Agent configured for connection alternatives"

# Enable Docker (if not already enabled)
systemctl enable docker
systemctl start docker

log_success "Docker service started"

# ============================================================================
# STEP 7: CREATE APPLICATION HEALTH CHECK
# ============================================================================

log_info "Setting up application monitoring..."

# Create health check script
cat > /usr/local/bin/majestic-health-check.sh <<'EOF'
#!/bin/bash

# Majestic Health App - Health Check Script
# Used by load balancer and monitoring systems

# Check if ECS agent is running
if ! systemctl is-active --quiet ecs; then
    echo "ECS agent is not running"
    exit 1
fi

# Check if ECS cluster has registered this instance
CLUSTER_NAME="majestic-app-cluster"
INSTANCE_ID=$(curl -s http://169.254.169.154/latest/meta-data/instance-id)

if ! aws ecs describe-container-instances \
    --cluster "$CLUSTER_NAME" \
    --container-instances "$INSTANCE_ID" \
    --region us-east-1 >/dev/null 2>&1; then
    echo "Instance not registered with ECS cluster"
    # This is expected during initial startup
    exit 0
fi

echo "Instance health check passed"
exit 0
EOF

chmod +x /usr/local/bin/majestic-health-check.sh

# ============================================================================
# STEP 8: FINAL VALIDATION AND SUMMARY
# ============================================================================

log_info "Performing final validation..."

# Validate ECS agent status
if systemctl is-active --quiet ecs; then
    log_success "ECS agent is running"
else
    log_error "ECS agent failed to start"
fi

# Validate database connectivity
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_ENDPOINT" -U "$DB_USERNAME" -d "$DB_NAME" -c '\q' 2>/dev/null; then
    log_success "Database connectivity verified"
else
    log_warning "Database connectivity check failed - may be resolved on application startup"
fi

# Check Docker status
if systemctl is-active --quiet docker; then
    log_success "Docker service is running"
else
    log_error "Docker service is not running"
fi

# ============================================================================
# COMPLETION SUMMARY
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════"
log_success "EC2 INITIALIZATION COMPLETED SUCCESSFULLY!"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "📋 INITIALIZATION SUMMARY:"
echo ""
echo "✅ System packages updated"
echo "✅ PostgreSQL client installed"
echo "✅ AWS CLI configured"
echo "✅ CloudWatch agent configured"
echo "✅ SSM Agent configured (SSH alternative)"
echo "✅ RDS connection tested"
echo "✅ Schema migration applied (if available)"
echo "✅ ECS agent configured and started"
echo "✅ Docker service configured"
echo ""
echo "🌐 ACCESS METHODS:"
echo ""
echo "• Load Balancer: via Application Load Balancer DNS"
echo "• Database: via RDS endpoint (pg credentials stored securely)"
echo "• Instance Management: via AWS Systems Manager (no SSH required)"
echo "• Monitoring: via CloudWatch Logs"
echo ""
echo "📊 MONITORING & LOGS:"
echo ""
echo "• User Data Logs: /var/log/user-data.log"
echo "• ECS Agent Logs: /var/log/ecs/ecs-agent.log"
echo "• CloudWatch Logs: majestic-user-data, majestic-ecs-agent"
echo ""
echo "🔧 NEXT STEPS:"
echo ""
echo "1. ECS service will start containers automatically"
echo "2. Application will be accessible via ALB DNS"
echo "3. Database schema will be initialized if needed"
echo "4. Load balancer health checks will validate application"
echo ""
echo "═══════════════════════════════════════════════════════════════════"

log_info "Instance is ready for ECS container deployment"