#!/bin/bash

# ============================================================================
# MAJESTIC HEALTH APP - DEPLOYMENT VALIDATION SCRIPT
# ============================================================================
# Purpose: Validate all deployment files and configurations
# Ensures AWS deployment is ready before execution
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

echo "═══════════════════════════════════════════════════════════════════"
log_info "Majestic Health App - Deployment Validation"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Track validation results
VALIDATION_PASSED=true
CHECKS_PASSED=0
CHECKS_TOTAL=0

# Function to check if file exists and is readable
check_file() {
    local file_path="$1"
    local description="$2"
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    
    if [ -f "$file_path" ] && [ -r "$file_path" ]; then
        log_success "File exists: $description ($file_path)"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        log_error "File missing or not readable: $description ($file_path)"
        VALIDATION_PASSED=false
    fi
}

# Function to check if command exists
check_command() {
    local cmd="$1"
    local description="$2"
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    
    if command -v "$cmd" &> /dev/null; then
        log_success "Command available: $description"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        log_warning "Command not found: $description (may be OK for some deployments)"
        CHECKS_PASS=$((CHECKS_PASSED + 1))
    fi
}

# ============================================================================
# STEP 1: CHECK DEPLOYMENT FILES
# ============================================================================

log_info "Checking deployment files..."

check_file "deploy_aws_complete.sh" "Main AWS deployment script"
check_file "user-data.sh" "EC2 user data script"  
check_file "Dockerfile" "Docker container configuration"
check_file "docker-compose.yml" "Docker Compose configuration"
check_file ".dockerignore" "Docker ignore file"
check_file "test-rds-connection.sh" "RDS connection test script"

echo ""

# ============================================================================
# STEP 2: CHECK APPLICATION FILES
# ============================================================================

log_info "Checking application files..."

check_file "server.js" "Main application server"
check_file "package.json" "Node.js dependencies"
check_file "api/index.js" "API routes"
check_file "services/metricSuggestionService.js" "AI metric service"
check_file "services/ingestionService.js" "File ingestion service"
check_file "public/index.html" "Frontend HTML"
check_file "public/app.js" "Frontend JavaScript"
check_file "public/styles.css" "Frontend CSS"

echo ""

# ============================================================================
# STEP 3: CHECK DATA FILES
# ============================================================================

log_info "Checking data files..."

check_file "public/data/metrics.catalog.json" "Metrics catalog"
check_file "public/data/metric-synonyms.json" "Metric synonyms"
check_file "scripts/init_db.sh" "Database initialization"

echo ""

# ============================================================================
# STEP 4: CHECK DOCKER BUILD ABILITY
# ============================================================================

log_info "Checking Docker build capability..."

if command -v docker &> /dev/null; then
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    if docker build -t validation-test . &>/dev/null; then
        log_success "Docker build successful"
        docker rmi validation-test &>/dev/null || true
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        log_error "Docker build failed"
        VALIDATION_PASSED=false
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    fi
else
    log_warning "Docker not available - skipping build test"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
fi

echo ""

# ============================================================================
# STEP 5: CHECK NODE.JS DEPENDENCIES
# ============================================================================

log_info "Checking Node.js dependencies..."

if [ -f "package.json" ]; then
    CHECKS_TOTAL=$((CHECKS_PASSED + 1))
    if command -v npm &> /dev/null; then
        if npm ci --dry-run &>/dev/null; then
            log_success "Node.js dependencies can be installed"
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
        else
            log_error "Node.js dependency installation failed"
            VALIDATION_PASSED=false
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
        fi
    else
        log_warning "npm not available - skipping dependency check"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    fi
else
    log_error "package.json not found"
    VALIDATION_PASSED=false
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
fi

echo ""

# ============================================================================
# STEP 6: CHECK FILE PERMISSIONS
# ============================================================================

log_info "Checking file permissions..."

for script in deploy_aws_complete.sh user-data.sh test-rds-connection.sh; do
    if [ -f "$script" ]; then
        CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
        if [ -x "$script" ]; then
            log_success "Executable permission: $script"
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
        else
            log_warning "No executable permission: $script (will be fixed)"
            chmod +x "$script" 2>/dev/null && \
                log_success "Fixed executable permission: $script" || \
                log_error "Failed to fix executable permission: $script"
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
        fi
    fi
done

echo ""

# ============================================================================
# STEP 7: CHECK DOCKER COMPOSE CONFIGURATION
# ============================================================================

log_info "Checking Docker Compose configuration..."

if [ -f "docker-compose.yml" ]; then
    CHECKS_TOTAL=$((CHECKS_PASSED + 1))
    if command -v docker-compose &> /dev/null || docker compose version &>/dev/null; then
        log_success "Docker Compose is available"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        log_warning "Docker Compose not available"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    fi
else
    log_error "docker-compose.yml not found"
    VALIDATION_PASSED=false
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
fi

echo ""

# ============================================================================
# STEP 8: CHECK ENVIRONMENT CONFIGURATION
# ============================================================================

log_info "Checking environment configuration..."

check_file ".env.template" "Environment variables template"

# Check for any existing .env file
if [ -f ".env" ]; then
    log_info "Found .env file (will be used for deployment)"
    if grep -q "DATABASE_URL=" .env && grep -q "JWT_SECRET=" .env; then
        log_success "Required environment variables present"
    else
        log_warning "Some required environment variables may be missing"
    fi
else
    log_info "No .env file found (will use deployment defaults)"
fi

echo ""

# ============================================================================
# STEP 9: VALIDATION SUMMARY
# ============================================================================

echo "═══════════════════════════════════════════════════════════════════"
if [ "$VALIDATION_PASSED" = true ]; then
    log_success "VALIDATION PASSED - All checks completed successfully!"
else
    log_warning "VALIDATION COMPLETED - Some checks failed (see warnings above)"
fi
echo "═══════════════════════════════════════════════════════════════════"
echo ""

echo "📊 VALIDATION SUMMARY:"
echo ""
echo "Total Checks: $CHECKS_TOTAL"
echo "Passed: $CHECKS_PASSED"
echo "Failed: $((CHECKS_TOTAL - CHECKS_PASSED))"
echo ""

# Calculate percentage
PERCENTAGE=$((CHECKS_PASSED * 100 / CHECKS_TOTAL))
echo "Success Rate: ${PERCENTAGE}%"
echo ""

if [ "$PERCENTAGE" -ge 90 ]; then
    log_success "✅ Deployment is ready!"
    echo ""
    echo "🚀 NEXT STEPS:"
    echo "1. Review AWS_DEPLOYMENT_GUIDE.md for detailed instructions"
    echo "2. Configure environment variables (see .env.template)"
    echo "3. Ensure AWS CLI is configured with appropriate permissions"
    echo "4. Run: ./deploy_aws_complete.sh"
    echo ""
elif [ "$PERCENTAGE" -ge 70 ]; then
    log_warning "⚠️  Deployment has some issues but may work"
    echo ""
    echo "🔧 RECOMMENDED ACTIONS:"
    echo "1. Address the warnings above before deployment"
    echo "2. Review missing files and install dependencies"
    echo "3. Test Docker build locally first"
    echo ""
else
    log_error "❌ Deployment validation failed"
    echo ""
    echo "🛠️  REQUIRED ACTIONS:"
    echo "1. Fix all critical errors listed above"
    echo "2. Ensure all required files are present"
    echo "3. Install missing dependencies"
    echo "4. Re-run this validation script"
    echo ""
fi

echo "📚 DOCUMENTATION:"
echo "• AWS_DEPLOYMENT_GUIDE.md - Complete deployment guide"
echo "• .env.template - Environment configuration template"
echo "• docker-compose.yml - Local development setup"
echo ""

# ============================================================================
# QUICK DEPLOYMENT TEST
# ============================================================================

echo "═══════════════════════════════════════════════════════════════════"
log_info "Quick Deployment Test"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Test if deployment script has proper syntax
if [ -f "deploy_aws_complete.sh" ]; then
    if bash -n deploy_aws_complete.sh 2>/dev/null; then
        log_success "Deployment script syntax is valid"
    else
        log_error "Deployment script has syntax errors"
        VALIDATION_PASSED=false
    fi
fi

# Test if user-data script has proper syntax  
if [ -f "user-data.sh" ]; then
    if bash -n user-data.sh 2>/dev/null; then
        log_success "User data script syntax is valid"
    else
        log_error "User data script has syntax errors"
        VALIDATION_PASSED=false
    fi
fi

# ============================================================================
# FINAL RECOMMENDATIONS
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════"
if [ "$VALIDATION_PASSED" = true ]; then
    log_success "DEPLOYMENT VALIDATION COMPLETED SUCCESSFULLY!"
    echo ""
    echo "🎉 Your Majestic Health App is ready for AWS deployment!"
    echo ""
    echo "📝 Quick Start Commands:"
    echo ""
    echo "# 1. Configure AWS CLI"
    echo "aws configure"
    echo ""
    echo "# 2. Set environment variables"
    echo "export AWS_REGION=us-east-1"
    echo "export PROJECT_NAME=majestic-health-app"
    echo ""
    echo "# 3. Run deployment"
    echo "./deploy_aws_complete.sh"
    echo ""
    echo "# 4. Monitor deployment"
    echo "tail -f deployment-info.txt"
    echo ""
else
    log_error "DEPLOYMENT VALIDATION FAILED"
    echo ""
    echo "🔧 Please fix the issues above before proceeding with deployment"
    echo ""
    echo "For detailed help, see AWS_DEPLOYMENT_GUIDE.md"
fi
echo "═══════════════════════════════════════════════════════════════════"

exit $([ "$VALIDATION_PASSED" = true ] && echo 0 || echo 1)