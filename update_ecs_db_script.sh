#!/bin/bash

##############################################
# Script para Actualizar DATABASE_URL en ECS
# Actualiza la task definition con nueva DB
# Versión mejorada con mejor manejo de errores
##############################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

print_msg() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

##############################################
# CONFIGURACIÓN
##############################################

AWS_REGION="us-east-1"
APP_NAME="majestic-app"
ECS_CLUSTER_NAME="${APP_NAME}-cluster"
ECS_SERVICE_NAME="${APP_NAME}-service"
TASK_FAMILY="${APP_NAME}-task"
DB_INSTANCE_IDENTIFIER="health-app"

# Variables de entorno
PORT="5000"
NODE_ENV="production"
JWT_SECRET="a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
GOOGLE_CLIENT_ID="504338292423-nneklif626o8vj9n0o7btq03vjt49mqb.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="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"
OPENAI_API_KEY="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"
DIAG_TOKEN="9f2c3f6e8a4b5d17e6f9a0c2d8e4f7b1c6a3d5e8f9b2c1d4e7a9c0f2b4d6e8a1"
SKIP_DB_INIT="false"
SKIP_GLOBAL_JOBS="false"
ADMIN_EMAILS="jmzv13@gmail.com"

##############################################
# FUNCIONES
##############################################

get_rds_endpoint() {
    print_msg "Obteniendo endpoint de RDS..."
    
    DB_ENDPOINT=$(aws rds describe-db-instances \
        --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
        --region ${AWS_REGION} \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text 2>/dev/null)
    
    if [ -z "${DB_ENDPOINT}" ] || [ "${DB_ENDPOINT}" == "None" ]; then
        print_warning "No se pudo obtener endpoint automáticamente"
        read -p "Ingresa el endpoint de RDS manualmente: " DB_ENDPOINT
    else
        print_msg "Endpoint encontrado: ${DB_ENDPOINT}"
    fi
    
    # Construir DATABASE_URL
    read -p "Usuario de DB [majestic]: " DB_USER
    DB_USER=${DB_USER:-majestic}
    
    read -sp "Contraseña de DB: " DB_PASSWORD
    echo ""
    
    read -p "Nombre de DB [health_app]: " DB_NAME
    DB_NAME=${DB_NAME:-health_app}
    
    read -p "Puerto [5432]: " DB_PORT
    DB_PORT=${DB_PORT:-5432}
    
    DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_ENDPOINT}:${DB_PORT}/${DB_NAME}"
    
    echo ""
    print_msg "DATABASE_URL configurada"
}

check_resources_exist() {
    print_msg "Verificando recursos de AWS..."
    
    # Verificar cluster
    if ! aws ecs describe-clusters \
        --clusters ${ECS_CLUSTER_NAME} \
        --region ${AWS_REGION} \
        --query 'clusters[0].clusterName' \
        --output text 2>/dev/null | grep -q "${ECS_CLUSTER_NAME}"; then
        print_error "Cluster ${ECS_CLUSTER_NAME} no encontrado"
        return 1
    fi
    print_msg "✓ Cluster encontrado"
    
    # Verificar servicio
    if ! aws ecs describe-services \
        --cluster ${ECS_CLUSTER_NAME} \
        --services ${ECS_SERVICE_NAME} \
        --region ${AWS_REGION} \
        --query 'services[0].serviceName' \
        --output text 2>/dev/null | grep -q "${ECS_SERVICE_NAME}"; then
        print_error "Servicio ${ECS_SERVICE_NAME} no encontrado"
        return 1
    fi
    print_msg "✓ Servicio encontrado"
    
    return 0
}

get_current_task_definition() {
    print_msg "Buscando task definition actual..."
    
    # Intentar obtener la task definition actual del servicio
    CURRENT_TASK_DEF=$(aws ecs describe-services \
        --cluster ${ECS_CLUSTER_NAME} \
        --services ${ECS_SERVICE_NAME} \
        --region ${AWS_REGION} \
        --query 'services[0].taskDefinition' \
        --output text 2>/dev/null)
    
    if [ ! -z "${CURRENT_TASK_DEF}" ] && [ "${CURRENT_TASK_DEF}" != "None" ]; then
        print_msg "Task definition actual del servicio: ${CURRENT_TASK_DEF}"
        
        # Obtener detalles completos
        aws ecs describe-task-definition \
            --task-definition ${CURRENT_TASK_DEF} \
            --region ${AWS_REGION} \
            --query 'taskDefinition' > current-task-def.json 2>/dev/null
        
        print_msg "Task definition obtenida exitosamente"
        return 0
    fi
    
    # Si no hay task definition en el servicio, intentar buscar por familia
    print_warning "No se encontró task definition activa en el servicio"
    
    LATEST_TASK_DEF=$(aws ecs list-task-definitions \
        --family-prefix ${TASK_FAMILY} \
        --region ${AWS_REGION} \
        --sort DESC \
        --max-items 1 \
        --query 'taskDefinitionArns[0]' \
        --output text 2>/dev/null)
    
    if [ ! -z "${LATEST_TASK_DEF}" ] && [ "${LATEST_TASK_DEF}" != "None" ]; then
        print_msg "Task definition encontrada por familia: ${LATEST_TASK_DEF}"
        
        aws ecs describe-task-definition \
            --task-definition ${LATEST_TASK_DEF} \
            --region ${AWS_REGION} \
            --query 'taskDefinition' > current-task-def.json 2>/dev/null
        
        print_msg "Task definition obtenida exitosamente"
        return 0
    fi
    
    print_warning "No se encontró ninguna task definition existente"
    print_msg "Se creará una nueva task definition desde cero"
    return 1
}

get_ecr_image() {
    print_msg "Obteniendo imagen ECR..."
    
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    ECR_REPO_NAME="${APP_NAME}-repo"
    
    # Verificar si el repositorio existe
    if ! aws ecr describe-repositories \
        --repository-names ${ECR_REPO_NAME} \
        --region ${AWS_REGION} >/dev/null 2>&1; then
        print_error "Repositorio ECR ${ECR_REPO_NAME} no encontrado"
        read -p "Ingresa la URI de la imagen completa: " ECR_URI
    else
        ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:latest"
        print_msg "Imagen: ${ECR_URI}"
    fi
}

get_execution_role() {
    print_msg "Obteniendo Execution Role ARN..."
    
    TASK_EXECUTION_ROLE_NAME="${APP_NAME}-task-execution-role"
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    TASK_EXECUTION_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${TASK_EXECUTION_ROLE_NAME}"
    
    # Verificar si el rol existe
    if ! aws iam get-role --role-name ${TASK_EXECUTION_ROLE_NAME} >/dev/null 2>&1; then
        print_warning "Rol ${TASK_EXECUTION_ROLE_NAME} no encontrado"
        read -p "Ingresa el ARN del execution role: " TASK_EXECUTION_ROLE_ARN
    else
        print_msg "Execution Role: ${TASK_EXECUTION_ROLE_ARN}"
    fi
}

create_log_group() {
    print_msg "Verificando log group..."
    
    LOG_GROUP="/ecs/${APP_NAME}"
    
    if ! aws logs describe-log-groups \
        --log-group-name-prefix ${LOG_GROUP} \
        --region ${AWS_REGION} \
        --query "logGroups[?logGroupName=='${LOG_GROUP}'].logGroupName" \
        --output text 2>/dev/null | grep -q "${LOG_GROUP}"; then
        
        print_msg "Creando log group ${LOG_GROUP}..."
        aws logs create-log-group \
            --log-group-name ${LOG_GROUP} \
            --region ${AWS_REGION} 2>/dev/null || true
    fi
    
    print_msg "✓ Log group listo"
}

create_updated_task_definition() {
    print_msg "Creando nueva task definition con DATABASE_URL actualizada..."
    
    cat > updated-task-definition.json <<EOF
{
  "family": "${TASK_FAMILY}",
  "networkMode": "bridge",
  "requiresCompatibilities": ["EC2"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "${TASK_EXECUTION_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "${APP_NAME}",
      "image": "${ECR_URI}",
      "cpu": 256,
      "memory": 512,
      "essential": true,
      "portMappings": [
        {
          "containerPort": ${PORT},
          "hostPort": ${PORT},
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "PORT", "value": "${PORT}"},
        {"name": "NODE_ENV", "value": "${NODE_ENV}"},
        {"name": "DATABASE_URL", "value": "${DATABASE_URL}"},
        {"name": "JWT_SECRET", "value": "${JWT_SECRET}"},
        {"name": "GOOGLE_CLIENT_ID", "value": "${GOOGLE_CLIENT_ID}"},
        {"name": "GOOGLE_CLIENT_SECRET", "value": "${GOOGLE_CLIENT_SECRET}"},
        {"name": "OPENAI_API_KEY", "value": "${OPENAI_API_KEY}"},
        {"name": "DIAG_TOKEN", "value": "${DIAG_TOKEN}"},
        {"name": "SKIP_DB_INIT", "value": "${SKIP_DB_INIT}"},
        {"name": "SKIP_GLOBAL_JOBS", "value": "${SKIP_GLOBAL_JOBS}"},
        {"name": "ADMIN_EMAILS", "value": "${ADMIN_EMAILS}"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${APP_NAME}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
EOF
    
    print_msg "Task definition creada en updated-task-definition.json"
}

register_task_definition() {
    print_msg "Registrando nueva task definition..."
    
    NEW_TASK_DEF_ARN=$(aws ecs register-task-definition \
        --cli-input-json file://updated-task-definition.json \
        --region ${AWS_REGION} \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)
    
    if [ -z "${NEW_TASK_DEF_ARN}" ]; then
        print_error "Error al registrar task definition"
        return 1
    fi
    
    print_msg "Nueva task definition registrada: ${NEW_TASK_DEF_ARN}"
}

update_ecs_service() {
    print_msg "Actualizando servicio ECS..."
    
    aws ecs update-service \
        --cluster ${ECS_CLUSTER_NAME} \
        --service ${ECS_SERVICE_NAME} \
        --task-definition ${TASK_FAMILY} \
        --region ${AWS_REGION} \
        --force-new-deployment > /dev/null
    
    print_msg "Servicio actualizado. Iniciando nuevo deployment..."
}

wait_for_deployment() {
    print_msg "Esperando a que el deployment se complete..."
    echo "Esto puede tardar varios minutos..."
    
    aws ecs wait services-stable \
        --cluster ${ECS_CLUSTER_NAME} \
        --services ${ECS_SERVICE_NAME} \
        --region ${AWS_REGION}
    
    print_msg "Deployment completado exitosamente"
}

cleanup() {
    print_msg "Limpiando archivos temporales..."
    rm -f current-task-def.json updated-task-definition.json
}

##############################################
# MAIN
##############################################

main() {
    echo ""
    echo "=========================================="
    echo "  Actualizar DATABASE_URL en ECS"
    echo "=========================================="
    echo ""
    
    # Verificar recursos
    if ! check_resources_exist; then
        print_error "Faltan recursos necesarios en AWS"
        exit 1
    fi
    
    # Paso 1: Obtener información de RDS
    get_rds_endpoint
    
    # Paso 2: Obtener configuración actual
    get_current_task_definition || true
    get_ecr_image
    get_execution_role
    create_log_group
    
    # Paso 3: Crear nueva task definition
    create_updated_task_definition
    
    # Confirmar antes de continuar
    echo ""
    print_warning "¿Deseas continuar con la actualización?"
    echo "  - Se registrará una nueva task definition"
    echo "  - Se actualizará el servicio ECS con force-new-deployment"
    read -p "Continuar? (y/n): " CONFIRM
    
    if [ "${CONFIRM}" != "y" ]; then
        print_msg "Operación cancelada"
        cleanup
        exit 0
    fi
    
    # Paso 4: Registrar y actualizar
    register_task_definition
    update_ecs_service
    
    # Paso 5: Esperar deployment
    echo ""
    read -p "¿Deseas esperar a que el deployment se complete? (y/n): " WAIT_DEPLOYMENT
    if [ "${WAIT_DEPLOYMENT}" == "y" ]; then
        wait_for_deployment
    else
        print_msg "Puedes monitorear el deployment en la consola de AWS ECS"
    fi
    
    # Paso 6: Cleanup
    cleanup
    
    echo ""
    echo "=========================================="
    print_msg "✓ DATABASE_URL actualizada exitosamente"
    echo "=========================================="
    echo ""
    print_msg "Siguientes pasos:"
    echo "  1. Verifica los logs en CloudWatch: /ecs/${APP_NAME}"
    echo "  2. Verifica la salud del servicio en ECS console"
    echo "  3. Prueba la conexión a la base de datos"
    echo ""
}

# Manejo de errores
trap 'print_error "Script interrumpido"; cleanup; exit 1' INT TERM

# Ejecutar script
main