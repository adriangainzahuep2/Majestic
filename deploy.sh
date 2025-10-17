#!/bin/bash
# deploy.sh - Script para despliegue automatizado

REGION=us-east-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPO_NAME=nodejs-app
IMAGE_TAG=$(git rev-parse --short HEAD)
CLUSTER=nodejs-app-cluster
SERVICE=nodejs-app-service

echo "🔨 Building Docker image..."
docker build -t $REPO_NAME:$IMAGE_TAG .

echo "🏷️  Tagging image..."
docker tag $REPO_NAME:$IMAGE_TAG \
    $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG

echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region $REGION | \
    docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

echo "📤 Pushing to ECR..."
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG

echo "📝 Updating task definition..."
TASK_DEFINITION=$(aws ecs describe-task-definition --task-definition nodejs-app-task --query 'taskDefinition' --output json)
NEW_TASK_DEF=$(echo $TASK_DEFINITION | jq --arg IMAGE "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG" '.containerDefinitions[0].image = $IMAGE | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)')
NEW_TASK_INFO=$(aws ecs register-task-definition --cli-input-json "$NEW_TASK_DEF")
NEW_REVISION=$(echo $NEW_TASK_INFO | jq -r '.taskDefinition.revision')

echo "🚀 Deploying to ECS..."
aws ecs update-service \
    --cluster $CLUSTER \
    --service $SERVICE \
    --task-definition nodejs-app-task:$NEW_REVISION \
    --force-new-deployment

echo "✅ Deployment initiated. Waiting for service to stabilize..."
aws ecs wait services-stable \
    --cluster $CLUSTER \
    --services $SERVICE

echo "🎉 Deployment completed successfully!"