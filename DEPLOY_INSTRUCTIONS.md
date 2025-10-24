# Deployment Instructions for Majestic App

This document provides the necessary steps to deploy the Majestic App to AWS using Terraform and GitHub Actions.

## Prerequisites

1.  **AWS Account:** You need an AWS account with programmatic access (Access Key ID and Secret Access Key).
2.  **GitHub Repository:** Your application code should be in a GitHub repository.
3.  **Terraform:** Terraform must be installed on your local machine.
4.  **AWS CLI:** The AWS CLI must be installed and configured on your local machine.

## Step 1: Configure Terraform Backend

The Terraform state is managed remotely using an S3 bucket and a DynamoDB table for locking. You need to create these resources manually before running Terraform for the first time.

1.  **Create an S3 Bucket:**
    -   Go to the S3 console in AWS.
    -   Create a new bucket with a unique name (e.g., `your-company-terraform-state`).
    -   Note down the bucket name.

2.  **Create a DynamoDB Table:**
    -   Go to the DynamoDB console in AWS.
    -   Create a new table with a unique name (e.g., `your-company-terraform-lock`).
    -   The primary key should be `LockID` (of type String).
    -   Note down the table name.

3.  **Update `provider.tf`:**
    -   Open the `terraform/provider.tf` file.
    -   Replace `"your-terraform-state-bucket-name"` with the name of the S3 bucket you created.
    -   Replace `"your-terraform-lock-table-name"` with the name of the DynamoDB table you created.

## Step 2: Set up GitHub Secrets

The GitHub Actions workflow requires AWS credentials to deploy the application. You need to add the following secrets to your GitHub repository:

1.  `AWS_ACCESS_KEY_ID`: Your AWS Access Key ID.
2.  `AWS_SECRET_ACCESS_KEY`: Your AWS Secret Access Key.
3.  `DB_PASSWORD`: The password you want to use for the RDS database.

To add secrets:
- Go to your repository's **Settings** > **Secrets and variables** > **Actions**.
- Click on **New repository secret** for each of the secrets above.

## Step 3: Initial Terraform Deployment

Before the CI/CD pipeline can work, you need to run the initial Terraform deployment from your local machine to create all the necessary AWS resources.

1.  **Navigate to the Terraform directory:**
    ```bash
    cd terraform
    ```

2.  **Initialize Terraform:**
    ```bash
    terraform init
    ```

3.  **Create a `terraform.tfvars` file:**
    Create a new file named `terraform.tfvars` in the `terraform` directory and add the database password:
    ```
    db_password = "your-database-password"
    ```
    Replace `"your-database-password"` with the same password you set in the `DB_PASSWORD` GitHub secret.

4.  **Plan and Apply the Terraform configuration:**
    ```bash
    terraform plan -out=tfplan
    terraform apply "tfplan"
    ```

    Terraform will show you a plan of the resources to be created. Type `yes` to approve and create the resources.

## Step 4: Push to GitHub

Once the initial deployment is complete, commit all the new files (`Dockerfile`, `terraform/`, `.github/workflows/`, `DEPLOY_INSTRUCTIONS.md`) to your repository and push to the `main` branch.

```bash
git add .
git commit -m "feat: Add AWS ECS deployment configuration"
git push origin main
```

The push to the `main` branch will trigger the GitHub Actions workflow, which will automatically build and deploy your application to the newly created ECS cluster.

## Deployment Information

After the Terraform deployment is complete, you can find the application URL and other important information in the Terraform outputs:

```bash
terraform output
```