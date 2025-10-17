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
log_section() { echo -e "${CYAN}$1${NC}"; }

# Configuración
PROJECT_NAME="${PROJECT_NAME:-majestic-app}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ECS_CLUSTER_NAME="${ECS_CLUSTER_NAME:-majestic-app-cluster}"
ECS_SERVICE_NAME="${ECS_SERVICE_NAME:-majestic-app-service}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║              DIAGNÓSTICO ERROR 503 - ECS                           ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# 1. VERIFICAR ESTADO DE LAS TAREAS
# ============================================================================

log_section "═══════════════════════════════════════════════════════════════════"
log_section "1️⃣  VERIFICANDO ESTADO DE LAS TAREAS ECS"
log_section "═══════════════════════════════════════════════════════════════════"
echo ""

SERVICE_INFO=$(aws ecs describe-services \
    --cluster $ECS_CLUSTER_NAME \
    --services $ECS_SERVICE_NAME \
    --region $AWS_REGION 2>/dev/null)

if [ $? -ne 0 ]; then
    log_error "No se pudo obtener información del servicio"
    exit 1
fi

RUNNING_COUNT=$(echo $SERVICE_INFO | jq -r '.services[0].runningCount')
DESIRED_COUNT=$(echo $SERVICE_INFO | jq -r '.services[0].desiredCount')
PENDING_COUNT=$(echo $SERVICE_INFO | jq -r '.services[0].pendingCount')

echo "📊 Estado del Servicio:"
echo "   • Running: $RUNNING_COUNT"
echo "   • Desired: $DESIRED_COUNT"
echo "   • Pending: $PENDING_COUNT"
echo ""

if [ "$RUNNING_COUNT" -eq 0 ]; then
    log_error "NO HAY TAREAS EN EJECUCIÓN"
    echo ""
    log_info "Verificando eventos del servicio..."
    echo $SERVICE_INFO | jq -r '.services[0].events[0:5][] | "[\(.createdAt)] \(.message)"'
    echo ""
    log_info "Causa más común: La tarea no puede iniciarse"
    log_info "Verifica los logs de CloudWatch: /ecs/${PROJECT_NAME}"
    exit 1
fi

# Obtener ARN de la tarea en ejecución
TASK_ARN=$(aws ecs list-tasks \
    --cluster $ECS_CLUSTER_NAME \
    --service-name $ECS_SERVICE_NAME \
    --region $AWS_REGION \
    --query 'taskArns[0]' \
    --output text)

if [ "$TASK_ARN" == "None" ] || [ -z "$TASK_ARN" ]; then
    log_error "No se encontró ninguna tarea en ejecución"
    exit 1
fi

log_success "Tarea encontrada: ${TASK_ARN##*/}"

# Obtener detalles de la tarea
TASK_DETAILS=$(aws ecs describe-tasks \
    --cluster $ECS_CLUSTER_NAME \
    --tasks $TASK_ARN \
    --region $AWS_REGION)

LAST_STATUS=$(echo $TASK_DETAILS | jq -r '.tasks[0].lastStatus')
HEALTH_STATUS=$(echo $TASK_DETAILS | jq -r '.tasks[0].healthStatus // "UNKNOWN"')
CONTAINER_INSTANCE_ARN=$(echo $TASK_DETAILS | jq -r '.tasks[0].containerInstanceArn')

echo ""
echo "🔍 Detalles de la Tarea:"
echo "   • Estado: $LAST_STATUS"
echo "   • Health: $HEALTH_STATUS"
echo ""

if [ "$HEALTH_STATUS" == "UNHEALTHY" ]; then
    log_error "LA TAREA ESTÁ UNHEALTHY"
    log_info "Esto significa que el health check está fallando"
fi

# Verificar puerto asignado dinámicamente
HOST_PORT=$(echo $TASK_DETAILS | jq -r '.tasks[0].containers[0].networkBindings[0].hostPort // "none"')

if [ "$HOST_PORT" == "none" ]; then
    log_error "No se encontró puerto asignado a la tarea"
else
    log_info "Puerto dinámico asignado: $HOST_PORT"
fi

# ============================================================================
# 2. VERIFICAR TARGET GROUP HEALTH
# ============================================================================

echo ""
log_section "═══════════════════════════════════════════════════════════════════"
log_section "2️⃣  VERIFICANDO HEALTH DEL TARGET GROUP"
log_section "═══════════════════════════════════════════════════════════════════"
echo ""

TG_NAME="${PROJECT_NAME}-tg"
TG_ARN=$(aws elbv2 describe-target-groups \
    --names $TG_NAME \
    --region $AWS_REGION \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)

# Obtener configuración del health check
TG_CONFIG=$(aws elbv2 describe-target-groups \
    --target-group-arns $TG_ARN \
    --region $AWS_REGION)

HC_PATH=$(echo $TG_CONFIG | jq -r '.TargetGroups[0].HealthCheckPath')
HC_PROTOCOL=$(echo $TG_CONFIG | jq -r '.TargetGroups[0].HealthCheckProtocol')
HC_PORT=$(echo $TG_CONFIG | jq -r '.TargetGroups[0].HealthCheckPort')
HC_INTERVAL=$(echo $TG_CONFIG | jq -r '.TargetGroups[0].HealthCheckIntervalSeconds')
HC_TIMEOUT=$(echo $TG_CONFIG | jq -r '.TargetGroups[0].HealthCheckTimeoutSeconds')
HC_MATCHER=$(echo $TG_CONFIG | jq -r '.TargetGroups[0].Matcher.HttpCode')

echo "⚙️  Configuración Health Check:"
echo "   • Path: $HC_PATH"
echo "   • Protocol: $HC_PROTOCOL"
echo "   • Port: $HC_PORT"
echo "   • Interval: $HC_INTERVAL segundos"
echo "   • Timeout: $HC_TIMEOUT segundos"
echo "   • Matcher: HTTP $HC_MATCHER"
echo ""

# Verificar estado de los targets
TARGET_HEALTH=$(aws elbv2 describe-target-health \
    --target-group-arn $TG_ARN \
    --region $AWS_REGION)

echo "🎯 Estado de los Targets:"
echo "$TARGET_HEALTH" | jq -r '.TargetHealthDescriptions[] | "   • Target \(.Target.Id):\(.Target.Port) - \(.TargetHealth.State) - \(.TargetHealth.Reason // "N/A")"'
echo ""

HEALTHY_COUNT=$(echo "$TARGET_HEALTH" | jq '[.TargetHealthDescriptions[] | select(.TargetHealth.State == "healthy")] | length')
UNHEALTHY_COUNT=$(echo "$TARGET_HEALTH" | jq '[.TargetHealthDescriptions[] | select(.TargetHealth.State == "unhealthy")] | length')

if [ "$HEALTHY_COUNT" -eq 0 ]; then
    log_error "NO HAY TARGETS HEALTHY - Esta es la causa del 503"
    
    if [ "$UNHEALTHY_COUNT" -gt 0 ]; then
        echo ""
        log_warning "Razones de targets unhealthy:"
        echo "$TARGET_HEALTH" | jq -r '.TargetHealthDescriptions[] | select(.TargetHealth.State == "unhealthy") | "   • \(.TargetHealth.Reason): \(.TargetHealth.Description)"'
    fi
else
    log_success "$HEALTHY_COUNT target(s) healthy"
fi

# ============================================================================
# 3. VERIFICAR INSTANCIA EC2 Y CONECTIVIDAD
# ============================================================================

echo ""
log_section "═══════════════════════════════════════════════════════════════════"
log_section "3️⃣  VERIFICANDO INSTANCIA EC2"
log_section "═══════════════════════════════════════════════════════════════════"
echo ""

# Obtener ID de la instancia EC2
CONTAINER_INSTANCE_DETAILS=$(aws ecs describe-container-instances \
    --cluster $ECS_CLUSTER_NAME \
    --container-instances $CONTAINER_INSTANCE_ARN \
    --region $AWS_REGION)

EC2_INSTANCE_ID=$(echo $CONTAINER_INSTANCE_DETAILS | jq -r '.containerInstances[0].ec2InstanceId')

EC2_INFO=$(aws ec2 describe-instances \
    --instance-ids $EC2_INSTANCE_ID \
    --region $AWS_REGION)

PUBLIC_IP=$(echo $EC2_INFO | jq -r '.Reservations[0].Instances[0].PublicIpAddress // "N/A"')
PRIVATE_IP=$(echo $EC2_INFO | jq -r '.Reservations[0].Instances[0].PrivateIpAddress')
INSTANCE_STATE=$(echo $EC2_INFO | jq -r '.Reservations[0].Instances[0].State.Name')
SECURITY_GROUPS=$(echo $EC2_INFO | jq -r '.Reservations[0].Instances[0].SecurityGroups[].GroupId' | tr '\n' ' ')

echo "🖥️  Información de la Instancia:"
echo "   • Instance ID: $EC2_INSTANCE_ID"
echo "   • Estado: $INSTANCE_STATE"
echo "   • IP Privada: $PRIVATE_IP"
echo "   • IP Pública: $PUBLIC_IP"
echo "   • Security Groups: $SECURITY_GROUPS"
echo ""

if [ "$INSTANCE_STATE" != "running" ]; then
    log_error "La instancia no está en estado 'running'"
    exit 1
fi

# Probar conectividad directa si hay IP pública y puerto asignado
if [ "$PUBLIC_IP" != "N/A" ] && [ "$HOST_PORT" != "none" ]; then
    log_info "Probando conectividad directa a la aplicación..."
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://$PUBLIC_IP:$HOST_PORT/ 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "301" ] || [ "$HTTP_CODE" == "302" ]; then
        log_success "✓ Aplicación responde en http://$PUBLIC_IP:$HOST_PORT/ (HTTP $HTTP_CODE)"
    else
        log_error "✗ Aplicación NO responde en http://$PUBLIC_IP:$HOST_PORT/ (HTTP $HTTP_CODE)"
        log_warning "Esto indica que el contenedor no está escuchando correctamente"
    fi
fi

# ============================================================================
# 4. VERIFICAR SECURITY GROUPS
# ============================================================================

echo ""
log_section "═══════════════════════════════════════════════════════════════════"
log_section "4️⃣  VERIFICANDO SECURITY GROUPS"
log_section "═══════════════════════════════════════════════════════════════════"
echo ""

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

echo "🛡️  Security Groups:"
echo "   • ALB SG: $ALB_SG_ID"
echo "   • EC2 SG: $EC2_SG_ID"
echo ""

# Verificar reglas del EC2 SG
log_info "Verificando reglas de ingreso en EC2 SG..."

EC2_SG_RULES=$(aws ec2 describe-security-group-rules \
    --filters "Name=group-id,Values=$EC2_SG_ID" \
    --region $AWS_REGION)

# Verificar si permite tráfico desde ALB en puertos dinámicos
DYNAMIC_RULE=$(echo "$EC2_SG_RULES" | jq -r --arg ALB_SG "$ALB_SG_ID" \
    '.SecurityGroupRules[] | select(.IsEgress == false and .ReferencedGroupInfo.GroupId == $ALB_SG and .FromPort == 32768 and .ToPort == 65535)')

if [ -z "$DYNAMIC_RULE" ]; then
    log_error "✗ Falta regla para puertos dinámicos (32768-65535) desde ALB"
    log_warning "Esta es probablemente la causa del 503"
else
    log_success "✓ Regla de puertos dinámicos configurada correctamente"
fi

# ============================================================================
# 5. VERIFICAR LOGS DEL CONTENEDOR
# ============================================================================

echo ""
log_section "═══════════════════════════════════════════════════════════════════"
log_section "5️⃣  ÚLTIMOS LOGS DEL CONTENEDOR"
log_section "═══════════════════════════════════════════════════════════════════"
echo ""

LOG_GROUP="/ecs/${PROJECT_NAME}"

log_info "Obteniendo últimos logs de CloudWatch..."

# Obtener el stream más reciente
LATEST_STREAM=$(aws logs describe-log-streams \
    --log-group-name $LOG_GROUP \
    --order-by LastEventTime \
    --descending \
    --max-items 1 \
    --region $AWS_REGION \
    --query 'logStreams[0].logStreamName' \
    --output text 2>/dev/null)

if [ "$LATEST_STREAM" == "None" ] || [ -z "$LATEST_STREAM" ]; then
    log_warning "No se encontraron logs en CloudWatch"
else
    echo ""
    echo "📋 Últimas 20 líneas de log:"
    echo "────────────────────────────────────────────────────────────────"
    
    aws logs get-log-events \
        --log-group-name $LOG_GROUP \
        --log-stream-name $LATEST_STREAM \
        --limit 20 \
        --region $AWS_REGION \
        --query 'events[*].message' \
        --output text 2>/dev/null | tail -20
    
    echo "────────────────────────────────────────────────────────────────"
fi

# ============================================================================
# 6. VERIFICAR ALB
# ============================================================================

echo ""
log_section "═══════════════════════════════════════════════════════════════════"
log_section "6️⃣  VERIFICANDO APPLICATION LOAD BALANCER"
log_section "═══════════════════════════════════════════════════════════════════"
echo ""

ALB_NAME="${PROJECT_NAME}-alb"
ALB_INFO=$(aws elbv2 describe-load-balancers \
    --names $ALB_NAME \
    --region $AWS_REGION)

ALB_DNS=$(echo $ALB_INFO | jq -r '.LoadBalancers[0].DNSName')
ALB_STATE=$(echo $ALB_INFO | jq -r '.LoadBalancers[0].State.Code')
ALB_SCHEME=$(echo $ALB_INFO | jq -r '.LoadBalancers[0].Scheme')

echo "🌐 Información del ALB:"
echo "   • DNS: $ALB_DNS"
echo "   • Estado: $ALB_STATE"
echo "   • Scheme: $ALB_SCHEME"
echo ""

log_info "Probando conectividad al ALB..."
ALB_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 http://$ALB_DNS/ 2>/dev/null || echo "000")

echo "   • HTTP Response: $ALB_HTTP_CODE"

if [ "$ALB_HTTP_CODE" == "503" ]; then
    log_error "✗ ALB devuelve 503 - No hay targets healthy"
elif [ "$ALB_HTTP_CODE" == "200" ] || [ "$ALB_HTTP_CODE" == "301" ] || [ "$ALB_HTTP_CODE" == "302" ]; then
    log_success "✓ ALB responde correctamente"
fi

# ============================================================================
# RESUMEN Y DIAGNÓSTICO
# ============================================================================

echo ""
log_section "═══════════════════════════════════════════════════════════════════"
log_section "📊 RESUMEN DEL DIAGNÓSTICO"
log_section "═══════════════════════════════════════════════════════════════════"
echo ""

if [ "$HEALTHY_COUNT" -eq 0 ]; then
    log_error "PROBLEMA IDENTIFICADO: No hay targets healthy en el Target Group"
    echo ""
    echo "🔧 CAUSAS POSIBLES Y SOLUCIONES:"
    echo ""
    
    if [ -z "$DYNAMIC_RULE" ]; then
        echo "   1. ❌ Security Group no permite tráfico del ALB"
        echo "      Solución: Ejecuta el script de corrección para agregar la regla"
        echo ""
    fi
    
    if [ "$HEALTH_STATUS" == "UNHEALTHY" ]; then
        echo "   2. ❌ El health check del contenedor está fallando"
        echo "      • Verifica que tu app responda en GET $HC_PATH"
        echo "      • Verifica los logs para ver errores"
        echo ""
    fi
    
    if [ "$HOST_PORT" == "none" ]; then
        echo "   3. ❌ No se asignó puerto dinámico a la tarea"
        echo "      • Verifica la task definition (hostPort debe ser 0)"
        echo ""
    fi
    
    echo "   4. ⚠️  El contenedor puede no estar escuchando correctamente"
    echo "      • Revisa los logs de CloudWatch"
    echo "      • Verifica que PORT=$CONTAINER_PORT esté configurado"
    echo ""
    
elif [ "$HEALTHY_COUNT" -gt 0 ] && [ "$ALB_HTTP_CODE" == "503" ]; then
    log_warning "Situación inusual: Hay targets healthy pero el ALB devuelve 503"
    echo ""
    echo "   • Espera 30-60 segundos y vuelve a probar"
    echo "   • Puede ser un problema temporal de propagación"
    
else
    log_success "TODO PARECE ESTAR CORRECTO"
    echo ""
    echo "   ✓ Tareas ejecutándose: $RUNNING_COUNT"
    echo "   ✓ Targets healthy: $HEALTHY_COUNT"
    echo "   ✓ ALB respondiendo correctamente"
    echo ""
    echo "   🌐 URL: http://$ALB_DNS"
fi

echo ""
log_section "═══════════════════════════════════════════════════════════════════"
echo ""

# Información adicional
echo "📌 COMANDOS ÚTILES:"
echo ""
echo "# Ver logs en tiempo real:"
echo "aws logs tail /ecs/${PROJECT_NAME} --follow --region $AWS_REGION"
echo ""
echo "# Ver estado del servicio:"
echo "aws ecs describe-services --cluster $ECS_CLUSTER_NAME --services $ECS_SERVICE_NAME --region $AWS_REGION"
echo ""
echo "# Forzar nuevo despliegue:"
echo "aws ecs update-service --cluster $ECS_CLUSTER_NAME --service $ECS_SERVICE_NAME --force-new-deployment --region $AWS_REGION"
echo ""