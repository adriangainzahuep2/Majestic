#------------------------------------------------------------------------------
# VPC & NETWORKING OUTPUTS
#------------------------------------------------------------------------------
output "vpc_id" {
  description = "The ID of the VPC."
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "List of IDs of the public subnets."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "List of IDs of the private subnets."
  value       = aws_subnet.private[*].id
}

output "database_subnet_ids" {
  description = "List of IDs of the database subnets."
  value       = aws_subnet.database[*].id
}

#------------------------------------------------------------------------------
# RDS OUTPUTS
#------------------------------------------------------------------------------
output "rds_endpoint" {
  description = "The connection endpoint for the RDS instance."
  value       = aws_db_instance.postgres.endpoint
  sensitive   = true
}

output "rds_address" {
  description = "The address of the RDS instance."
  value       = aws_db_instance.postgres.address
  sensitive   = true
}

output "db_secret_arn" {
  description = "ARN of the secret containing the database credentials."
  value       = aws_secretsmanager_secret.db_credentials.arn
  sensitive   = true
}

#------------------------------------------------------------------------------
# ECS & EC2 OUTPUTS
#------------------------------------------------------------------------------
output "ecs_cluster_name" {
  description = "The name of the ECS cluster."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "The name of the ECS service."
  value       = aws_ecs_service.app.name
}

output "ecr_repository_url" {
  description = "The URL of the ECR repository for the application."
  value       = aws_ecr_repository.app.repository_url
}

output "asg_name" {
  description = "The name of the Auto Scaling Group for ECS instances."
  value       = aws_autoscaling_group.ecs.name
}

#------------------------------------------------------------------------------
# ALB OUTPUTS
#------------------------------------------------------------------------------
output "alb_dns_name" {
  description = "The DNS name of the Application Load Balancer."
  value       = aws_lb.main.dns_name
}

output "application_url" {
  description = "The main URL for the application."
  value       = "http://${aws_lb.main.dns_name}"
}

output "alb_listener_arn" {
  description = "The ARN of the HTTP listener."
  value       = aws_lb_listener.http.arn
}

output "target_group_arn" {
  description = "The ARN of the target group."
  value       = aws_lb_target_group.app.arn
}