output "application_url" {
  description = "The URL of the application load balancer"
  value       = "http://${aws_lb.main.dns_name}"
}

output "database_endpoint" {
  description = "The endpoint of the RDS database"
  value       = aws_db_instance.main.endpoint
}

output "ecr_repository_url" {
  description = "The URL of the ECR repository"
  value       = aws_ecr_repository.main.repository_url
}