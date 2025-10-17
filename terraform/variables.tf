variable "aws_region" {
  description = "The AWS region to deploy the infrastructure"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "The name of the project"
  type        = string
  default     = "majestic-app"
}

variable "db_name" {
  description = "The name of the RDS database"
  type        = string
  default     = "health_app"
}

variable "db_username" {
  description = "The username for the RDS database"
  type        = string
  default     = "majestic"
}

variable "db_password" {
  description = "The password for the RDS database"
  type        = string
  sensitive   = true
}