#!/bin/bash

# ============================================================================
# Script de Diagnóstico para Error 503 en ECS
# ============================================================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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
TG_NAME="${TG_NAME:-majestic-app-tg}"

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║           DIAGNÓSTICO DE ERROR 503 EN ECS                         ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# 1. VERIFICAR ESTADO DEL SERVICIO ECS
# ============================================================================

echo ""
log_info "1️⃣  VERIFICANDO ESTADO DEL SERVICIO ECS"
echo "══════════════════════════════════════════════════════════════════"

SERVICE_INFO=$(aws ecs describe-services \
    --cluster $ECS_CLUSTER_NAME \
    --services $ECS_SERVICE_NAME \
    --region $AWS_REGION)

RUNNING_COUNT=$(echo $SERVICE_INFO | jq -r '.services[0].runningCount')
DESIRED_COUNT=$(echo $SERVICE_INFO | jq -r '.services[0].desiredCount')
PENDING_COUNT=$(echo $SERVICE_INFO | jq -r '.services[0].pendingCount')

echo "Tasks Running: $RUNNING_COUNT / Desired: $DESIRED_COUNT / Pending: $PENDING_COUNT"

if [ "$RUNNING_COUNT" == "0" ]; then
    log_error "No hay tasks en ejecución!"
    
    # Ver eventos del servicio
    log_info "Últimos eventos del servicio:"
    echo $SERVICE_INFO | jq -r '.services[0].events[:5][] | "\(.createdAt) - \(.message)"'
fi

# ============================================================================
# 2. VERIFICAR TASKS Y LOGS
# ============================================================================

echo ""
log_info "2️⃣  VERIFICANDO TASKS"
echo "══════════════════════════════════════════════════════════════════"

TASKS=$(aws ecs list-tasks \
    --cluster $ECS_CLUSTER_NAME \
    --service-name $ECS_SERVICE_NAME \
    --region $AWS_REGION \
    --query 'taskArns[*]' \
    --output text)

if [ -z "$TASKS" ]; then
    log_error "No hay tasks asociadas al servicio"
    
    # Verificar task definition
    log_info "Verificando Task Definition..."
    TASK_DEF_ARN=$(echo $SERVICE_INFO | jq -r '.services[0].taskDefinition')
    echo "Task Definition: $TASK_DEF_ARN"
    
    aws ecs describe-task-definition \
        --task-definition $TASK_DEF_ARN \
        --region $AWS_REGION \
        --query 'taskDefinition.{Family:family,Revision:revision,Cpu:cpu,Memory:memory,Status:status}' \
        --output table
else
    log_success "Tasks encontradas"
    
    # Describir tasks
    TASK_DETAILS=$(aws ecs describe-tasks \
        --cluster $ECS_CLUSTER_NAME \
        --tasks $TASKS \
        --region $AWS_REGION)
    
    echo "$TASK_DETAILS" | jq -r '.tasks[] | "Task: \(.taskArn | split("/") | .[-1])\nStatus: \(.lastStatus)\nHealth: \(.healthStatus // "N/A")\nStopped Reason: \(.stoppedReason // "Running")\n"'
    
    # Ver logs recientes
    log_info "Últimos logs (si existen):"
    LOG_GROUP="/ecs/${PROJECT_NAME}"
    
    LATEST_STREAM=$(aws logs describe-log-streams \
        --log-group-name $LOG_GROUP \
        --order-by LastEventTime \
        --descending \
        --max-items 1 \
        --region $AWS_REGION \
        --query 'logStreams[0].logStreamName' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$LATEST_STREAM" ] && [ "$LATEST_STREAM" != "None" ]; then
        aws logs tail $LOG_GROUP \
            --log-stream-names $LATEST_STREAM \
            --since 10m \
            --region $AWS_REGION 2>/dev/null | tail -20
    else
        log_warning "No se encontraron logs en CloudWatch"
    fi
fi

# ============================================================================
# 3. VERIFICAR TARGET GROUP HEALTH
# ============================================================================

echo ""
log_info "3️⃣  VERIFICANDO HEALTH DEL TARGET GROUP"
echo "══════════════════════════════════════════════════════════════════"

TG_ARN=$(aws elbv2 describe-target-groups \
    --names $TG_NAME \
    --region $AWS_REGION \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)

TARGET_HEALTH=$(aws elbv2 describe-target-health \
    --target-group-arn $TG_ARN \
    --region $AWS_REGION)

echo "$TARGET_HEALTH" | jq -r '.TargetHealthDescriptions[] | "Target: \(.Target.Id):\(.Target.Port)\nState: \(.TargetHealth.State)\nReason: \(.TargetHealth.Reason // "N/A")\nDescription: \(.TargetHealth.Description // "N/A")\n"'

UNHEALTHY_COUNT=$(echo "$TARGET_HEALTH" | jq '[.TargetHealthDescriptions[] | select(.TargetHealth.State != "healthy")] | length')

if [ "$UNHEALTHY_COUNT" -gt 0 ]; then
    log_error "Hay $UNHEALTHY_COUNT targets no saludables"
fi

# Verificar configuración del health check
log_info "Configuración del Health Check:"
aws elbv2 describe-target-groups \
    --target-group-arns $TG_ARN \
    --region $AWS_REGION \
    --query 'TargetGroups[0].{Path:HealthCheckPath,Interval:HealthCheckIntervalSeconds,Timeout:HealthCheckTimeoutSeconds,HealthyThreshold:HealthyThresholdCount,UnhealthyThreshold:UnhealthyThresholdCount,Protocol:HealthCheckProtocol,Port:HealthCheckPort}' \
    --output table

# ============================================================================
# 4. VERIFICAR INSTANCIAS EC2
# ============================================================================

echo ""
log_info "4️⃣  VERIFICANDO INSTANCIAS EC2 EN ECS"
echo "══════════════════════════════════════════════════════════════════"

CONTAINER_INSTANCES=$(aws ecs list-container-instances \
    --cluster $ECS_CLUSTER_NAME \
    --region $AWS_REGION \
    --query 'containerInstanceArns[*]' \
    --output text)

if [ -z "$CONTAINER_INSTANCES" ]; then
    log_error "No hay instancias EC2 registradas en el cluster!"
    log_warning "Las instancias pueden tardar 2-5 minutos en registrarse"
else
    log_success "Instancias encontradas en el cluster"
    
    INSTANCE_DETAILS=$(aws ecs describe-container-instances \
        --cluster $ECS_CLUSTER_NAME \
        --container-instances $CONTAINER_INSTANCES \
        --region $AWS_REGION)
    
    echo "$INSTANCE_DETAILS" | jq -r '.containerInstances[] | "Instance: \(.ec2InstanceId)\nStatus: \(.status)\nAgent Connected: \(.agentConnected)\nRunning Tasks: \(.runningTasksCount)\nPending Tasks: \(.pendingTasksCount)\nCPU Available: \(.remainingResources[] | select(.name=="CPU") | .integerValue)\nMemory Available: \(.remainingResources[] | select(.name=="MEMORY") | .integerValue) MB\n"'
fi

# ============================================================================
# 5. VERIFICAR CONECTIVIDAD DE RED
# ============================================================================

echo ""
log_info "5️⃣  VERIFICANDO CONECTIVIDAD"
echo "══════════════════════════════════════════════════════════════════"

# Obtener IP pública de la instancia
if [ -n "$CONTAINER_INSTANCES" ]; then
    EC2_INSTANCE_ID=$(echo "$INSTANCE_DETAILS" | jq -r '.containerInstances[0].ec2InstanceId')
    
    PUBLIC_IP=$(aws ec2 describe-instances \
        --instance-ids $EC2_INSTANCE_ID \
        --region $AWS_REGION \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text)
    
    log_info "IP Pública de la instancia: $PUBLIC_IP"
    
    # Verificar security groups
    SG_IDS=$(aws ec2 describe-instances \
        --instance-ids $EC2_INSTANCE_ID \
        --region $AWS_REGION \
        --query 'Reservations[0].Instances[0].SecurityGroups[*].GroupId' \
        --output text)
    
    log_info "Security Groups aplicados: $SG_IDS"
    
    # Intentar conexión directa
    log_info "Probando conexión directa al puerto 3000..."
    if timeout 5 bash -c "echo > /dev/tcp/$PUBLIC_IP/3000" 2>/dev/null; then
        log_success "Puerto 3000 accesible directamente"
    else
        log_error "No se puede conectar al puerto 3000"
    fi
fi

# ============================================================================
# 6. VERIFICAR CONEXIÓN A BASE DE DATOS
# ============================================================================

echo ""
log_info "6️⃣  VERIFICANDO CONEXIÓN A BASE DE DATOS"
echo "══════════════════════════════════════════════════════════════════"

DB_INSTANCE_IDENTIFIER="health-app"
DB_INFO=$(aws rds describe-db-instances \
    --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
    --region $AWS_REGION 2>/dev/null || echo "")

if [ -n "$DB_INFO" ]; then
    DB_STATUS=$(echo $DB_INFO | jq -r '.DBInstances[0].DBInstanceStatus')
    DB_ENDPOINT=$(echo $DB_INFO | jq -r '.DBInstances[0].Endpoint.Address')
    
    log_info "Estado de RDS: $DB_STATUS"
    log_info "Endpoint: $DB_ENDPOINT"
    
    if [ "$DB_STATUS" != "available" ]; then
        log_error "Base de datos no está disponible!"
    fi
else
    log_warning "No se pudo obtener información de RDS"
fi

# ============================================================================
# RESUMEN Y RECOMENDACIONES
# ============================================================================

echo ""
echo "══════════════════════════════════════════════════════════════════"
log_info "📋 RESUMEN Y PRÓXIMOS PASOS"
echo "══════════════════════════════════════════════════════════════════"
echo ""

if [ "$RUNNING_COUNT" == "0" ]; then
    echo "❌ PROBLEMA PRINCIPAL: No hay tasks ejecutándose"
    echo ""
    echo "Posibles causas:"
    echo "1. Error en el código de la aplicación (revisar logs)"
    echo "2. Falta de recursos en las instancias EC2"
    echo "3. Problemas con la imagen Docker"
    echo "4. Error de conexión a la base de datos"
    echo ""
    echo "Acciones recomendadas:"
    echo "• Revisar logs: aws logs tail /ecs/${PROJECT_NAME} --follow --region $AWS_REGION"
    echo "• Verificar imagen Docker localmente"
    echo "• Comprobar variables de entorno"
fi

if [ -z "$CONTAINER_INSTANCES" ]; then
    echo "❌ PROBLEMA: No hay instancias EC2 en el cluster"
    echo ""
    echo "Acciones recomendadas:"
    echo "• Verificar Auto Scaling Group"
    echo "• Revisar user data del Launch Template"
    echo "• Comprobar IAM Instance Profile"
fi

if [ "$UNHEALTHY_COUNT" -gt 0 ]; then
    echo "❌ PROBLEMA: Targets no pasan health check"
    echo ""
    echo "Acciones recomendadas:"
    echo "• Verificar que la app responda en el puerto correcto"
    echo "• Comprobar ruta del health check"
    echo "• Revisar security groups (puertos dinámicos 32768-65535)"
fi

echo ""
echo "Comandos útiles:"
echo ""
echo "# Ver logs en tiempo real"
echo "aws logs tail /ecs/${PROJECT_NAME} --follow --region $AWS_REGION"
echo ""
echo "# Forzar nuevo despliegue"
echo "aws ecs update-service --cluster $ECS_CLUSTER_NAME --service $ECS_SERVICE_NAME --force-new-deployment --region $AWS_REGION"
echo ""
echo "# Ver eventos del servicio"
echo "aws ecs describe-services --cluster $ECS_CLUSTER_NAME --services $ECS_SERVICE_NAME --region $AWS_REGION | jq '.services[0].events[:10]'"
echo ""
echo "# Conectar por SSH a la instancia (si tienes key pair)"
echo "ssh -i your-key.pem ec2-user@$PUBLIC_IP"
echo ""

exit 0