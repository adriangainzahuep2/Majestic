# Majestic Application Deployment Guide

This document outlines the steps required to deploy the Majestic application to AWS using the provided Terraform infrastructure-as-code and deployment scripts.

The architecture consists of:
- **AWS VPC**: A custom Virtual Private Cloud with public, private, and database subnets.
- **AWS RDS**: A PostgreSQL database running in the isolated database subnets.
- **AWS EC2 & ASG**: An Auto Scaling Group of EC2 instances that will host our Docker containers.
- **AWS ECS**: A container orchestration service to manage the application containers on the EC2 instances.
- **AWS ECR**: A private Docker container registry to store our application images.
- **AWS ALB**: An Application Load Balancer to distribute traffic to the application.
- **AWS Secrets Manager**: For securely storing and managing application secrets.
- **CircleCI**: For automating the entire deployment workflow.

---

## 1. Prerequisites

Before you begin, ensure you have the following installed and configured:
- **Git**: For cloning the repository.
- **Terraform**: Version `~> 1.0`.
- **AWS CLI**: Latest version, configured with credentials that have sufficient permissions to create the resources defined in the Terraform files.
- **Docker**: Latest version, running locally.
- **jq**: A command-line JSON processor.
- **A CircleCI Account**: Connected to your GitHub repository.

---

## 2. Initial AWS Setup (One-Time)

You need to create an S3 bucket and a DynamoDB table to manage Terraform's state remotely. This is crucial for team collaboration and state locking.

1.  **Create S3 Bucket for Terraform State:**
    ```bash
    aws s3api create-bucket \
        --bucket your-unique-terraform-state-bucket-name \
        --region us-east-1
    ```
    *Replace `your-unique-terraform-state-bucket-name` with a globally unique name.*

2.  **Enable Versioning on the S3 Bucket:**
    ```bash
    aws s3api put-bucket-versioning \
        --bucket your-unique-terraform-state-bucket-name \
        --versioning-configuration Status=Enabled
    ```

3.  **Create DynamoDB Table for State Locking:**
    ```bash
    aws dynamodb create-table \
        --table-name terraform-locks \
        --attribute-definitions AttributeName=LockID,AttributeType=S \
        --key-schema AttributeName=LockID,KeyType=HASH \
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
        --region us-east-1
    ```
    *The table name must be `terraform-locks` if you use the provided CircleCI config without changes.*

---

## 3. CircleCI Project Setup

1.  **Connect Your Repository to CircleCI.**
2.  In your CircleCI project settings, go to **Environment Variables** and add the following:
    - `AWS_ACCESS_KEY_ID`: Your AWS access key.
    - `AWS_SECRET_ACCESS_KEY`: Your AWS secret key.
    - `AWS_REGION`: The AWS region (e.g., `us-east-1`).
    - `TF_VAR_db_password`: The master password you want for the RDS database.
    - `TF_VAR_jwt_secret`: A long, random string for your application's JWT secret.
    - `TF_VAR_google_client_id`: Your Google OAuth Client ID.
    - `TF_VAR_google_client_secret`: Your Google OAuth Client Secret.
    - `TERRAFORM_STATE_BUCKET`: The name of the S3 bucket you created in the previous step.
    - `TERRAFORM_LOCK_TABLE`: The name of the DynamoDB table you created (`terraform-locks`).

---

## 4. Deployment Workflow (Using CircleCI)

The recommended way to deploy is to push a commit to the `main` branch. This will trigger the CircleCI pipeline, which will:
1.  **Run `terraform plan`**: Shows you the proposed infrastructure changes.
2.  **Hold for Approval**: The pipeline will pause, waiting for you to manually approve the plan in the CircleCI UI.
3.  **Run `terraform apply`**: If approved, it will apply the changes and create/update the AWS infrastructure.
4.  **Deploy Application**: It will build and push the Docker image to ECR and update the ECS service to use the new image.

---

## 5. Manual Deployment (Alternative)

If you need to deploy manually without using the CI/CD pipeline, follow these steps:

### Step 5.1: Provision the Infrastructure

1.  **Create a `terraform.tfvars` file:**
    Copy `terraform/terraform.tfvars` to `terraform/production.tfvars`. Fill in all the `CHANGEME` values with your actual secrets. **Do not commit this file.**

2.  **Initialize Terraform:**
    Navigate to the `terraform` directory and run the init command, pointing to your backend configuration.
    ```bash
    cd terraform

    terraform init \
      -backend-config="bucket=your-unique-terraform-state-bucket-name" \
      -backend-config="key=majestic/prod/terraform.tfstate" \
      -backend-config="region=us-east-1" \
      -backend-config="dynamodb_table=terraform-locks"
    ```

3.  **Plan and Apply:**
    ```bash
    # See what changes will be made
    terraform plan -var-file="production.tfvars"

    # Apply the changes
    terraform apply -var-file="production.tfvars" -auto-approve
    ```

4.  **Save Terraform Outputs:**
    After applying, save the outputs to a JSON file. The deployment scripts depend on this file.
    ```bash
    terraform output -json > terraform.output.json
    ```
    *Move this file to the `terraform/` directory if you ran the command from a different location.*

### Step 5.2: Deploy the Application

From the root of the project, run the deployment script:
```bash
# Make sure the script is executable
chmod +x scripts/deploy.sh

# Run the script
./scripts/deploy.sh
```
This script will build and push your application's Docker image to ECR and update the ECS service.

### Step 5.3: Verify the Deployment

Run the health check script to confirm the application is running correctly:
```bash
chmod +x scripts/health-check.sh
./scripts/health-check.sh
```

---

## 6. Post-Deployment Steps

1.  **Update Google OAuth Callback URL:**
    - Get the `application_url` from the Terraform output.
    - Go to your Google Cloud Console for your OAuth client.
    - Add an "Authorized redirect URI": `{application_url}/auth/google/callback`.

2.  **Monitoring:**
    - Use the AWS CloudWatch console to view logs from the ECS service, ALB, and RDS instance.
    - Check the ECS deployment status in the ECS console.

---

## 7. Destroying the Infrastructure

To tear down all the AWS resources created by Terraform, run the following command from the `terraform` directory:
```bash
# Be absolutely sure you want to do this. This is irreversible.
cd terraform
terraform destroy -var-file="production.tfvars"
```