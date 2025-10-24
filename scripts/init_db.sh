#!/bin/bash
# scripts/init-db.sh
# Initialize database and run migrations

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
ECS_CLUSTER="${ECS_CLUSTER:-majestic-cluster}"
TASK_FAMILY="${TASK_FAMILY:-majestic-app}"
MAX_WAIT_TIME=600  # 10 minutes

# Get private subnet ID
get_private_subnet() {
    aws ec2 describe-subnets \
        --filters "Name=tag:Type,Values=Private" \
        --query 'Subnets[0].SubnetId' \
        --output text \
        --region "$AWS_REGION"
}

# Get ECS security group
get_security_group() {
    aws ec2 describe-security-groups \
        --filters "Name=tag:Name,Values=*ecs-instances*" \
        --query 'SecurityGroups[0].GroupId' \
        --output text \
        --region "$AWS_REGION"
}

# Check database connectivity
check_database_connection() {
    log_info "Checking database connectivity..."
    
    local db_endpoint=$(aws rds describe-db-instances \
        --db-instance-identifier majestic-postgres \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text \
        --region "$AWS_REGION" 2>/dev/null)
    
    if [ -z "$db_endpoint" ]; then
        log_error "Could not retrieve RDS endpoint"
        return 1
    fi
    
    log_info "Database endpoint: $db_endpoint"
    
    # Check if RDS is available
    local db_status=$(aws rds describe-db-instances \
        --db-instance-identifier majestic-postgres \
        --query 'DBInstances[0].DBInstanceStatus' \
        --output text \
        --region "$AWS_REGION")
    
    if [ "$db_status" != "available" ]; then
        log_warn "Database status: $db_status (waiting for 'available')"
        return 1
    fi
    
    log_info "✓ Database is available"
    return 0
}

# Wait for database to be ready
wait_for_database() {
    log_info "Waiting for database to be ready..."
    
    local elapsed=0
    local interval=15
    
    while [ $elapsed -lt $MAX_WAIT_TIME ]; do
        if check_database_connection; then
            return 0
        fi
        
        log_info "Waiting... ($elapsed/$MAX_WAIT_TIME seconds)"
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    log_error "Database did not become available within timeout"
    return 1
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    local subnet_id=$(get_private_subnet)
    local security_group=$(get_security_group)
    
    if [ -z "$subnet_id" ] || [ -z "$security_group" ]; then
        log_error "Could not retrieve network configuration"
        return 1
    fi
    
    log_info "Using subnet: $subnet_id"
    log_info "Using security group: $security_group"
    
    # Run migration task
    local task_arn=$(aws ecs run-task \
        --cluster "$ECS_CLUSTER" \
        --task-definition "$TASK_FAMILY" \
        --launch-type EC2 \
        --overrides '{
            "containerOverrides": [{
                "name": "majestic-app",
                "command": ["npm", "run", "migrate"]
            }]
        }' \
        --query 'tasks[0].taskArn' \
        --output text \
        --region "$AWS_REGION" 2>&1)
    
    if [[ "$task_arn" == *"error"* ]] || [ -z "$task_arn" ]; then
        log_error "Failed to start migration task: $task_arn"
        return 1
    fi
    
    log_info "Migration task started: $task_arn"
    
    # Wait for task to complete
    log_info "Waiting for migrations to complete..."
    
    if ! aws ecs wait tasks-stopped \
        --cluster "$ECS_CLUSTER" \
        --tasks "$task_arn" \
        --region "$AWS_REGION"; then
        log_error "Task wait failed or timed out"
        return 1
    fi
    
    # Check exit code
    local exit_code=$(aws ecs describe-tasks \
        --cluster "$ECS_CLUSTER" \
        --tasks "$task_arn" \
        --query 'tasks[0].containers[0].exitCode' \
        --output text \
        --region "$AWS_REGION")
    
    if [ "$exit_code" != "0" ]; then
        log_error "Migration failed with exit code: $exit_code"
        
        # Get logs
        log_info "Fetching logs..."
        local log_stream=$(aws ecs describe-tasks \
            --cluster "$ECS_CLUSTER" \
            --tasks "$task_arn" \
            --query 'tasks[0].containers[0].name' \
            --output text \
            --region "$AWS_REGION")
        
        aws logs tail "/ecs/majestic-app" \
            --follow=false \
            --since 5m \
            --region "$AWS_REGION" 2>/dev/null || true
        
        return 1
    fi
    
    log_info "✓ Migrations completed successfully"
    return 0
}

# Verify migrations
verify_migrations() {
    log_info "Verifying database migrations..."
    
    local subnet_id=$(get_private_subnet)
    local security_group=$(get_security_group)
    
    # Run verification task
    local task_arn=$(aws ecs run-task \
        --cluster "$ECS_CLUSTER" \
        --task-definition "$TASK_FAMILY" \
        --launch-type EC2 \
        --overrides '{
            "containerOverrides": [{
                "name": "majestic-app",
                "command": ["npm", "run", "db:status"]
            }]
        }' \
        --query 'tasks[0].taskArn' \
        --output text \
        --region "$AWS_REGION" 2>/dev/null)
    
    if [ -z "$task_arn" ]; then
        log_warn "Could not verify migrations"
        return 0
    fi
    
    aws ecs wait tasks-stopped \
        --cluster "$ECS_CLUSTER" \
        --tasks "$task_arn" \
        --region "$AWS_REGION" 2>/dev/null || true
    
    log_info "✓ Migration verification complete"
}

# Seed initial data (optional)
seed_database() {
    log_info "Seeding initial data..."
    
    local subnet_id=$(get_private_subnet)
    local security_group=$(get_security_group)
    
    local task_arn=$(aws ecs run-task \
        --cluster "$ECS_CLUSTER" \
        --task-definition "$TASK_FAMILY" \
        --launch-type EC2 \
        --overrides '{
            "containerOverrides": [{
                "name": "majestic-app",
                "command": ["npm", "run", "seed"]
            }]
        }' \
        --query 'tasks[0].taskArn' \
        --output text \
        --region "$AWS_REGION" 2>/dev/null)
    
    if [ -z "$task_arn" ]; then
        log_warn "Could not run seed task (may not be needed)"
        return 0
    fi
    
    aws ecs wait tasks-stopped \
        --cluster "$ECS_CLUSTER" \
        --tasks "$task_arn" \
        --region "$AWS_REGION" 2>/dev/null || true
    
    log_info "✓ Database seeding complete"
}

# Main
main() {
    log_info "=== Database Initialization ==="
    log_info "Region: $AWS_REGION"
    log_info "Cluster: $ECS_CLUSTER"
    
    # Wait for database
    if ! wait_for_database; then
        log_error "Database initialization failed"
        exit 1
    fi
    
    # Run migrations
    if ! run_migrations; then
        log_error "Migration process failed"
        exit 1
    fi
    
    # Verify migrations
    verify_migrations
    
    # Seed data (optional)
    if [ "${SEED_DATABASE:-false}" == "true" ]; then
        seed_database
    fi
    
    log_info "=== ✓ Database initialization completed ==="
}

# Trap errors
trap 'log_error "Script interrupted"; exit 130' INT TERM

main "$@"
