#------------------------------------------------------------------------------
# EXAMPLE VARIABLES - DO NOT USE IN PRODUCTION WITHOUT MODIFICATION
#------------------------------------------------------------------------------
# It is recommended to create a separate .tfvars file for each environment
# (e.g., production.tfvars, staging.tfvars) and NOT commit them to version control.
# Use the -var-file="your-env.tfvars" flag when running terraform.

# General Configuration
aws_region   = "us-east-1"
environment  = "production"
project_name = "majestic"
project_tags = {
  Project     = "Majestic"
  ManagedBy   = "Terraform"
  Environment = "production"
  Owner       = "DevOps Team"
}

# Networking
vpc_cidr               = "10.0.0.0/16"
availability_zones_count = 2
public_subnet_cidrs    = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs   = ["10.0.11.0/24", "10.0.12.0/24"]
database_subnet_cidrs  = ["10.0.21.0/24", "10.0.22.0/24"]

# RDS Configuration
db_instance_class        = "db.t3.micro"
db_allocated_storage     = 20
db_name                  = "health_app"
db_username              = "majestic"
db_password              = "CHANGEME_#_A_VERY_SECURE_PASSWORD_#_123!" # IMPORTANT: Replace with a strong password
db_multi_az              = false # Set to true for production for high availability
db_deletion_protection   = true

# ECS & EC2 Configuration
ecs_instance_type        = "t3.small"
ecs_asg_min_size         = 1
ecs_asg_max_size         = 3
ecs_asg_desired_capacity = 2
# ec2_key_name             = "your-key-pair-name" # Optional: Add your key pair name for SSH access
# ssh_allowed_cidr_blocks  = ["1.2.3.4/32"]       # Optional: Add your IP for SSH access

# Application Configuration
app_port   = 5000
app_count  = 2
app_cpu    = 256
app_memory = 512

# Secrets Configuration (IMPORTANT: These should be passed securely, not in a committed .tfvars file)
jwt_secret            = "CHANGEME_YOUR_SUPER_SECRET_JWT_STRING_THAT_IS_LONG"
google_client_id      = "CHANGEME.apps.googleusercontent.com"
google_client_secret  = "CHANGEME_GOCSPX-YOUR-SECRET"