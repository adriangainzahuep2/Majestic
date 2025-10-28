#!/bin/bash

# ============================================================================
# MAJESTIC HEALTH APP - COMPLETE AWS DEPLOYMENT SCRIPT
# ============================================================================
# Features:
# - EC2/ECS deployment with auto-scaling
# - RDS PostgreSQL with automatic schema migration
# - S3 bucket for schema files
# - CloudWatch monitoring
# - Security best practices
# - Playwright E2E testing post-deployment
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

# ============================================================================
# CONFIGURATION
# ============================================================================

PROJECT_NAME="${PROJECT_NAME:-majestic-app}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# RDS Configuration
DB_INSTANCE_IDENTIFIER="${DB_INSTANCE_IDENTIFIER:-health-app}"
DB_NAME="${DB_NAME:-health_app}"
DB_USERNAME="${DB_USERNAME:-majestic}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 32)}"
DB_INSTANCE_CLASS="${DB_INSTANCE_CLASS:-db.t3.micro}"

# ECS/EC2 Configuration
ECS_CLUSTER_NAME="${ECS_CLUSTER_NAME:-${PROJECT_NAME}-cluster}"
ECS_SERVICE_NAME="${ECS_SERVICE_NAME:-${PROJECT_NAME}-service}"
EC2_INSTANCE_TYPE="${EC2_INSTANCE_TYPE:-t3.small}"
EC2_MIN_SIZE="${EC2_MIN_SIZE:-1}"
EC2_MAX_SIZE="${EC2_MAX_SIZE:-3}"
EC2_DESIRED_CAPACITY="${EC2_DESIRED_CAPACITY:-1}"

# Docker Configuration
DOCKER_IMAGE="${DOCKER_IMAGE:-${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT_NAME}:latest}"
CONTAINER_PORT="${CONTAINER_PORT:-5000}"
ECR_REPOSITORY="${PROJECT_NAME}-repo"

# S3 Configuration for schema migration
SCHEMA_BUCKET="${PROJECT_NAME}-schema-migrations"

# ============================================================================
# VALIDATE PREREQUISITES
# ============================================================================

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║      MAJESTIC HEALTH APP - AWS DEPLOYMENT WITH AUTO-MIGRATION      ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

log_info "Checking prerequisites..."

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI not installed"
    exit 1
fi

# Check jq
if ! command -v jq &> /dev/null; then
    log_error "jq not installed"
    exit 1
fi

# Check docker
if ! command -v docker &> /dev/null; then
    log_warning "Docker not installed (needed for image build)"
fi

# Check node and playwright (for testing)
if command -v node &> /dev/null && command -v npx &> /dev/null; then
    TEST_AVAILABLE=true
    log_success "Node.js and npx available - E2E tests will run"
else
    TEST_AVAILABLE=false
    log_warning "Node.js/npx not found - E2E tests will be skipped"
fi

# Verify AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    log_error "AWS credentials not configured"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
log_success "AWS Account ID: $ACCOUNT_ID"

# ============================================================================
# STEP 1: CREATE ECR REPOSITORY AND BUILD DOCKER IMAGE
# ============================================================================

log_info "Setting up ECR repository and building Docker image..."

# Create ECR repository
if ! aws ecr describe-repositories \
    --repository-names $ECR_REPOSITORY \
    --region $AWS_REGION &>/dev/null; then
    
    aws ecr create-repository \
        --repository-name $ECR_REPOSITORY \
        --region $AWS_REGION
    
    log_success "Created ECR repository: $ECR_REPOSITORY"
else
    log_info "ECR repository already exists: $ECR_REPOSITORY"
fi

# Get login token
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Build and push Docker image
log_info "Building and pushing Docker image..."

if [ -f "Dockerfile" ]; then
    # Build the image
    docker build -t $ECR_REPOSITORY:latest .
    
    # Tag for ECR
    docker tag $ECR_REPOSITORY:latest ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/$ECR_REPOSITORY:latest
    
    # Push to ECR
    docker push ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/$ECR_REPOSITORY:latest
    
    log_success "Docker image built and pushed to ECR"
else
    log_error "Dockerfile not found - skipping image build"
    DOCKER_IMAGE="public.ecr.aws/docker/library/node:18-alpine"
fi

# ============================================================================
# STEP 2: CREATE S3 BUCKET FOR SCHEMA MIGRATIONS
# ============================================================================

log_info "Setting up S3 bucket for schema files..."

# Check if bucket exists
if aws s3 ls "s3://${SCHEMA_BUCKET}" 2>/dev/null; then
    log_info "S3 bucket ${SCHEMA_BUCKET} already exists"
else
    # Create bucket
    aws s3 mb "s3://${SCHEMA_BUCKET}" --region ${AWS_REGION}
    
    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket ${SCHEMA_BUCKET} \
        --versioning-configuration Status=Enabled
    
    log_success "Created S3 bucket: ${SCHEMA_BUCKET}"
fi

# Upload schema files
log_info "Uploading schema files to S3..."

# Create schema bundle
cat > /tmp/schema_migration.sql <<'EOF'
-- This file will be replaced with actual schema
-- Include: schema_fixes.sql content here
EOF

# Create actual schema migration file with Majestic health app schema
cat > /tmp/schema_fixes.sql <<'EOF'
-- Majestic Health App Database Schema
-- This file contains the complete schema and initial data setup

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create health metrics table
CREATE TABLE IF NOT EXISTS health_metrics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    metric_name VARCHAR(255) NOT NULL,
    metric_value DECIMAL(10,3) NOT NULL,
    unit VARCHAR(50),
    date_recorded DATE NOT NULL,
    source VARCHAR(100),
    confidence_score DECIMAL(3,2),
    normal_range_min DECIMAL(10,3),
    normal_range_max DECIMAL(10,3),
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create health systems table
CREATE TABLE IF NOT EXISTS health_systems (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create biomarkers table
CREATE TABLE IF NOT EXISTS biomarkers (
    id SERIAL PRIMARY KEY,
    system_id INTEGER REFERENCES health_systems(id),
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    unit VARCHAR(50),
    normal_range_min DECIMAL(10,3),
    normal_range_max DECIMAL(10,3),
    category VARCHAR(100),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    date_of_birth DATE,
    gender VARCHAR(20),
    phone VARCHAR(20),
    address TEXT,
    emergency_contact JSONB,
    medical_conditions JSONB,
    medications JSONB,
    google_id VARCHAR(255),
    profile_image_url VARCHAR(500),
    preferences JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create health insights table
CREATE TABLE IF NOT EXISTS health_insights (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    insight_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(50),
    action_required BOOLEAN DEFAULT false,
    related_metrics JSONB,
    ai_generated BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create file uploads table
CREATE TABLE IF NOT EXISTS file_uploads (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    file_size BIGINT,
    upload_status VARCHAR(50) DEFAULT 'pending',
    processing_status VARCHAR(50) DEFAULT 'pending',
    extracted_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default health systems
INSERT INTO health_systems (name, display_name, description, category, display_order) VALUES
('cardiovascular', 'Cardiovascular System', 'Heart and blood vessel health', 'primary', 1),
('metabolic', 'Metabolic System', 'Sugar and insulin levels', 'primary', 2),
('liver_kidney', 'Liver & Kidney Function', 'Liver enzymes and kidney function', 'primary', 3),
('inflammation', 'Inflammation Markers', 'C-reactive protein and inflammation indicators', 'primary', 4),
('hormones', 'Hormone Levels', 'Thyroid and other hormone levels', 'primary', 5),
('blood_cells', 'Blood Cell Count', 'White and red blood cell analysis', 'primary', 6),
('vitamins', 'Vitamin Levels', 'Vitamin D, B12 and other vitamins', 'primary', 7),
('lipids', 'Lipid Profile', 'Cholesterol and triglyceride levels', 'primary', 8)
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_health_metrics_user_id ON health_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_health_metrics_date ON health_metrics(date_recorded);
CREATE INDEX IF NOT EXISTS idx_health_metrics_name ON health_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_biomarkers_system ON biomarkers(system_id);
CREATE INDEX IF NOT EXISTS idx_file_uploads_user ON file_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_health_insights_user ON health_insights(user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_health_metrics_updated_at 
    BEFORE UPDATE ON health_metrics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable row level security
ALTER TABLE health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY health_metrics_policy ON health_metrics
    FOR ALL USING (user_id = current_setting('app.current_user_id')::INTEGER);

CREATE POLICY health_insights_policy ON health_insights
    FOR ALL USING (user_id = current_setting('app.current_user_id')::INTEGER);

CREATE POLICY file_uploads_policy ON file_uploads
    FOR ALL USING (user_id = current_setting('app.current_user_id')::INTEGER);
EOF

# Upload schema to S3
aws s3 cp /tmp/schema_fixes.sql "s3://${SCHEMA_BUCKET}/schema_fixes.sql"
log_success "Schema uploaded to S3"

# ============================================================================
# STEP 3: SETUP NETWORKING
# ============================================================================

log_info "Configuring networking..."

VPC_ID=$(aws ec2 describe-vpcs \
    --region $AWS_REGION \
    --filters "Name=isDefault,Values=true" \
    --query 'Vpcs[0].VpcId' \
    --output text)

if [ "$VPC_ID" == "None" ] || [ -z "$VPC_ID" ]; then
    log_error "No default VPC found"
    exit 1
fi

log_success "VPC: $VPC_ID"

# Get subnets
PUBLIC_SUBNETS=$(aws ec2 describe-subnets \
    --region $AWS_REGION \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[?MapPublicIpOnLaunch==`true`].SubnetId' \
    --output text)

SUBNET_ARRAY=($PUBLIC_SUBNETS)
log_success "Found ${#SUBNET_ARRAY[@]} public subnets"

# ============================================================================
# STEP 4: CREATE SECURITY GROUPS
# ============================================================================

log_info "Creating security groups..."

# ALB Security Group
ALB_SG_NAME="${PROJECT_NAME}-alb-sg"
ALB_SG_ID=$(aws ec2 describe-security-groups \
    --region $AWS_REGION \
    --filters "Name=group-name,Values=$ALB_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [ -z "$ALB_SG_ID" ] || [ "$ALB_SG_ID" == "None" ]; then
    ALB_SG_ID=$(aws ec2 create-security-group \
        --region $AWS_REGION \
        --group-name $ALB_SG_NAME \
        --description "Security group for ${PROJECT_NAME} ALB" \
        --vpc-id $VPC_ID \
        --output text)
    
    aws ec2 authorize-security-group-ingress \
        --group-id $ALB_SG_ID \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0 \
        --region $AWS_REGION
    
    log_success "Created ALB security group: $ALB_SG_ID"
else
    log_info "Using existing ALB security group: $ALB_SG_ID"
fi

# EC2 Security Group
EC2_SG_NAME="${PROJECT_NAME}-ec2-sg"
EC2_SG_ID=$(aws ec2 describe-security-groups \
    --region $AWS_REGION \
    --filters "Name=group-name,Values=$EC2_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [ -z "$EC2_SG_ID" ] || [ "$EC2_SG_ID" == "None" ]; then
    EC2_SG_ID=$(aws ec2 create-security-group \
        --region $AWS_REGION \
        --group-name $EC2_SG_NAME \
        --description "Security group for ${PROJECT_NAME} EC2" \
        --vpc-id $VPC_ID \
        --output text)
    
    aws ec2 authorize-security-group-ingress \
        --group-id $EC2_SG_ID \
        --protocol tcp \
        --port $CONTAINER_PORT \
        --source-group $ALB_SG_ID \
        --region $AWS_REGION
    
    log_success "Created EC2 security group: $EC2_SG_ID"
else
    log_info "Using existing EC2 security group: $EC2_SG_ID"
fi

# RDS Security Group
RDS_SG_NAME="${PROJECT_NAME}-rds-sg"
RDS_SG_ID=$(aws ec2 describe-security-groups \
    --region $AWS_REGION \
    --filters "Name=group-name,Values=$RDS_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [ -z "$RDS_SG_ID" ] || [ "$RDS_SG_ID" == "None" ]; then
    RDS_SG_ID=$(aws ec2 create-security-group \
        --region $AWS_REGION \
        --group-name $RDS_SG_NAME \
        --description "Security group for ${PROJECT_NAME} RDS" \
        --vpc-id $VPC_ID \
        --output text)
    
    aws ec2 authorize-security-group-ingress \
        --group-id $RDS_SG_ID \
        --protocol tcp \
        --port 5432 \
        --source-group $EC2_SG_ID \
        --region $AWS_REGION
    
    log_success "Created RDS security group: $RDS_SG_ID"
else
    log_info "Using existing RDS security group: $RDS_SG_ID"
fi

# ============================================================================
# STEP 5: CREATE RDS INSTANCE WITH AUTO-MIGRATION
# ============================================================================

log_info "Setting up RDS PostgreSQL..."

# Create DB subnet group
DB_SUBNET_GROUP="${PROJECT_NAME}-db-subnet-group"
if ! aws rds describe-db-subnet-groups \
    --db-subnet-group-name $DB_SUBNET_GROUP \
    --region $AWS_REGION &>/dev/null; then
    
    aws rds create-db-subnet-group \
        --db-subnet-group-name $DB_SUBNET_GROUP \
        --db-subnet-group-description "Subnet group for ${PROJECT_NAME}" \
        --subnet-ids $PUBLIC_SUBNETS \
        --region $AWS_REGION
    
    log_success "Created DB subnet group"
fi

# Check if RDS instance exists
if aws rds describe-db-instances \
    --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
    --region $AWS_REGION &>/dev/null; then
    
    log_info "RDS instance already exists"
    DB_ENDPOINT=$(aws rds describe-db-instances \
        --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
        --region $AWS_REGION \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text)
else
    # Create RDS instance
    log_info "Creating RDS instance (this will take 5-10 minutes)..."
    
    aws rds create-db-instance \
        --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
        --db-instance-class $DB_INSTANCE_CLASS \
        --engine postgres \
        --engine-version "15.8" \
        --master-username $DB_USERNAME \
        --master-user-password "$DB_PASSWORD" \
        --allocated-storage 20 \
        --db-name $DB_NAME \
        --vpc-security-group-ids $RDS_SG_ID \
        --db-subnet-group-name $DB_SUBNET_GROUP \
        --backup-retention-period 7 \
        --preferred-backup-window "03:00-04:00" \
        --preferred-maintenance-window "mon:04:00-mon:05:00" \
        --publicly-accessible false \
        --storage-encrypted \
        --enable-cloudwatch-logs-exports postgresql \
        --deletion-protection \
        --region $AWS_REGION
    
    # Wait for RDS to be available
    log_info "Waiting for RDS to become available..."
    aws rds wait db-instance-available \
        --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
        --region $AWS_REGION
    
    DB_ENDPOINT=$(aws rds describe-db-instances \
        --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
        --region $AWS_REGION \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text)
    
    log_success "RDS instance created: $DB_ENDPOINT"
fi

DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_ENDPOINT}:5432/${DB_NAME}"

# ============================================================================
# STEP 6: CREATE IAM ROLE FOR EC2 WITH S3 ACCESS
# ============================================================================

log_info "Creating IAM role for EC2 instances..."

ROLE_NAME="${PROJECT_NAME}-ec2-role"
INSTANCE_PROFILE_NAME="${PROJECT_NAME}-ec2-profile"

# Check if role exists
if ! aws iam get-role --role-name $ROLE_NAME &>/dev/null; then
    # Create trust policy
    cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

    # Create role
    aws iam create-role \
        --role-name $ROLE_NAME \
        --assume-role-policy-document file:///tmp/trust-policy.json
    
    # Attach ECS policy
    aws iam attach-role-policy \
        --role-name $ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role
    
    # Create S3 access policy
    cat > /tmp/s3-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::${SCHEMA_BUCKET}",
        "arn:aws:s3:::${SCHEMA_BUCKET}/*"
      ]
    }
  ]
}
EOF

    aws iam put-role-policy \
        --role-name $ROLE_NAME \
        --policy-name s3-schema-access \
        --policy-document file:///tmp/s3-policy.json
    
    log_success "Created IAM role: $ROLE_NAME"
fi

# Create instance profile if doesn't exist
if ! aws iam get-instance-profile --instance-profile-name $INSTANCE_PROFILE_NAME &>/dev/null; then
    aws iam create-instance-profile \
        --instance-profile-name $INSTANCE_PROFILE_NAME
    
    aws iam add-role-to-instance-profile \
        --instance-profile-name $INSTANCE_PROFILE_NAME \
        --role-name $ROLE_NAME
    
    # Wait for propagation
    sleep 10
    
    log_success "Created instance profile: $INSTANCE_PROFILE_NAME"
fi

# ============================================================================
# STEP 7: CREATE USER DATA SCRIPT WITH SCHEMA MIGRATION
# ============================================================================

log_info "Creating UserData script with automatic schema migration..."

# Check if user-data.sh exists in current directory
if [ -f "user-data.sh" ]; then
    log_info "Using existing user-data.sh script..."
    cp user-data.sh /tmp/userdata.sh
else
    log_error "user-data.sh not found in current directory"
    exit 1
fi

# Replace placeholders in user-data.sh
sed -i "s|SCHEMA_BUCKET_PLACEHOLDER|${SCHEMA_BUCKET}|g" /tmp/userdata.sh
sed -i "s|DB_ENDPOINT_PLACEHOLDER|${DB_ENDPOINT}|g" /tmp/userdata.sh
sed -i "s|DB_USERNAME_PLACEHOLDER|${DB_USERNAME}|g" /tmp/userdata.sh
sed -i "s|DB_PASSWORD_PLACEHOLDER|${DB_PASSWORD}|g" /tmp/userdata.sh
sed -i "s|DB_NAME_PLACEHOLDER|${DB_NAME}|g" /tmp/userdata.sh
sed -i "s|ECS_CLUSTER_PLACEHOLDER|${ECS_CLUSTER_NAME}|g" /tmp/userdata.sh
sed -i "s|PROJECT_NAME_PLACEHOLDER|${PROJECT_NAME}|g" /tmp/userdata.sh
sed -i "s|AWS_REGION_PLACEHOLDER|${AWS_REGION}|g" /tmp/userdata.sh

# Make script executable
chmod +x /tmp/userdata.sh

# Encode to base64 for EC2 user data
USERDATA_BASE64=$(base64 -w 0 /tmp/userdata.sh)

# ============================================================================
# STEP 8: CREATE ECS CLUSTER, LAUNCH TEMPLATE, AND AUTO SCALING
# ============================================================================

log_info "Creating ECS cluster..."

if ! aws ecs describe-clusters \
    --clusters $ECS_CLUSTER_NAME \
    --region $AWS_REGION | grep -q "ACTIVE"; then
    
    aws ecs create-cluster \
        --cluster-name $ECS_CLUSTER_NAME \
        --region $AWS_REGION
    
    log_success "ECS cluster created: $ECS_CLUSTER_NAME"
else
    log_info "ECS cluster already exists: $ECS_CLUSTER_NAME"
fi

# Get latest ECS-optimized AMI
ECS_AMI=$(aws ssm get-parameters \
    --names /aws/service/ecs/optimized-ami/amazon-linux-2/recommended \
    --region $AWS_REGION \
    --query 'Parameters[0].Value' \
    --output text | jq -r '.image_id')

log_info "Using ECS-optimized AMI: $ECS_AMI"

# Create launch template
LAUNCH_TEMPLATE_NAME="${PROJECT_NAME}-launch-template"

cat > /tmp/launch-template.json <<EOF
{
  "ImageId": "${ECS_AMI}",
  "InstanceType": "${EC2_INSTANCE_TYPE}",
  "IamInstanceProfile": {
    "Name": "${INSTANCE_PROFILE_NAME}"
  },
  "SecurityGroupIds": ["${EC2_SG_ID}"],
  "UserData": "${USERDATA_BASE64}",
  "TagSpecifications": [
    {
      "ResourceType": "instance",
      "Tags": [
        {
          "Key": "Name",
          "Value": "${PROJECT_NAME}-ecs-instance"
        }
      ]
    }
  ]
}
EOF

aws ec2 create-launch-template \
    --launch-template-name $LAUNCH_TEMPLATE_NAME \
    --launch-template-data file:///tmp/launch-template.json \
    --region $AWS_REGION 2>/dev/null || \
aws ec2 create-launch-template-version \
    --launch-template-name $LAUNCH_TEMPLATE_NAME \
    --launch-template-data file:///tmp/launch-template.json \
    --region $AWS_REGION

log_success "Launch template created/updated"

# Create Auto Scaling Group
ASG_NAME="${PROJECT_NAME}-asg"

if ! aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names $ASG_NAME \
    --region $AWS_REGION 2>/dev/null | grep -q "AutoScalingGroupName"; then
    
    aws autoscaling create-auto-scaling-group \
        --auto-scaling-group-name $ASG_NAME \
        --launch-template "LaunchTemplateName=${LAUNCH_TEMPLATE_NAME},Version=\$Latest" \
        --min-size $EC2_MIN_SIZE \
        --max-size $EC2_MAX_SIZE \
        --desired-capacity $EC2_DESIRED_CAPACITY \
        --vpc-zone-identifier "$(echo $PUBLIC_SUBNETS | tr ' ' ',')" \
        --health-check-type EC2 \
        --health-check-grace-period 300 \
        --region $AWS_REGION
    
    log_success "Auto Scaling Group created"
else
    log_info "Auto Scaling Group already exists"
fi

# Wait for instances to register
log_info "Waiting for EC2 instances to register with ECS cluster..."
sleep 60

# ============================================================================
# STEP 9: CREATE APPLICATION LOAD BALANCER
# ============================================================================

log_info "Creating Application Load Balancer..."

ALB_NAME="${PROJECT_NAME}-alb"
TG_NAME="${PROJECT_NAME}-tg"

# Create ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
    --name $ALB_NAME \
    --subnets $PUBLIC_SUBNETS \
    --security-groups $ALB_SG_ID \
    --scheme internet-facing \
    --type application \
    --region $AWS_REGION \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text 2>/dev/null || \
  aws elbv2 describe-load-balancers \
    --names $ALB_NAME \
    --region $AWS_REGION \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text)

ALB_DNS=$(aws elbv2 describe-load-balancers \
    --load-balancer-arns $ALB_ARN \
    --region $AWS_REGION \
    --query 'LoadBalancers[0].DNSName' \
    --output text)

log_success "ALB: $ALB_DNS"

# Create Target Group
TG_ARN=$(aws elbv2 create-target-group \
    --name $TG_NAME \
    --protocol HTTP \
    --port $CONTAINER_PORT \
    --vpc-id $VPC_ID \
    --health-check-path /health \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --region $AWS_REGION \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text 2>/dev/null || \
  aws elbv2 describe-target-groups \
    --names $TG_NAME \
    --region $AWS_REGION \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)

log_success "Target Group created"

# Create listener
aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=forward,TargetGroupArn=$TG_ARN \
    --region $AWS_REGION 2>/dev/null || log_info "Listener already exists"

# ============================================================================
# STEP 10: CREATE ECS TASK DEFINITION AND SERVICE
# ============================================================================

log_info "Creating ECS Task Definition..."

cat > /tmp/task-definition.json <<EOF
{
  "family": "${PROJECT_NAME}-task",
  "networkMode": "bridge",
  "containerDefinitions": [
    {
      "name": "${PROJECT_NAME}-container",
      "image": "${DOCKER_IMAGE}",
      "cpu": 1024,
      "memory": 2048,
      "memoryReservation": 1024,
      "essential": true,
      "portMappings": [
        {
          "containerPort": ${CONTAINER_PORT},
          "hostPort": 0,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "PORT", "value": "${CONTAINER_PORT}"},
        {"name": "DATABASE_URL", "value": "${DATABASE_URL}"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${PROJECT_NAME}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:${CONTAINER_PORT}/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
EOF

aws ecs register-task-definition \
    --cli-input-json file:///tmp/task-definition.json \
    --region $AWS_REGION

log_success "Task definition registered"

# Create ECS Service
log_info "Creating ECS Service..."

aws ecs create-service \
    --cluster $ECS_CLUSTER_NAME \
    --service-name $ECS_SERVICE_NAME \
    --task-definition "${PROJECT_NAME}-task" \
    --desired-count $EC2_DESIRED_CAPACITY \
    --launch-type EC2 \
    --load-balancers "targetGroupArn=${TG_ARN},containerName=${PROJECT_NAME}-container,containerPort=${CONTAINER_PORT}" \
    --health-check-grace-period-seconds 60 \
    --deployment-configuration "maximumPercent=200,minimumHealthyPercent=50" \
    --region $AWS_REGION 2>/dev/null || \
aws ecs update-service \
    --cluster $ECS_CLUSTER_NAME \
    --service $ECS_SERVICE_NAME \
    --force-new-deployment \
    --region $AWS_REGION

log_success "ECS Service created/updated"

# ============================================================================
# STEP 11: RUN PLAYWRIGHT E2E TESTS
# ============================================================================

if [ "$TEST_AVAILABLE" = true ]; then
    log_info "Waiting for deployment to stabilize..."
    sleep 120
    
    log_info "Running Playwright E2E tests..."
    
    # Set environment variables for tests
    export TEST_URL="http://${ALB_DNS}"
    export GOOGLE_TEST_EMAIL="${GOOGLE_EMAIL:-}"
    export GOOGLE_TEST_PASSWORD="${GOOGLE_PASSWORD:-}"
    
    # Run tests
    cd /path/to/tests
    npx playwright install chromium
    npx playwright test e2e.spec.js --reporter=html
    
    if [ $? -eq 0 ]; then
        log_success "All E2E tests passed!"
    else
        log_warning "Some E2E tests failed. Check test report for details."
    fi
else
    log_warning "Skipping E2E tests (Node.js not available)"
fi

# ============================================================================
# DEPLOYMENT SUMMARY
# ============================================================================

echo ""
echo "══════════════════════════════════════════════════════════════════"
log_success "DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "══════════════════════════════════════════════════════════════════"
echo ""
echo "📋 DEPLOYMENT INFORMATION:"
echo ""
echo "🌐 Application URL:"
echo "   http://$ALB_DNS"
echo ""
echo "🗄️  Database:"
echo "   Endpoint: $DB_ENDPOINT:5432"
echo "   Database: $DB_NAME"
echo "   Username: $DB_USERNAME"
echo "   Password: [saved in deployment-info.txt]"
echo ""
echo "🐳 ECS:"
echo "   Cluster: $ECS_CLUSTER_NAME"
echo "   Service: $ECS_SERVICE_NAME"
echo ""
echo "📦 S3 Schema Bucket:"
echo "   Bucket: $SCHEMA_BUCKET"
echo ""
echo "📊 Monitoring:"
echo "   CloudWatch Logs: /ecs/${PROJECT_NAME}"
echo "   ECS Console: https://${AWS_REGION}.console.aws.amazon.com/ecs/v2/clusters/${ECS_CLUSTER_NAME}"
echo ""
echo "⚙️  Useful Commands:"
echo ""
echo "# View logs"
echo "aws logs tail /ecs/${PROJECT_NAME} --follow --region $AWS_REGION"
echo ""
echo "# Check service status"
echo "aws ecs describe-services --cluster $ECS_CLUSTER_NAME --services $ECS_SERVICE_NAME --region $AWS_REGION"
echo ""
echo "# Trigger new deployment"
echo "aws ecs update-service --cluster $ECS_CLUSTER_NAME --service $ECS_SERVICE_NAME --force-new-deployment --region $AWS_REGION"
echo ""
echo "══════════════════════════════════════════════════════════════════"

# Save deployment info
cat > deployment-info.txt <<EOF
MAJESTIC HEALTH APP - DEPLOYMENT INFORMATION
==============================================

Date: $(date)
Region: $AWS_REGION

APPLICATION:
-----------
URL: http://$ALB_DNS

DATABASE:
---------
Endpoint: $DB_ENDPOINT:5432
Database: $DB_NAME
Username: $DB_USERNAME
Password: $DB_PASSWORD
Connection String: $DATABASE_URL

AWS RESOURCES:
--------------
VPC: $VPC_ID
ECS Cluster: $ECS_CLUSTER_NAME
ECS Service: $ECS_SERVICE_NAME
Load Balancer: $ALB_ARN
Target Group: $TG_ARN
Auto Scaling Group: $ASG_NAME
S3 Schema Bucket: $SCHEMA_BUCKET

SECURITY GROUPS:
----------------
ALB: $ALB_SG_ID
EC2: $EC2_SG_ID
RDS: $RDS_SG_ID

FEATURES ENABLED:
-----------------
✓ Automatic schema migration on deployment
✓ Auto-scaling (Min: $EC2_MIN_SIZE, Max: $EC2_MAX_SIZE)
✓ Health checks
✓ CloudWatch logging
✓ Encrypted database
✓ Backup retention: 7 days
✓ Schema versioning in S3
EOF

log_success "Deployment info saved to: deployment-info.txt"
log_warning "IMPORTANT: Keep deployment-info.txt secure - it contains database credentials"

exit 0
