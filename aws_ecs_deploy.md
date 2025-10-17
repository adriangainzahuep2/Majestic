# 🚀 Deploy Node.js Application to AWS ECS

Guía completa para desplegar la aplicación en AWS ECS (Elastic Container Service).

## 📋 Prerequisitos

- AWS CLI instalado y configurado
- Docker instalado
- Cuenta de AWS con permisos apropiados
- ECR repository creado (o lo crearemos)

## 🔧 Paso 1: Configurar AWS CLI

```bash
# Instalar AWS CLI (si no está instalado)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configurar credenciales
aws configure
# AWS Access Key ID: YOUR_ACCESS_KEY
# AWS Secret Access Key: YOUR_SECRET_KEY
# Default region: us-east-1
# Default output format: json

# Verificar configuración
aws sts get-caller-identity
```

## 🐳 Paso 2: Crear ECR Repository y Push Image

```bash
# Variables
REGION=us-east-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPO_NAME=majestic-app
IMAGE_TAG=latest

# Crear ECR repository
aws ecr create-repository \
    --repository-name $REPO_NAME \
    --region $REGION

# Autenticar Docker con ECR
aws ecr get-login-password --region $REGION | \
    docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Build de la imagen
docker build -t $REPO_NAME:$IMAGE_TAG .

# Tag de la imagen
docker tag $REPO_NAME:$IMAGE_TAG \
    $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG

# Push a ECR
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG
```

## 🌐 Paso 3: Crear VPC y Security Groups (opcional si ya tienes)

```bash
# Crear VPC (o usar la default)
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)

# Crear Security Group para ECS
SG_ID=$(aws ec2 create-security-group \
    --group-name majestic-app-sg \
    --description "Security group for Node.js app" \
    --vpc-id $VPC_ID \
    --output text --query 'GroupId')

# Permitir tráfico HTTP (puerto 5000)
aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID \
    --protocol tcp \
    --port 5000 \
    --cidr 0.0.0.0/0

# Permitir tráfico HTTPS (si usas ALB)
aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0

# Obtener subnets
SUBNETS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query "Subnets[*].SubnetId" \
    --output text | tr '\t' ',')
```

## 📝 Paso 4: Crear Task Definition

Crear archivo `task-definition.json`:

```json
{
  "family": "majestic-app-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "majestic-app",
      "image": "ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/majestic-app:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 5000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "5000"
        }
      ],
      "secrets": [
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:prod/db-password"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/majestic-app",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": [
          "CMD-SHELL",
          "node -e \"require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})\""
        ],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

```bash
# Reemplazar variables en task-definition.json
sed -i "s/ACCOUNT_ID/$ACCOUNT_ID/g" task-definition.json
sed -i "s/REGION/$REGION/g" task-definition.json

# Crear IAM roles si no existen
aws iam create-role \
    --role-name ecsTaskExecutionRole \
    --assume-role-policy-document file://task-execution-assume-role.json

aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Crear CloudWatch Log Group
aws logs create-log-group --log-group-name /ecs/majestic-app

# Registrar Task Definition
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

## 🎯 Paso 5: Crear ECS Cluster

```bash
# Crear cluster con Fargate
aws ecs create-cluster --cluster-name majestic-app-cluster

# Verificar cluster
aws ecs describe-clusters --clusters majestic-app-cluster
```

## 🚢 Paso 6: Crear ECS Service

```bash
# Crear servicio
aws ecs create-service \
    --cluster majestic-app-cluster \
    --service-name majestic-app-service \
    --task-definition majestic-app-task \
    --desired-count 2 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
    --health-check-grace-period-seconds 60

# Ver estado del servicio
aws ecs describe-services \
    --cluster majestic-app-cluster \
    --services majestic-app-service
```

## 🔄 Paso 7: Configurar Application Load Balancer (Recomendado)

```bash
# Crear ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
    --name majestic-app-alb \
    --subnets $(echo $SUBNETS | tr ',' ' ') \
    --security-groups $SG_ID \
    --scheme internet-facing \
    --type application \
    --ip-address-type ipv4 \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text)

# Crear Target Group
TG_ARN=$(aws elbv2 create-target-group \
    --name majestic-app-tg \
    --protocol HTTP \
    --port 5000 \
    --vpc-id $VPC_ID \
    --target-type ip \
    --health-check-path /health \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)

# Crear Listener
aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=forward,TargetGroupArn=$TG_ARN

# Actualizar servicio para usar ALB
aws ecs update-service \
    --cluster majestic-app-cluster \
    --service majestic-app-service \
    --load-balancers targetGroupArn=$TG_ARN,containerName=majestic-app,containerPort=5000 \
    --health-check-grace-period-seconds 60 \
    --force-new-deployment

# Obtener DNS del ALB
aws elbv2 describe-load-balancers \
    --load-balancer-arns $ALB_ARN \
    --query 'LoadBalancers[0].DNSName' \
    --output text
```

## 🔐 Paso 8: Configurar Secrets Manager (para variables sensibles)

```bash
# Crear secret para DB password
aws secretsmanager create-secret \
    --name prod/db-password \
    --secret-string "your-secure-password"

# Crear secret para todas las variables
aws secretsmanager create-secret \
    --name prod/majestic-app/env \
    --secret-string file://secrets.json
```

Archivo `secrets.json`:
```json
{
  "DB_PASSWORD": "your-db-password",
  "JWT_SECRET": "your-jwt-secret",
  "API_KEY": "your-api-key"
}
```

## 🔄 Paso 9: Auto Scaling (opcional)

```bash
# Registrar target escalable
aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --resource-id service/majestic-app-cluster/majestic-app-service \
    --scalable-dimension ecs:service:DesiredCount \
    --min-capacity 2 \
    --max-capacity 10

# Crear política de escalado por CPU
aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --resource-id service/majestic-app-cluster/majestic-app-service \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-name cpu-scaling-policy \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration file://scaling-policy.json
```

Archivo `scaling-policy.json`:
```json
{
  "TargetValue": 70.0,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "ScaleOutCooldown": 60,
  "ScaleInCooldown": 60
}
```

## 📊 Paso 10: Monitoreo y Logs

```bash
# Ver logs en tiempo real
aws logs tail /ecs/majestic-app --follow

# Ver logs específicos
aws logs filter-log-events \
    --log-group-name /ecs/majestic-app \
    --start-time $(date -d '1 hour ago' +%s)000

# Ver métricas del servicio
aws cloudwatch get-metric-statistics \
    --namespace AWS/ECS \
    --metric-name CPUUtilization \
    --dimensions Name=ServiceName,Value=majestic-app-service Name=ClusterName,Value=majestic-app-cluster \
    --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
    --period 300 \
    --statistics Average
```

## 🔄 Paso 11: Deploy de Nuevas Versiones

```bash
#!/bin/bash
# deploy.sh - Script para despliegue automatizado

REGION=us-east-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPO_NAME=majestic-app
IMAGE_TAG=$(git rev-parse --short HEAD)
CLUSTER=majestic-app-cluster
SERVICE=majestic-app-service

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
TASK_DEFINITION=$(aws ecs describe-task-definition --task-definition majestic-app-task --query 'taskDefinition' --output json)
NEW_TASK_DEF=$(echo $TASK_DEFINITION | jq --arg IMAGE "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG" '.containerDefinitions[0].image = $IMAGE | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)')
NEW_TASK_INFO=$(aws ecs register-task-definition --cli-input-json "$NEW_TASK_DEF")
NEW_REVISION=$(echo $NEW_TASK_INFO | jq -r '.taskDefinition.revision')

echo "🚀 Deploying to ECS..."
aws ecs update-service \
    --cluster $CLUSTER \
    --service $SERVICE \
    --task-definition majestic-app-task:$NEW_REVISION \
    --force-new-deployment

echo "✅ Deployment initiated. Waiting for service to stabilize..."
aws ecs wait services-stable \
    --cluster $CLUSTER \
    --services $SERVICE

echo "🎉 Deployment completed successfully!"
```

Hacer ejecutable:
```bash
chmod +x deploy.sh
./deploy.sh
```

## 🔧 Paso 12: CI/CD con GitHub Actions

Crear `.github/workflows/deploy-ecs.yml`:

```yaml
name: Deploy to AWS ECS

on:
  push:
    branches: [main]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: majestic-app
  ECS_CLUSTER: majestic-app-cluster
  ECS_SERVICE: majestic-app-service
  ECS_TASK_DEFINITION: majestic-app-task

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ env.AWS_REGION }}

    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v1

    - name: Build, tag, and push image to Amazon ECR
      id: build-image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
        echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

    - name: Download task definition
      run: |
        aws ecs describe-task-definition \
          --task-definition ${{ env.ECS_TASK_DEFINITION }} \
          --query taskDefinition > task-definition.json

    - name: Fill in the new image ID in the Amazon ECS task definition
      id: task-def
      uses: aws-actions/amazon-ecs-render-task-definition@v1
      with:
        task-definition: task-definition.json
        container-name: majestic-app
        image: ${{ steps.build-image.outputs.image }}

    - name: Deploy Amazon ECS task definition
      uses: aws-actions/amazon-ecs-deploy-task-definition@v1
      with:
        task-definition: ${{ steps.task-def.outputs.task-definition }}
        service: ${{ env.ECS_SERVICE }}
        cluster: ${{ env.ECS_CLUSTER }}
        wait-for-service-stability: true
```

## 🧹 Limpieza de Recursos

```bash
# Eliminar servicio
aws ecs update-service \
    --cluster majestic-app-cluster \
    --service majestic-app-service \
    --desired-count 0

aws ecs delete-service \
    --cluster majestic-app-cluster \
    --service majestic-app-service \
    --force

# Eliminar cluster
aws ecs delete-cluster --cluster majestic-app-cluster

# Eliminar ALB
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN

# Eliminar Target Group
aws elbv2 delete-target-group --target-group-arn $TG_ARN

# Eliminar ECR repository
aws ecr delete-repository \
    --repository-name majestic-app \
    --force

# Eliminar Log Group
aws logs delete-log-group --log-group-name /ecs/majestic-app
```

## 💰 Estimación de Costos

Para una aplicación básica con Fargate:
- **Fargate tasks** (0.25 vCPU, 0.5 GB): ~$15-20/mes por tarea
- **ALB**: ~$16-25/mes
- **Data Transfer**: Variable según tráfico
- **CloudWatch Logs**: ~$0.50/GB
- **ECR Storage**: ~$0.10/GB/mes

**Estimado total**: $50-100/mes para 2 tareas + ALB

## 🎯 Mejores Prácticas

1. **Usa Secrets Manager** para credentials
2. **Implementa Health Checks** robustos
3. **Configura Auto Scaling** para producción
4. **Usa ALB** para SSL/TLS y balanceo
5. **Monitorea con CloudWatch**
6. **Implementa CI/CD** con GitHub Actions o CodePipeline
7. **Tag tus recursos** para mejor organización
8. **Implementa blue/green deployments** para zero-downtime
9. **Usa Parameter Store** para configuraciones no sensibles
10. **Configura alarmas** en CloudWatch

## 🚨 Troubleshooting

### Servicio no inicia
```bash
# Ver eventos del servicio
aws ecs describe-services \
    --cluster majestic-app-cluster \
    --services majestic-app-service \
    --query 'services[0].events[:5]'

# Ver logs de las tareas
aws ecs list-tasks --cluster majestic-app-cluster --service-name majestic-app-service
aws logs tail /ecs/majestic-app --follow
```

### Health checks fallan
```bash
# Verificar security groups
aws ec2 describe-security-groups --group-ids $SG_ID

# Probar conectividad
aws ecs execute-command \
    --cluster majestic-app-cluster \
    --task TASK_ID \
    --container majestic-app \
    --interactive \
    --command "/bin/sh"
```

## 📚 Recursos Adicionales

- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [Fargate Pricing](https://aws.amazon.com/fargate/pricing/)
- [ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)

---

¡Tu aplicación Node.js ahora está desplegada en AWS ECS! 🎉