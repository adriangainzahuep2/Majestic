#!/bin/bash

# ============================================================================
# Script de Corrección para Error 503 en ECS
# ============================================================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

# Configuración
PROJECT_NAME="${PROJECT_NAME:-majestic-app}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ECS_CLUSTER_NAME="${ECS_CLUSTER_NAME:-majestic-app-cluster}"
ECS_SERVICE_NAME="${ECS_SERVICE_NAME:-majestic-app-service}"
ECS_TASK_FAMILY="${ECS_TASK_FAMILY:-majestic-app-task}"
DOCKER_IMAGE="${DOCKER_IMAGE:-339713138893.dkr.ecr.us-east-1.amazonaws.com/majestic-app:latest}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║           CORRECCIÓN DE ERROR 503 EN ECS                          ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# 1. RECREAR TASK DEFINITION CON CONFIGURACIÓN CORRECTA
# ============================================================================

echo ""
log_info "1️⃣  RECREANDO TASK DEFINITION"
echo "══════════════════════════════════════════════════════════════════"

# Obtener ARN del rol de ejecución
EXECUTION_ROLE_NAME="${PROJECT_NAME}-ecs-execution-role"
EXECUTION_ROLE_ARN=$(aws iam get-role \
    --role-name $EXECUTION_ROLE_NAME \
    --query 'Role.Arn' \
    --output text)

log_info "Execution Role: $EXECUTION_ROLE_ARN"

# DATABASE_URL completa
DATABASE_URL="postgresql://majestic:simple123@health-app.c4vuie06a0wt.us-east-1.rds.amazonaws.com:5432/health_app"

# Crear nueva task definition
cat > /tmp/task-definition.json <<EOF
{
  "family": "$ECS_TASK_FAMILY",
  "executionRoleArn": "$EXECUTION_ROLE_ARN",
  "networkMode": "bridge",
  "requiresCompatibilities": ["EC2"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "${PROJECT_NAME}-container",
      "image": "$DOCKER_IMAGE",
      "cpu": 512,
      "memory": 1024,
      "memoryReservation": 512,
      "essential": true,
      "portMappings": [
        {
          "containerPort": $CONTAINER_PORT,
          "hostPort": 0,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "DATABASE_URL",
          "value": "$DATABASE_URL"
        },
        {
          "name": "PORT",
          "value": "$CONTAINER_PORT"
        },
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${PROJECT_NAME}",
          "awslogs-region": "$AWS_REGION",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      },
      "healthCheck": {
        "command": [
          "CMD-SHELL",
          "curl -f http://localhost:$CONTAINER_PORT/ || exit 1"
        ],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
EOF

log_info "Registrando nueva Task Definition..."
NEW_TASK_DEF=$(aws ecs register-task-definition \
    --cli-input-json file:///tmp/task-definition.json \
    --region $AWS_REGION)

TASK_DEF_ARN=$(echo $NEW_TASK_DEF | jq -r '.taskDefinition.taskDefinitionArn')
log_success "Task Definition creada: $TASK_DEF_ARN"

# ============================================================================
# 2. ACTUALIZAR SERVICIO
# ============================================================================

echo ""
log_info "2️⃣  ACTUALIZANDO SERVICIO ECS"
echo "══════════════════════════════════════════════════════════════════"

# Obtener Target Group ARN
TG_NAME="${PROJECT_NAME}-tg"
TG_ARN=$(aws elbv2 describe-target-groups \
    --names $TG_NAME \
    --region $AWS_REGION \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)

# Verificar si el servicio existe
if aws ecs describe-services \
    --cluster $ECS_CLUSTER_NAME \
    --services $ECS_SERVICE_NAME \
    --region $AWS_REGION \
    --query 'services[0].status' \
    --output text 2>/dev/null | grep -q "ACTIVE"; then
    
    log_info "Actualizando servicio existente..."
    
    aws ecs update-service \
        --cluster $ECS_CLUSTER_NAME \
        --service $ECS_SERVICE_NAME \
        --task-definition $TASK_DEF_ARN \
        --force-new-deployment \
        --desired-count 1 \
        --region $AWS_REGION
    
    log_success "Servicio actualizado"
else
    log_info "Recreando servicio..."
    
    # Eliminar servicio antiguo si existe en estado inactivo
    aws ecs delete-service \
        --cluster $ECS_CLUSTER_NAME \
        --service $ECS_SERVICE_NAME \
        --force \
        --region $AWS_REGION 2>/dev/null || true
    
    sleep 5
    
    # Crear nuevo servicio
    aws ecs create-service \
        --cluster $ECS_CLUSTER_NAME \
        --service-name $ECS_SERVICE_NAME \
        --task-definition $TASK_DEF_ARN \
        --desired-count 1 \
        --launch-type EC2 \
        --load-balancers "targetGroupArn=$TG_ARN,containerName=${PROJECT_NAME}-container,containerPort=$CONTAINER_PORT" \
        --health-check-grace-period-seconds 120 \
        --region $AWS_REGION
    
    log_success "Servicio creado"
fi

# ============================================================================
# 3. VERIFICAR SECURITY GROUPS
# ============================================================================

echo ""
log_info "3️⃣  VERIFICANDO SECURITY GROUPS"
echo "══════════════════════════════════════════════════════════════════"

# Obtener VPC
VPC_ID=$(aws ec2 describe-vpcs \
    --region $AWS_REGION \
    --filters "Name=isDefault,Values=true" \
    --query 'Vpcs[0].VpcId' \
    --output text)

# Security Groups
ALB_SG_NAME="${PROJECT_NAME}-alb-sg"
EC2_SG_NAME="${PROJECT_NAME}-ec2-sg"

ALB_SG_ID=$(aws ec2 describe-security-groups \
    --region $AWS_REGION \
    --filters "Name=group-name,Values=$ALB_SG_NAME" \
    --query 'SecurityGroups[0].GroupId' \
    --output text)

EC2_SG_ID=$(aws ec2 describe-security-groups \
    --region $AWS_REGION \
    --filters "Name=group-name,Values=$EC2_SG_NAME" \
    --query 'SecurityGroups[0].GroupId' \
    --output text)

log_info "ALB SG: $ALB_SG_ID"
log_info "EC2 SG: $EC2_SG_ID"

# Asegurar reglas críticas
log_info "Verificando reglas de seguridad..."

# Permitir puertos dinámicos de ECS (32768-65535) desde ALB
aws ec2 authorize-security-group-ingress \
    --group-id $EC2_SG_ID \
    --protocol tcp \
    --port 32768-65535 \
    --source-group $ALB_SG_ID \
    --region $AWS_REGION 2>/dev/null || log_info "Regla ya existe (puertos dinámicos)"

# Permitir puerto específico de la app para pruebas directas
aws ec2 authorize-security-group-ingress \
    --group-id $EC2_SG_ID \
    --protocol tcp \
    --port $CONTAINER_PORT \
    --cidr 0.0.0.0/0 \
    --region $AWS_REGION 2>/dev/null || log_info "Regla ya existe (puerto $CONTAINER_PORT)"

log_success "Security Groups verificados"

# ============================================================================
# 4. ACTUALIZAR TARGET GROUP HEALTH CHECK
# ============================================================================

echo ""
log_info "4️⃣  ACTUALIZANDO HEALTH CHECK DEL TARGET GROUP"
echo "══════════════════════════════════════════════════════════════════"

aws elbv2 modify-target-group \
    --target-group-arn $TG_ARN \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 10 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --health-check-path / \
    --matcher "HttpCode=200" \
    --region $AWS_REGION

log_success "Health Check actualizado"

# ============================================================================
# 5. VERIFICAR INSTANCIAS EC2
# ============================================================================

echo ""
log_info "5️⃣  VERIFICANDO INSTANCIAS EC2"
echo "══════════════════════════════════════════════════════════════════"

CONTAINER_INSTANCES=$(aws ecs list-container-instances \
    --cluster $ECS_CLUSTER_NAME \
    --region $AWS_REGION \
    --query 'containerInstanceArns[*]' \
    --output text)

if [ -z "$CONTAINER_INSTANCES" ]; then
    log_error "No hay instancias registradas en el cluster"
    log_info "Verifica el Auto Scaling Group y espera 2-3 minutos"
else
    INSTANCE_COUNT=$(echo $CONTAINER_INSTANCES | wc -w)
    log_success "$INSTANCE_COUNT instancia(s) registrada(s)"
    
    # Obtener ID de la instancia EC2
    INSTANCE_DETAILS=$(aws ecs describe-container-instances \
        --cluster $ECS_CLUSTER_NAME \
        --container-instances $CONTAINER_INSTANCES \
        --region $AWS_REGION)
    
    EC2_INSTANCE_ID=$(echo $INSTANCE_DETAILS | jq -r '.containerInstances[0].ec2InstanceId')
    
    PUBLIC_IP=$(aws ec2 describe-instances \
        --instance-ids $EC2_INSTANCE_ID \
        --region $AWS_REGION \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text)
    
    log_info "Instancia EC2: $EC2_INSTANCE_ID"
    log_info "IP Pública: $PUBLIC_IP"
fi

# ============================================================================
# 6. MONITOREAR DESPLIEGUE
# ============================================================================

echo ""
log_info "6️⃣  MONITOREANDO DESPLIEGUE"
echo "══════════════════════════════════════════════════════════════════"

log_info "Esperando a que el servicio se estabilice (esto puede tomar 2-5 minutos)..."

for i in {1..60}; do
    sleep 10
    
    # Verificar estado del servicio
    SERVICE_STATUS=$(aws ecs describe-services \
        --cluster $ECS_CLUSTER_NAME \
        --services $ECS_SERVICE_NAME \
        --region $AWS_REGION)
    
    RUNNING_COUNT=$(echo $SERVICE_STATUS | jq -r '.services[0].runningCount')
    DESIRED_COUNT=$(echo $SERVICE_STATUS | jq -r '.services[0].desiredCount')
    
    # Verificar health del target group
    TARGET_HEALTH=$(aws elbv2 describe-target-health \
        --target-group-arn $TG_ARN \
        --region $AWS_REGION)
    
    HEALTHY_TARGETS=$(echo $TARGET_HEALTH | jq '[.TargetHealthDescriptions[] | select(.TargetHealth.State == "healthy")] | length')
    
    echo -ne "\r[$(date +%H:%M:%S)] Running: $RUNNING_COUNT/$DESIRED_COUNT | Healthy Targets: $HEALTHY_TARGETS"
    
    if [ "$RUNNING_COUNT" -eq "$DESIRED_COUNT" ] && [ "$HEALTHY_TARGETS" -gt 0 ]; then
        echo ""
        log_success "Servicio desplegado exitosamente!"
        break
    fi
    
    if [ $i -eq 60 ]; then
        echo ""
        log_error "Timeout esperando despliegue"
        log_info "Revisa los logs para más detalles"
    fi
done

# ============================================================================
# 7. VERIFICAR CONECTIVIDAD
# ============================================================================

echo ""
log_info "7️⃣  VERIFICANDO CONECTIVIDAD"
echo "══════════════════════════════════════════════════════════════════"

# Obtener DNS del ALB
ALB_NAME="${PROJECT_NAME}-alb"
ALB_DNS=$(aws elbv2 describe-load-balancers \
    --names $ALB_NAME \
    --region $AWS_REGION \
    --query 'LoadBalancers[0].DNSName' \
    --output text)

log_info "Probando conectividad al ALB..."
if curl -s -o /dev/null -w "%{http_code}" http://$ALB_DNS | grep -q "200\|301\|302"; then
    log_success "✓ ALB responde correctamente"
else
    log_warning "ALB aún no responde (puede tardar unos segundos más)"
fi

if [ -n "$PUBLIC_IP" ]; then
    log_info "Probando conectividad directa a la instancia..."
    if curl -s -o /dev/null -w "%{http_code}" http://$PUBLIC_IP:$CONTAINER_PORT | grep -q "200\|301\|302"; then
        log_success "✓ Instancia responde directamente"
    else
        log_warning "Instancia no responde directamente"
    fi
fi

# ============================================================================
# RESUMEN FINAL
# ============================================================================

echo ""
echo "══════════════════════════════════════════════════════════════════"
log_success "CORRECCIÓN COMPLETADA"
echo "══════════════════════════════════════════════════════════════════"
echo ""
echo "📋 URLS DE ACCESO:"
echo ""
echo "