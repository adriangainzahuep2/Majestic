#------------------------------------------------------------------------------
# EC2 SECURITY GROUP (FOR ECS INSTANCES)
#------------------------------------------------------------------------------
resource "aws_security_group" "ecs_instances" {
  name_prefix = "${var.project_name}-ecs-instances-"
  description = "Allow traffic to ECS container instances"
  vpc_id      = aws_vpc.main.id

  # Ingress from the ALB on the ephemeral port range used by the ECS agent
  ingress {
    description     = "Allow all traffic from the ALB"
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    security_groups = [aws_security_group.alb.id] # Defined in ecs.tf
  }

  # Ingress for SSH if a key is provided
  dynamic "ingress" {
    for_each = var.ec2_key_name != "" ? [1] : []
    content {
      description = "Allow SSH access"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = length(var.ssh_allowed_cidr_blocks) > 0 ? var.ssh_allowed_cidr_blocks : ["0.0.0.0/0"]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-ecs-instances-sg"
  }
}

#------------------------------------------------------------------------------
# IAM ROLE FOR EC2 INSTANCES
#------------------------------------------------------------------------------
resource "aws_iam_role" "ecs_instance_role" {
  name = "${var.project_name}-ecs-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "ec2.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_instance_role_attachment" {
  role       = aws_iam_role.ecs_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_role_policy_attachment" "ssm_core_attachment" {
  role       = aws_iam_role.ecs_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ecs" {
  name = "${var.project_name}-ecs-instance-profile"
  role = aws_iam_role.ecs_instance_role.name
}

#------------------------------------------------------------------------------
# LAUNCH TEMPLATE FOR ECS INSTANCES
#------------------------------------------------------------------------------
data "aws_ami" "ecs_optimized" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-ecs-hvm-*-x86_64-ebs"]
  }
}

resource "aws_launch_template" "ecs" {
  name_prefix            = "${var.project_name}-ecs-"
  image_id               = data.aws_ami.ecs_optimized.id
  instance_type          = var.ecs_instance_type
  key_name               = var.ec2_key_name != "" ? var.ec2_key_name : null
  vpc_security_group_ids = [aws_security_group.ecs_instances.id]

  iam_instance_profile {
    name = aws_iam_instance_profile.ecs.name
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh.tpl", {
    cluster_name = aws_ecs_cluster.main.name
  }))

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size = var.ecs_instance_volume_size
      volume_type = "gp3"
      delete_on_termination = true
    }
  }

  monitoring {
    enabled = true
  }

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.project_name}-ecs-instance" }
  }

  lifecycle {
    create_before_destroy = true
  }
}

#------------------------------------------------------------------------------
# AUTO SCALING GROUP
#------------------------------------------------------------------------------
resource "aws_autoscaling_group" "ecs" {
  name_prefix         = "${var.project_name}-ecs-asg-"
  vpc_zone_identifier = aws_subnet.private[*].id

  min_size         = var.ecs_asg_min_size
  max_size         = var.ecs_asg_max_size
  desired_capacity = var.ecs_asg_desired_capacity

  launch_template {
    id      = aws_launch_template.ecs.id
    version = "$Latest"
  }

  tag {
    key                 = "AmazonECSManaged"
    value               = ""
    propagate_at_launch = true
  }

  lifecycle {
    create_before_destroy = true
  }
}

#------------------------------------------------------------------------------
# ECS CAPACITY PROVIDER
#------------------------------------------------------------------------------
resource "aws_ecs_capacity_provider" "main" {
  name = "${var.project_name}-capacity-provider"

  auto_scaling_group_provider {
    auto_scaling_group_arn         = aws_autoscaling_group.ecs.arn
    managed_termination_protection = "ENABLED"

    managed_scaling {
      status                    = "ENABLED"
      target_capacity           = 100
      minimum_scaling_step_size = 1
      maximum_scaling_step_size = 2
    }
  }
}