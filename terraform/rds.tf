#------------------------------------------------------------------------------
# RDS SECURITY GROUP
#------------------------------------------------------------------------------
resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-rds-"
  description = "Allow inbound traffic from ECS instances to RDS"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Allow PostgreSQL traffic from ECS Instances"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_instances.id] # Defined in ec2.tf
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-rds-sg"
  }
}

#------------------------------------------------------------------------------
# RDS SUBNET GROUP
#------------------------------------------------------------------------------
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = aws_subnet.database[*].id

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

#------------------------------------------------------------------------------
# RDS PARAMETER GROUP
#------------------------------------------------------------------------------
resource "aws_db_parameter_group" "postgres" {
  name_prefix = "${var.project_name}-postgres15-"
  family      = "postgres15"
  description = "Custom parameter group for Majestic PostgreSQL"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  tags = {
    Name = "${var.project_name}-postgres-pg"
  }
}

#------------------------------------------------------------------------------
# IAM ROLE FOR RDS ENHANCED MONITORING
#------------------------------------------------------------------------------
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project_name}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

#------------------------------------------------------------------------------
# RDS INSTANCE
#------------------------------------------------------------------------------
resource "aws_db_instance" "postgres" {
  identifier_prefix = "${var.project_name}-"
  engine            = "postgres"
  engine_version    = var.db_engine_version
  instance_class    = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  port                   = 5432

  multi_az               = var.db_multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.postgres.name

  backup_retention_period = var.db_backup_retention_period
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  deletion_protection        = var.db_deletion_protection
  skip_final_snapshot        = var.environment != "production"
  final_snapshot_identifier  = var.environment == "production" ? "${var.project_name}-final-snapshot-${random_string.suffix.result}" : null
  auto_minor_version_upgrade = true
  apply_immediately          = false

  tags = {
    Name = "${var.project_name}-postgres-db"
  }
}

#------------------------------------------------------------------------------
# SECRETS MANAGER
#------------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "db_credentials" {
  name_prefix = "${var.project_name}/db-credentials-"
  description = "PostgreSQL database credentials for Majestic"
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_username
    password = var.db_password
    engine   = "postgres"
    host     = aws_db_instance.postgres.address
    port     = aws_db_instance.postgres.port
    dbname   = var.db_name
    url      = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/${var.db_name}"
  })

  depends_on = [aws_db_instance.postgres]
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name_prefix = "${var.project_name}/jwt-secret-"
  description = "JWT secret key for application authentication."
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret
}

resource "aws_secretsmanager_secret" "google_client_id" {
  name_prefix = "${var.project_name}/google-client-id-"
  description = "Google OAuth Client ID."
}

resource "aws_secretsmanager_secret_version" "google_client_id" {
  secret_id     = aws_secretsmanager_secret.google_client_id.id
  secret_string = var.google_client_id
}

resource "aws_secretsmanager_secret" "google_client_secret" {
  name_prefix = "${var.project_name}/google-client-secret-"
  description = "Google OAuth Client Secret."
}

resource "aws_secretsmanager_secret_version" "google_client_secret" {
  secret_id     = aws_secretsmanager_secret.google_client_secret.id
  secret_string = var.google_client_secret
}