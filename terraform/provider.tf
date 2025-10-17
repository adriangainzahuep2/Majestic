terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }

  backend "s3" {
    # Replace with your S3 bucket name
    bucket         = "your-terraform-state-bucket-name"
    key            = "majestic-app/terraform.tfstate"
    region         = "us-east-1"
    # Replace with your DynamoDB table name
    dynamodb_table = "your-terraform-lock-table-name"
  }
}

provider "aws" {
  region = var.aws_region
}