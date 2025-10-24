#!/bin/bash
# ============================================================================
# Automatic Deployment Fix and Diagnostic Script
# Majestic Health App
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[⚠]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

# Configuration (will be replaced by deployment script)
LIGHTSAIL_IP="${LIGHTSAIL_IP:-YOUR_IP_HERE}"
LIGHTSAIL_INSTANCE="${LIGHTSAIL_INSTANCE:-majestic-app-instance}"
AWS_REGION="${AWS_REGION:-us-east-1}"
DB_ENDPOINT="health-app.c4vuie06a0wt.us-east-1.rds.amazonaws.com"

echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║        DEPLOYMENT FIX AND DIAGNOSTIC TOOL                            ║"
echo "║        Majestic Health App                                           ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# DIAGNOSTIC CHECKS
# ============================================================================

echo "═══════════════════════════════════════════════════════════════════════"
log_info "STEP 1: Running Diagnostics"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

ISSUES_FOUND=0

# Check 1: Application Connectivity
log_info "Checking application connectivity..."
if curl -sf --max-time 10 "http://${LIGHTSAIL_IP}/health" > /dev/null 2>&1; then
    log_success "Application is responding"
    HEALTH_STATUS=$(curl -s "http://${LIGHTSAIL_IP}/health" | jq -r '.status' 2>/dev/null || echo "unknown")
    log_info "Health status: $HEALTH_STATUS"
else
    log_error "Application is not responding"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check 2: Lightsail Instance State
log_info "Checking Lightsail instance state..."
INSTANCE_STATE=$(aws lightsail get-instance-state \
    --instance-name "$LIGHTSAIL_INSTANCE" \
    --region "$AWS_REGION" \
    --query 'state.name' \
    --output text 2>/dev/null || echo "unknown")

if [ "$INSTANCE_STATE" == "running" ]; then
    log_success "Instance is running"
else
    log_warning "Instance state: $INSTANCE_STATE"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check 3: DNS Resolution
log_info "Checking DNS resolution..."
if host "$LIGHTSAIL_IP" > /dev/null 2>&1; then
    log_success "DNS resolving correctly"
else
    log_warning "DNS may have issues, but IP should work"
fi

# Check 4: Port Accessibility
log_info "Checking port accessibility..."
for PORT in 80 443; do
    if timeout 5 bash -c "echo > /dev/tcp/${LIGHTSAIL_IP}/${PORT}" 2>/dev/null; then
        log_success "Port $PORT is accessible"
    else
        log_warning "Port $PORT may be blocked"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
done

# Check 5: Database Connectivity
log_info "Checking database connectivity..."
if command -v psql &> /dev/null; then
    if PGPASSWORD="simple123" psql -h "$DB_ENDPOINT" -U majestic -d health_app -c "SELECT 1;" > /dev/null 2>&1; then
        log_success "Database is accessible"
    else
        log_warning "Cannot connect to database"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
else
    log_info "psql not installed, skipping database check"
fi

# Check 6: RDS Status
log_info "Checking RDS status..."
RDS_STATUS=$(aws rds describe-db-instances \
    --region "$AWS_REGION" \
    --query "DBInstances[?Endpoint.Address=='$DB_ENDPOINT'].DBInstanceStatus" \
    --output text 2>/dev/null || echo "unknown")

if [ "$RDS_STATUS" == "available" ]; then
    log_success "RDS is available"
else
    log_warning "RDS status: $RDS_STATUS"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_info "Diagnostic Summary: $ISSUES_FOUND issues found"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# ============================================================================
# AUTOMATIC FIXES
# ============================================================================

if [ $ISSUES_FOUND -gt 0 ]; then
    echo "═══════════════════════════════════════════════════════════════════════"
    log_info "STEP 2: Applying Automatic Fixes"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""

    # Fix 1: Restart instance if not running
    if [ "$INSTANCE_STATE" != "running" ]; then
        log_info "Starting Lightsail instance..."
        aws lightsail start-instance \
            --instance-name "$LIGHTSAIL_INSTANCE" \
            --region "$AWS_REGION"
        
        log_info "Waiting for instance to start (60 seconds)..."
        sleep 60
        
        # Check new state
        NEW_STATE=$(aws lightsail get-instance-state \
            --instance-name "$LIGHTSAIL_INSTANCE" \
            --region "$AWS_REGION" \
            --query 'state.name' \
            --output text)
        
        if [ "$NEW_STATE" == "running" ]; then
            log_success "Instance started successfully"
        else
            log_warning "Instance state: $NEW_STATE"
        fi
    fi

    # Fix 2: Open firewall ports
    log_info "Ensuring firewall ports are open..."
    for PORT_CONFIG in "22,22,tcp" "80,80,tcp" "443,443,tcp"; do
        IFS=',' read -r FROM_PORT TO_PORT PROTOCOL <<< "$PORT_CONFIG"
        
        aws lightsail open-instance-public-ports \
            --region "$AWS_REGION" \
            --instance-name "$LIGHTSAIL_INSTANCE" \
            --port-info fromPort=$FROM_PORT,toPort=$TO_PORT,protocol=$PROTOCOL 2>/dev/null || true
        
        log_info "Port $FROM_PORT configured"
    done
    log_success "Firewall ports opened"

    # Fix 3: Configure RDS security group
    log_info "Configuring RDS access from Lightsail..."
    RDS_SG_ID=$(aws rds describe-db-instances \
        --region "$AWS_REGION" \
        --query "DBInstances[?Endpoint.Address=='$DB_ENDPOINT'].VpcSecurityGroups[0].VpcSecurityGroupId" \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$RDS_SG_ID" ] && [ "$RDS_SG_ID" != "None" ]; then
        aws ec2 authorize-security-group-ingress \
            --region "$AWS_REGION" \
            --group-id "$RDS_SG_ID" \
            --protocol tcp \
            --port 5432 \
            --cidr "${LIGHTSAIL_IP}/32" 2>/dev/null || log_info "Rule may already exist"
        
        log_success "RDS security group configured"
    else
        log_warning "Could not configure RDS security group automatically"
        log_info "Please manually allow $LIGHTSAIL_IP to access RDS on port 5432"
    fi

    # Fix 4: Wait and re-test
    log_info "Waiting for changes to take effect (30 seconds)..."
    sleep 30

    log_info "Re-testing application..."
    if curl -sf --max-time 10 "http://${LIGHTSAIL_IP}/health" > /dev/null 2>&1; then
        log_success "Application is now responding!"
    else
        log_warning "Application still not responding"
        log_info "May need more time to initialize. Wait 5-10 minutes and try again."
    fi
fi

# ============================================================================
# DETAILED STATUS REPORT
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_info "STEP 3: Detailed Status Report"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

echo "📋 Instance Information:"
aws lightsail get-instance \
    --instance-name "$LIGHTSAIL_INSTANCE" \
    --region "$AWS_REGION" \
    --query '{Name:name,State:state.name,IP:publicIpAddress,Blueprint:blueprintName,Bundle:bundleId}' \
    --output table 2>/dev/null || echo "Could not retrieve instance info"

echo ""
echo "🔌 Port Status:"
aws lightsail get-instance-port-states \
    --instance-name "$LIGHTSAIL_INSTANCE" \
    --region "$AWS_REGION" \
    --query 'portStates[*].[fromPort,toPort,protocol,state]' \
    --output table 2>/dev/null || echo "Could not retrieve port states"

echo ""
echo "🌐 Endpoint Tests:"
echo "   Testing: http://${LIGHTSAIL_IP}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${LIGHTSAIL_IP}" 2>/dev/null || echo "000")
echo "   Root endpoint: HTTP $HTTP_CODE"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${LIGHTSAIL_IP}/health" 2>/dev/null || echo "000")
echo "   Health endpoint: HTTP $HTTP_CODE"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${LIGHTSAIL_IP}/api/health-systems" 2>/dev/null || echo "000")
echo "   API endpoint: HTTP $HTTP_CODE"

# ============================================================================
# RECOMMENDATIONS
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_info "Recommendations"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

if [ $ISSUES_FOUND -eq 0 ]; then
    log_success "No issues found! Application appears healthy."
    echo ""
    echo "✅ Next steps:"
    echo "   1. Configure custom domain (optional)"
    echo "   2. Set up SSL/TLS certificate"
    echo "   3. Enable monitoring and alerts"
    echo "   4. Configure automated backups"
else
    log_warning "Some issues were detected. Recommended actions:"
    echo ""
    echo "1. Check User Data logs on the instance:"
    echo "   ssh -i majestic-app-keypair.pem ubuntu@${LIGHTSAIL_IP}"
    echo "   sudo tail -f /var/log/user-data.log"
    echo ""
    echo "2. Check application logs:"
    echo "   ssh -i majestic-app-keypair.pem ubuntu@${LIGHTSAIL_IP}"
    echo "   sudo docker logs majestic-app -f"
    echo ""
    echo "3. Verify RDS security group manually:"
    echo "   https://console.aws.amazon.com/rds/home?region=${AWS_REGION}"
    echo ""
    echo "4. If issues persist after 15 minutes:"
    echo "   - The User Data script may still be running"
    echo "   - Check /var/log/user-data.log for progress"
    echo "   - Verify Docker image exists in ECR"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_info "Useful Commands"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "# Test application"
echo "curl http://${LIGHTSAIL_IP}/health | jq ."
echo ""
echo "# Run full test suite"
echo "TARGET_URL='http://${LIGHTSAIL_IP}' node tests/endpoint-tests.js"
echo ""
echo "# View instance details"
echo "aws lightsail get-instance --instance-name ${LIGHTSAIL_INSTANCE}"
echo ""
echo "# SSH to instance (if you have the key)"
echo "ssh -i majestic-app-keypair.pem ubuntu@${LIGHTSAIL_IP}"
echo ""
echo "# Check RDS status"
echo "aws rds describe-db-instances --region ${AWS_REGION}"
echo ""

echo "═══════════════════════════════════════════════════════════════════════"
log_info "Diagnostic Complete"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
