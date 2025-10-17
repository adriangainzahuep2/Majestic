#------------------------------------------------------------------------------
# GENERAL CONFIGURATION
#------------------------------------------------------------------------------
variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name (e.g., development, staging, production)."
  type        = string
  default     = "production"
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "The environment must be one of: development, staging, production."
  }
}

variable "project_name" {
  description = "The name of the project."
  type        = string
  default     = "majestic"
}

variable "project_tags" {
  description = "Common tags to apply to all resources."
  type        = map(string)
  default = {
    Project     = "Majestic"
    ManagedBy   = "Terraform"
    Environment = "production"
  }
}

#------------------------------------------------------------------------------
# VPC & NETWORKING CONFIGURATION
#------------------------------------------------------------------------------
variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones_count" {
  description = "Number of Availability Zones to use in the region."
  type        = number
  default     = 2
}

variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "List of CIDR blocks for private subnets (for ECS instances)."
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "database_subnet_cidrs" {
  description = "List of CIDR blocks for isolated database subnets."
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24"]
}

#------------------------------------------------------------------------------
# RDS CONFIGURATION
#------------------------------------------------------------------------------
variable "db_instance_class" {
  description = "Instance class for the RDS database."
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Initial allocated storage for the database in GB."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum storage in GB to scale up to."
  type        = number
  default     = 100
}

variable "db_engine_version" {
  description = "PostgreSQL engine version."
  type        = string
  default     = "15.4"
}

variable "db_name" {
  description = "The name of the database to create."
  type        = string
  default     = "health_app"
}

variable "db_username" {
  description = "Master username for the database. Will be stored in Secrets Manager."
  type        = string
  default     = "majestic"
}

variable "db_password" {
  description = "Master password for the database. Will be stored in Secrets Manager."
  type        = string
  sensitive   = true
}

variable "db_backup_retention_period" {
  description = "Number of days to retain automated backups."
  type        = number
  default     = 7
}

variable "db_multi_az" {
  description = "Specifies if the RDS instance is multi-AZ."
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "If the DB instance should have deletion protection enabled."
  type        = bool
  default     = true
}

#------------------------------------------------------------------------------
# ECS & EC2 CONFIGURATION
#------------------------------------------------------------------------------
variable "ecs_instance_type" {
  description = "EC2 instance type for the ECS cluster nodes."
  type        = string
  default     = "t3.small"
}

variable "ecs_instance_volume_size" {
  description = "Size of the root EBS volume for ECS instances in GB."
  type        = number
  default     = 30
}

variable "ec2_key_name" {
  description = "Name of an existing EC2 KeyPair to enable SSH access to the instances."
  type        = string
  default     = ""
}

variable "ssh_allowed_cidr_blocks" {
  description = "List of CIDR blocks allowed to SSH into the EC2 instances. Only used if ec2_key_name is set."
  type        = list(string)
  default     = []
}

variable "ecs_asg_min_size" {
  description = "Minimum number of instances in the ECS Auto Scaling Group."
  type        = number
  default     = 1
}

variable "ecs_asg_max_size" {
  description = "Maximum number of instances in the ECS Auto Scaling Group."
  type        = number
  default     = 3
}

variable "ecs_asg_desired_capacity" {
  description = "Desired number of instances in the ECS Auto Scaling Group."
  type        = number
  default     = 2
}

#------------------------------------------------------------------------------
# APPLICATION CONFIGURATION
#------------------------------------------------------------------------------
variable "app_port" {
  description = "Port the application container listens on."
  type        = number
  default     = 5000
}

variable "app_count" {
  description = "Number of tasks to run for the application service."
  type        = number
  default     = 2
}

variable "app_cpu" {
  description = "CPU units to reserve for the application container."
  type        = number
  default     = 256
}

variable "app_memory" {
  description = "Memory to reserve for the application container in MiB."
  type        = number
  default     = 512
}

#------------------------------------------------------------------------------
# SECRETS CONFIGURATION
#------------------------------------------------------------------------------
variable "jwt_secret" {
  description = "JWT secret for application authentication."
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth Client ID."
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth Client Secret."
  type        = string
  sensitive   = true
}