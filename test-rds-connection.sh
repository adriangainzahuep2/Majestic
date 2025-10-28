#!/bin/bash

# ============================================================================
# AWS RDS CONNECTION TEST SCRIPT
# ============================================================================
# Purpose: Test RDS connectivity without SSH
# Provides multiple methods to verify database connection
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

# Configuration
DB_ENDPOINT="${1:-}"
DB_USERNAME="${2:-majestic}"
DB_PASSWORD="${3:-}"
DB_NAME="${4:-health_app}"
AWS_REGION="${5:-us-east-1}"

if [ -z "$DB_ENDPOINT" ] || [ -z "$DB_PASSWORD" ]; then
    echo "Usage: $0 <db-endpoint> <username> <password> [database] [region]"
    echo "Example: $0 mydb.xxxxxx.us-east-1.rds.amazonaws.com majestic mypassword health_app us-east-1"
    exit 1
fi

echo "═══════════════════════════════════════════════════════════════════"
log_info "AWS RDS Connection Test - Alternative to SSH"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# ============================================================================
# METHOD 1: AWS Systems Manager Session Manager (No SSH Required)
# ============================================================================

log_info "Method 1: AWS Systems Manager Session Manager"
log_info "This method uses SSM to connect without SSH..."

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI not found. Please install AWS CLI."
    exit 1
fi

# Get instance ID (for local testing, this would be the EC2 instance ID)
INSTANCE_ID=$(aws ec2 describe-instances \
    --region $AWS_REGION \
    --filters "Name=tag:Name,Values=*majestic*" "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text 2>/dev/null || echo "")

if [ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "None" ]; then
    log_info "Found EC2 instance: $INSTANCE_ID"
    
    # Test SSM connectivity
    if aws ssm describe-instance-information --region $AWS_REGION | grep -q "$INSTANCE_ID"; then
        log_success "SSM connectivity verified"
        log_info "You can connect using: aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION"
    else
        log_warning "SSM not available on this instance"
    fi
else
    log_warning "No running EC2 instances found with majestic tag"
fi

echo ""

# ============================================================================
# METHOD 2: Direct PostgreSQL Connection Test
# ============================================================================

log_info "Method 2: Direct PostgreSQL Connection Test"
log_info "Testing database connectivity using psql..."

# Install PostgreSQL client if not available
if ! command -v psql &> /dev/null; then
    log_info "Installing PostgreSQL client..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install postgresql
        else
            log_warning "Homebrew not found. Please install PostgreSQL manually."
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y postgresql-client
        elif command -v yum &> /dev/null; then
            sudo yum install -y postgresql
        fi
    fi
fi

if command -v psql &> /dev/null; then
    # Test connection
    log_info "Attempting database connection..."
    
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_ENDPOINT" -U "$DB_USERNAME" -d "$DB_NAME" -c "SELECT 'Connection successful' as status, version() as version;" --quiet 2>/dev/null; then
        log_success "Database connection successful!"
        
        # Get database information
        TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_ENDPOINT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
        USER_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_ENDPOINT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM pg_user WHERE usename = '$DB_USERNAME';" 2>/dev/null | tr -d ' ')
        
        log_info "Database Statistics:"
        echo "  • Tables in public schema: ${TABLE_COUNT:-0}"
        echo "  • User exists: ${USER_COUNT:-0}"
        
    else
        log_error "Database connection failed"
        log_info "Please check:"
        echo "  • Database endpoint is correct: $DB_ENDPOINT"
        echo "  • Username is correct: $DB_USERNAME"
        echo "  • Password is correct: [password not shown]"
        echo "  • Database name is correct: $DB_NAME"
        echo "  • Security group allows your IP"
    fi
else
    log_warning "PostgreSQL client not available"
fi

echo ""

# ============================================================================
# METHOD 3: AWS RDS Console/API Testing
# ============================================================================

log_info "Method 3: AWS RDS Console/API Testing"
log_info "Testing RDS instance status via AWS API..."

# Get RDS instance status
RDS_STATUS=$(aws rds describe-db-instances \
    --db-instance-identifier ${DB_ENDPOINT%%.*} \
    --region $AWS_REGION \
    --query 'DBInstances[0].DBInstanceStatus' \
    --output text 2>/dev/null || echo "UNKNOWN")

if [ "$RDS_STATUS" == "available" ]; then
    log_success "RDS instance is available"
else
    log_warning "RDS instance status: $RDS_STATUS"
fi

# Get connection endpoint
ACTUAL_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier ${DB_ENDPOINT%%.*} \
    --region $AWS_REGION \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text 2>/dev/null || echo $DB_ENDPOINT)

log_info "RDS Endpoint: $ACTUAL_ENDPOINT"

echo ""

# ============================================================================
# METHOD 4: Network Connectivity Test
# ============================================================================

log_info "Method 4: Network Connectivity Test"

# Test DNS resolution
if host "$DB_ENDPOINT" &>/dev/null; then
    log_success "DNS resolution successful"
else
    log_error "DNS resolution failed for $DB_ENDPOINT"
fi

# Test port connectivity
if nc -z -w5 "$DB_ENDPOINT" 5432 2>/dev/null; then
    log_success "Port 5432 is accessible"
else
    log_warning "Port 5432 is not accessible"
    log_info "This might indicate a security group issue"
fi

echo ""

# ============================================================================
# CONNECTION SUMMARY AND ALTERNATIVES
# ============================================================================

echo "═══════════════════════════════════════════════════════════════════"
log_success "CONNECTION TEST SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "🔗 CONNECTION METHODS (No SSH Required):"
echo ""
echo "1. AWS Systems Manager:"
echo "   aws ssm start-session --target <instance-id> --region $AWS_REGION"
echo ""
echo "2. Direct PostgreSQL Client:"
echo "   PGPASSWORD='password' psql -h $DB_ENDPOINT -U $DB_USERNAME -d $DB_NAME"
echo ""
echo "3. RDS Console:"
echo "   https://console.aws.amazon.com/rds/"
echo ""
echo "4. Application Connection:"
echo "   postgresql://$DB_USERNAME:***@$DB_ENDPOINT:5432/$DB_NAME"
echo ""
echo "🛠️  TROUBLESHOOTING:"
echo ""
echo "• If connection fails, check security groups"
echo "• Ensure your IP is allowed in RDS security group"
echo "• Verify database instance is in 'available' state"
echo "• Check VPC and subnet configuration"
echo ""
echo "═══════════════════════════════════════════════════════════════════"

# Save connection info for easy reference
cat > rds-connection-info.txt <<EOF
Majestic Health App - RDS Connection Information
================================================

Date: $(date)
Region: $AWS_REGION

Connection Details:
-------------------
Endpoint: $DB_ENDPOINT:5432
Database: $DB_NAME
Username: $DB_USERNAME
Password: [Use environment variable or secure vault]

Connection String:
------------------
postgresql://$DB_USERNAME:***@$DB_ENDPOINT:5432/$DB_NAME

Environment Variables:
----------------------
DATABASE_URL=postgresql://$DB_USERNAME:$DB_PASSWORD@$DB_ENDPOINT:5432/$DB_NAME

AWS CLI Commands:
-----------------
# Check instance status
aws rds describe-db-instances --db-instance-identifier ${DB_ENDPOINT%%.*} --region $AWS_REGION

# Test connection
PGPASSWORD="$DB_PASSWORD" psql -h $DB_ENDPOINT -U $DB_USERNAME -d $DB_NAME -c "SELECT version();"

# View logs
aws rds describe-db-log-files --db-instance-identifier ${DB_ENDPOINT%%.*} --region $AWS_REGION

EOF

log_success "Connection info saved to: rds-connection-info.txt"
log_info "Use this file for deployment configuration"