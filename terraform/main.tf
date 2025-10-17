terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  backend "s3" {
    # This will be configured via the CLI to allow for flexibility
    # Example:
    # bucket         = "your-terraform-state-bucket"
    # key            = "majestic/prod/terraform.tfstate"
    # region         = "us-east-1"
    # encrypt        = true
    # dynamodb_table = "terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.project_tags
  }
}

# Data source for current AWS account and region
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Data source for availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

# Random string for unique resource names where needed
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}