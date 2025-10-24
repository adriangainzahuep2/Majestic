#!/bin/bash

##############################################
# Script de Despliegue Completo Majestic
# AWS ECS + EC2 + RDS + Inicialización Automática
##############################################

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_msg() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_success() { echo -e "${BLUE}[SUCCESS]${NC} $1"; }

##############################################
# CONFIGURACIÓN
##############################################

AWS_REGION="us-east-1"
APP_NAME="majestic-app"
CLUSTER_NAME="${APP_NAME}-cluster"
SERVICE_NAME="${APP_NAME}-service"
TASK_FAMILY="${APP_NAME}-task"

# Repositorio GitHub
GITHUB_REPO="https://github.com/dillis1/Majestic.git"
GITHUB_BRANCH="main"

# ECR
ECR_REPO_NAME="${APP_NAME}"
IMAGE_TAG="latest"

# RDS
DB_INSTANCE_IDENTIFIER="health-app"
DB_NAME="health_app"
DB_USERNAME="majestic"
DB_PASSWORD="simple123"  # CAMBIAR EN PRODUCCIÓN
DB_PORT="5432"
DB_INSTANCE_CLASS="db.t3.micro"
ALLOCATED_STORAGE="20"
ENGINE_VERSION="15.8"

# EC2
INSTANCE_TYPE="t3.small"
KEY_PAIR_NAME="ecs-keypair"
DESIRED_COUNT=1

# Variables de entorno de la aplicación
PORT=5000
NODE_ENV="production"
JWT_SECRET="a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
GOOGLE_CLIENT_ID="504338292423-nneklif626o8vj9n0o7btq03vjt49mqb.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="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"
OPENAI_API_KEY="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"
DIAG_TOKEN="9f2c3f6e8a4b5d17e6f9a0c2d8e4f7b1c6a3d5e8f9b2c1d4e7a9c0f2b4d6e8a1"
SKIP_DB_INIT="false"
SKIP_GLOBAL_JOBS="false"
ADMIN_EMAILS="jmzv13@gmail.com"

# Paths
WORK_DIR="/tmp/${APP_NAME}-deploy"
LOG_FILE="${WORK_DIR}/deployment.log"

##############################################
# FUNCIONES
##############################################


check_prerequisites() {
    print_msg "Verificando prerequisitos..."
    
    for cmd in aws docker git jq curl; do
        if ! command -v $cmd &> /dev/null; then
            print_error "$cmd no está instalado"
            exit 1
        fi
    done
    
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    print_msg "AWS Account ID: ${ACCOUNT_ID}"
}

clone_repository() {
    print_msg "Clonando repositorio desde GitHub..."
    cd "${WORK_DIR}"
    
    git clone -b "${GITHUB_BRANCH}" "${GITHUB_REPO}"
    cd Majestic
    
    print_success "Repositorio clonado exitosamente"
}


get_or_create_vpc() {
    print_msg "Obteniendo información de VPC..."
    
    VPC_ID=$(aws ec2 describe-vpcs \
        --filters "Name=isDefault,Values=true" \
        --query "Vpcs[0].VpcId" \
        --output text \
        --region ${AWS_REGION})
    
    if [ -z "${VPC_ID}" ] || [ "${VPC_ID}" == "None" ]; then
        print_error "No se encontró VPC por defecto"
        exit 1
    fi
    
    print_msg "VPC ID: ${VPC_ID}"
    
    SUBNET_IDS=$(aws ec2 describe-subnets \
        --filters "Name=vpc-id,Values=${VPC_ID}" \
        --query "Subnets[*].SubnetId" \
        --output text \
        --region ${AWS_REGION})
    
    SUBNET_ARRAY=(${SUBNET_IDS})
    print_msg "Subnets: ${SUBNET_IDS}"
}

create_security_groups() {
    print_msg "Creando Security Groups..."
    
    # Security Group para ECS
    ECS_SG_ID=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=${APP_NAME}-ecs-sg" \
        --query "SecurityGroups[0].GroupId" \
        --output text \
        --region ${AWS_REGION} 2>/dev/null)
    
    if [ "${ECS_SG_ID}" == "None" ] || [ -z "${ECS_SG_ID}" ]; then
        ECS_SG_ID=$(aws ec2 create-security-group \
            --group-name ${APP_NAME}-ecs-sg \
            --description "Security group for ${APP_NAME} ECS" \
            --vpc-id ${VPC_ID} \
            --region ${AWS_REGION} \
            --query 'GroupId' \
            --output text)
        
        aws ec2 authorize-security-group-ingress \
            --group-id ${ECS_SG_ID} \
            --protocol tcp \
            --port 5000 \
            --cidr 0.0.0.0/0 \
            --region ${AWS_REGION}
        
        aws ec2 authorize-security-group-ingress \
            --group-id ${ECS_SG_ID} \
            --protocol tcp \
            --port 22 \
            --cidr 0.0.0.0/0 \
            --region ${AWS_REGION}
        
        print_msg "ECS Security Group creado: ${ECS_SG_ID}"
    else
        print_msg "ECS Security Group existente: ${ECS_SG_ID}"
    fi
    
    # Security Group para RDS
    RDS_SG_ID=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=${APP_NAME}-rds-sg" \
        --query "SecurityGroups[0].GroupId" \
        --output text \
        --region ${AWS_REGION} 2>/dev/null)
    
    if [ "${RDS_SG_ID}" == "None" ] || [ -z "${RDS_SG_ID}" ]; then
        RDS_SG_ID=$(aws ec2 create-security-group \
            --group-name ${APP_NAME}-rds-sg \
            --description "Security group for ${APP_NAME} RDS" \
            --vpc-id ${VPC_ID} \
            --region ${AWS_REGION} \
            --query 'GroupId' \
            --output text)
        
        aws ec2 authorize-security-group-ingress \
            --group-id ${RDS_SG_ID} \
            --protocol tcp \
            --port ${DB_PORT} \
            --source-group ${ECS_SG_ID} \
            --region ${AWS_REGION}
        
        print_msg "RDS Security Group creado: ${RDS_SG_ID}"
    else
        print_msg "RDS Security Group existente: ${RDS_SG_ID}"
    fi
}

create_rds_subnet_group() {
    print_msg "Creando DB Subnet Group..."
    
    if aws rds describe-db-subnet-groups \
        --db-subnet-group-name ${APP_NAME}-db-subnet-group \
        --region ${AWS_REGION} &>/dev/null; then
        print_msg "DB Subnet Group ya existe"
        return
    fi
    
    aws rds create-db-subnet-group \
        --db-subnet-group-name ${APP_NAME}-db-subnet-group \
        --db-subnet-group-description "Subnet group for ${APP_NAME} RDS" \
        --subnet-ids ${SUBNET_IDS} \
        --region ${AWS_REGION}
    
    print_success "DB Subnet Group creado"
}

create_rds_instance() {
    print_msg "Creando instancia RDS PostgreSQL..."
    
    # Verificar si la instancia ya existe
    if aws rds describe-db-instances \
        --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
        --region ${AWS_REGION} &>/dev/null; then
        
        print_msg "Instancia RDS ya existe - verificando estado..."
        
        # Obtener estado actual
        CURRENT_STATUS=$(aws rds describe-db-instances \
            --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
            --region ${AWS_REGION} \
            --query 'DBInstances[0].DBInstanceStatus' \
            --output text)
        
        print_msg "Estado actual de RDS: ${CURRENT_STATUS}"
        
        # Si está disponible, obtener endpoint y retornar
        if [ "${CURRENT_STATUS}" == "available" ]; then
            DB_ENDPOINT=$(aws rds describe-db-instances \
                --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
                --region ${AWS_REGION} \
                --query 'DBInstances[0].Endpoint.Address' \
                --output text)
            
            print_success "RDS ya está disponible en: ${DB_ENDPOINT}"
            return 0
        fi
        
        # Si está en proceso de creación, esperar
        if [ "${CURRENT_STATUS}" == "creating" ] || [ "${CURRENT_STATUS}" == "backing-up" ] || [ "${CURRENT_STATUS}" == "modifying" ]; then
            print_msg "La instancia está en estado '${CURRENT_STATUS}'. Esperando..."
        else
            print_error "La instancia existe pero está en estado inesperado: ${CURRENT_STATUS}"
            return 1
        fi
    else
        # Crear nueva instancia RDS
        print_msg "Iniciando creación de nueva instancia RDS..."
        
        if ! aws rds create-db-instance \
            --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
            --db-instance-class ${DB_INSTANCE_CLASS} \
            --engine postgres \
            --engine-version ${ENGINE_VERSION} \
            --master-username ${DB_USERNAME} \
            --master-user-password ${DB_PASSWORD} \
            --allocated-storage ${ALLOCATED_STORAGE} \
            --db-name ${DB_NAME} \
            --vpc-security-group-ids ${RDS_SG_ID} \
            --db-subnet-group-name ${APP_NAME}-db-subnet-group \
            --backup-retention-period 7 \
            --publicly-accessible false \
            --storage-type gp3 \
            --storage-encrypted \
            --region ${AWS_REGION} 2>&1 | tee -a ${LOG_FILE}; then
            
            print_error "Error al crear la instancia RDS"
            return 1
        fi
        
        print_success "Comando de creación ejecutado exitosamente"
    fi
    
    # Monitoreo periódico con información detallada
    print_msg "=========================================="
    print_msg "Monitoreando creación de instancia RDS..."
    print_msg "Esto puede tomar entre 5-15 minutos"
    print_msg "=========================================="
    
    local MAX_WAIT_TIME=1200  # 20 minutos máximo
    local CHECK_INTERVAL=20    # Revisar cada 20 segundos
    local ELAPSED=0
    local LAST_STATUS=""
    local LAST_PROGRESS=""
    local CREATION_START_TIME=$(date +%s)
    
    while [ ${ELAPSED} -lt ${MAX_WAIT_TIME} ]; do
        # Obtener información detallada de la instancia
        local RDS_INFO=$(aws rds describe-db-instances \
            --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
            --region ${AWS_REGION} \
            --query 'DBInstances[0]' \
            --output json 2>/dev/null)
        
        if [ $? -ne 0 ] || [ -z "${RDS_INFO}" ]; then
            print_warning "No se pudo obtener información de la instancia. Reintentando..."
            sleep ${CHECK_INTERVAL}
            ELAPSED=$((ELAPSED + CHECK_INTERVAL))
            continue
        fi
        
        # Extraer información relevante
        local CURRENT_STATUS=$(echo "${RDS_INFO}" | jq -r '.DBInstanceStatus // "unknown"')
        local PERCENT_PROGRESS=$(echo "${RDS_INFO}" | jq -r '.PercentProgress // "N/A"')
        local PENDING_VALUES=$(echo "${RDS_INFO}" | jq -r '.PendingModifiedValues // empty')
        local AVAILABILITY_ZONE=$(echo "${RDS_INFO}" | jq -r '.AvailabilityZone // "N/A"')
        
        # Calcular tiempo transcurrido
        local CURRENT_TIME=$(date +%s)
        local TIME_ELAPSED=$((CURRENT_TIME - CREATION_START_TIME))
        local MINUTES_ELAPSED=$((TIME_ELAPSED / 60))
        local SECONDS_ELAPSED=$((TIME_ELAPSED % 60))
        
        # Mostrar progreso solo si cambió el estado
        if [ "${CURRENT_STATUS}" != "${LAST_STATUS}" ] || [ "${PERCENT_PROGRESS}" != "${LAST_PROGRESS}" ]; then
            echo ""
            print_msg "Tiempo transcurrido: ${MINUTES_ELAPSED}m ${SECONDS_ELAPSED}s"
            print_msg "Estado: ${CURRENT_STATUS}"
            
            if [ "${PERCENT_PROGRESS}" != "N/A" ] && [ "${PERCENT_PROGRESS}" != "null" ]; then
                print_msg "Progreso: ${PERCENT_PROGRESS}%"
            fi
            
            if [ "${AVAILABILITY_ZONE}" != "N/A" ]; then
                print_msg "Zona de disponibilidad: ${AVAILABILITY_ZONE}"
            fi
            
            if [ -n "${PENDING_VALUES}" ] && [ "${PENDING_VALUES}" != "null" ]; then
                print_msg "Modificaciones pendientes detectadas"
            fi
            
            LAST_STATUS="${CURRENT_STATUS}"
            LAST_PROGRESS="${PERCENT_PROGRESS}"
        else
            # Mostrar indicador de progreso sin repetir info
            echo -n "."
        fi
        
        # Verificar estados
        case "${CURRENT_STATUS}" in
            "available")
                echo ""
                print_success "✅ Instancia RDS disponible!"
                
                # Obtener endpoint
                DB_ENDPOINT=$(echo "${RDS_INFO}" | jq -r '.Endpoint.Address // "N/A"')
                DB_PORT=$(echo "${RDS_INFO}" | jq -r '.Endpoint.Port // 5432')
                
                if [ "${DB_ENDPOINT}" == "N/A" ] || [ -z "${DB_ENDPOINT}" ]; then
                    print_error "No se pudo obtener el endpoint de la instancia"
                    return 1
                fi
                
                print_success "RDS Endpoint: ${DB_ENDPOINT}:${DB_PORT}"
                
                # Verificar conectividad básica (sin intentar conectar)
                print_msg "Verificando resolución DNS del endpoint..."
                if host "${DB_ENDPOINT}" > /dev/null 2>&1; then
                    print_success "✅ Endpoint es resoluble via DNS"
                else
                    print_warning "⚠️  El endpoint aún no resuelve via DNS (puede tardar unos segundos más)"
                fi
                
                # Información adicional útil
                echo ""
                print_msg "=========================================="
                print_msg "Información de la instancia RDS:"
                print_msg "=========================================="
                print_msg "Instance ID: ${DB_INSTANCE_IDENTIFIER}"
                print_msg "Instance Class: ${DB_INSTANCE_CLASS}"
                print_msg "Engine: PostgreSQL ${ENGINE_VERSION}"
                print_msg "Database Name: ${DB_NAME}"
                print_msg "Master Username: ${DB_USERNAME}"
                print_msg "Endpoint: ${DB_ENDPOINT}:${DB_PORT}"
                print_msg "Storage: ${ALLOCATED_STORAGE} GB (gp3, encrypted)"
                print_msg "Backup Retention: 7 days"
                print_msg "Multi-AZ: false"
                print_msg "Publicly Accessible: false"
                print_msg "=========================================="
                
                return 0
                ;;
            
            "creating"|"backing-up"|"modifying"|"configuring-enhanced-monitoring")
                # Estados normales durante la creación - continuar esperando
                ;;
            
            "failed"|"deleting"|"inaccessible-encryption-credentials")
                echo ""
                print_error "❌ La instancia RDS entró en estado de error: ${CURRENT_STATUS}"
                
                # Intentar obtener más detalles del error
                local STATUS_INFO=$(aws rds describe-db-instances \
                    --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
                    --region ${AWS_REGION} \
                    --query 'DBInstances[0].StatusInfos' \
                    --output json 2>/dev/null)
                
                if [ -n "${STATUS_INFO}" ] && [ "${STATUS_INFO}" != "null" ] && [ "${STATUS_INFO}" != "[]" ]; then
                    print_error "Información adicional del error:"
                    echo "${STATUS_INFO}" | jq '.' || echo "${STATUS_INFO}"
                fi
                
                return 1
                ;;
            
            *)
                print_warning "Estado inesperado: ${CURRENT_STATUS}"
                ;;
        esac
        
        sleep ${CHECK_INTERVAL}
        ELAPSED=$((ELAPSED + CHECK_INTERVAL))
    done
    
    # Timeout
    echo ""
    print_error "⏱️  Timeout: La instancia RDS no estuvo disponible después de ${MAX_WAIT_TIME} segundos"
    print_error "Estado final: ${CURRENT_STATUS}"
    print_msg "Puedes continuar monitoreando con:"
    print_msg "  aws rds describe-db-instances --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} --region ${AWS_REGION}"
    
    return 1
}

create_ecr_repository() {
    print_msg "Creando repositorio ECR..."
    
    if aws ecr describe-repositories \
        --repository-names ${ECR_REPO_NAME} \
        --region ${AWS_REGION} &>/dev/null; then
        print_msg "Repositorio ECR ya existe"
    else
        aws ecr create-repository \
            --repository-name ${ECR_REPO_NAME} \
            --region ${AWS_REGION}
        print_success "Repositorio ECR creado"
    fi
    
    ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"
}

build_and_push_image() {
    print_msg "Construyendo y subiendo imagen Docker..."
    
    cd "${WORK_DIR}/Majestic"
    
    # Login a ECR
    aws ecr get-login-password --region ${AWS_REGION} | \
        docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
    
    # Build de la imagen
    docker build -t ${ECR_REPO_NAME}:${IMAGE_TAG} .
    
    # Tag de la imagen
    docker tag ${ECR_REPO_NAME}:${IMAGE_TAG} ${ECR_URI}:${IMAGE_TAG}
    
    # Push a ECR
    docker push ${ECR_URI}:${IMAGE_TAG}
    
    print_success "Imagen subida a ECR: ${ECR_URI}:${IMAGE_TAG}"
}

create_iam_roles() {
    print_msg "Creando roles IAM..."
    
    # Execution Role
    EXECUTION_ROLE_NAME="${APP_NAME}-execution-role"
    
    if aws iam get-role --role-name ${EXECUTION_ROLE_NAME} &>/dev/null; then
        print_msg "Execution Role ya existe"
    else
        aws iam create-role \
            --role-name ${EXECUTION_ROLE_NAME} \
            --assume-role-policy-document '{
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"Service": "ecs-tasks.amazonaws.com"},
                    "Action": "sts:AssumeRole"
                }]
            }'
        
        aws iam attach-role-policy \
            --role-name ${EXECUTION_ROLE_NAME} \
            --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
        
        print_success "Execution Role creado"
    fi
    
    EXECUTION_ROLE_ARN=$(aws iam get-role \
        --role-name ${EXECUTION_ROLE_NAME} \
        --query 'Role.Arn' \
        --output text)
    
    # Task Role
    TASK_ROLE_NAME="${APP_NAME}-task-role"
    
    if aws iam get-role --role-name ${TASK_ROLE_NAME} &>/dev/null; then
        print_msg "Task Role ya existe"
    else
        aws iam create-role \
            --role-name ${TASK_ROLE_NAME} \
            --assume-role-policy-document '{
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"Service": "ecs-tasks.amazonaws.com"},
                    "Action": "sts:AssumeRole"
                }]
            }'
        
        print_success "Task Role creado"
    fi
    
    TASK_ROLE_ARN=$(aws iam get-role \
        --role-name ${TASK_ROLE_NAME} \
        --query 'Role.Arn' \
        --output text)
    
    # EC2 Instance Role
    EC2_ROLE_NAME="${APP_NAME}-ec2-role"
    
    if aws iam get-role --role-name ${EC2_ROLE_NAME} &>/dev/null; then
        print_msg "EC2 Role ya existe"
    else
        aws iam create-role \
            --role-name ${EC2_ROLE_NAME} \
            --assume-role-policy-document '{
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"Service": "ec2.amazonaws.com"},
                    "Action": "sts:AssumeRole"
                }]
            }'
        
        aws iam attach-role-policy \
            --role-name ${EC2_ROLE_NAME} \
            --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role
        
        print_success "EC2 Role creado"
    fi
    
    # Instance Profile
    if aws iam get-instance-profile --instance-profile-name ${EC2_ROLE_NAME} &>/dev/null; then
        print_msg "Instance Profile ya existe"
    else
        aws iam create-instance-profile --instance-profile-name ${EC2_ROLE_NAME}
        aws iam add-role-to-instance-profile \
            --instance-profile-name ${EC2_ROLE_NAME} \
            --role-name ${EC2_ROLE_NAME}
        
        sleep 10
        print_success "Instance Profile creado"
    fi
}

create_ecs_cluster() {
    print_msg "Creando cluster ECS..."
    
    if aws ecs describe-clusters \
        --clusters ${CLUSTER_NAME} \
        --region ${AWS_REGION} \
        --query 'clusters[0].status' \
        --output text 2>/dev/null | grep -q "ACTIVE"; then
        print_msg "Cluster ECS ya existe"
    else
        aws ecs create-cluster \
            --cluster-name ${CLUSTER_NAME} \
            --region ${AWS_REGION}
        
        print_success "Cluster ECS creado: ${CLUSTER_NAME}"
    fi
}

launch_ec2_instance() {
    print_msg "Lanzando instancia EC2 para ECS..."
    
    # Obtener AMI optimizada para ECS
    ECS_AMI=$(aws ssm get-parameters \
        --names /aws/service/ecs/optimized-ami/amazon-linux-2/recommended/image_id \
        --region ${AWS_REGION} \
        --query 'Parameters[0].Value' \
        --output text)
    
    print_msg "AMI ECS: ${ECS_AMI}"
    
    # User data para configurar ECS
    USER_DATA=$(cat <<EOF
#!/bin/bash
echo ECS_CLUSTER=${CLUSTER_NAME} >> /etc/ecs/ecs.config
echo ECS_ENABLE_TASK_IAM_ROLE=true >> /etc/ecs/ecs.config
echo ECS_ENABLE_TASK_IAM_ROLE_NETWORK_HOST=true >> /etc/ecs/ecs.config
EOF
)
    
    # Lanzar instancia
    INSTANCE_ID=$(aws ec2 run-instances \
        --image-id ${ECS_AMI} \
        --instance-type ${INSTANCE_TYPE} \
        --key-name ${KEY_PAIR_NAME} \
        --security-group-ids ${ECS_SG_ID} \
        --iam-instance-profile Name=${EC2_ROLE_NAME} \
        --user-data "${USER_DATA}" \
        --subnet-id ${SUBNET_ARRAY[0]} \
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${APP_NAME}-ecs-instance}]" \
        --region ${AWS_REGION} \
        --query 'Instances[0].InstanceId' \
        --output text)
    
    print_msg "Instancia EC2 lanzada: ${INSTANCE_ID}"
    
    # Esperar a que esté corriendo
    print_msg "Esperando que la instancia esté corriendo..."
    aws ec2 wait instance-running \
        --instance-ids ${INSTANCE_ID} \
        --region ${AWS_REGION}
    
    # Obtener IP pública
    PUBLIC_IP=$(aws ec2 describe-instances \
        --instance-ids ${INSTANCE_ID} \
        --region ${AWS_REGION} \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text)
    
    print_success "Instancia corriendo - IP pública: ${PUBLIC_IP}"
    
    # Esperar a que se registre en el cluster
    print_msg "Esperando que la instancia se registre en el cluster..."
    sleep 60
}

register_task_definition() {
    print_msg "Registrando Task Definition..."
    
    DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_ENDPOINT}:${DB_PORT}/${DB_NAME}"
    
    cat > ${WORK_DIR}/task-definition.json <<EOF
{
  "family": "${TASK_FAMILY}",
  "networkMode": "bridge",
  "requiresCompatibilities": ["EC2"],
  "executionRoleArn": "${EXECUTION_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "${APP_NAME}",
      "image": "${ECR_URI}:${IMAGE_TAG}",
      "memory": 512,
      "cpu": 256,
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
        {"name": "JWT_SECRET", "value": "${JWT_SECRET}"},
        {"name": "GOOGLE_CLIENT_ID", "value": "${GOOGLE_CLIENT_ID}"},
        {"name": "GOOGLE_CLIENT_SECRET", "value": "${GOOGLE_CLIENT_SECRET}"},
        {"name": "OPENAI_API_KEY", "value": "${OPENAI_API_KEY}"},
        {"name": "DIAG_TOKEN", "value": "${DIAG_TOKEN}"},
        {"name": "SKIP_DB_INIT", "value": "${SKIP_DB_INIT}"},
        {"name": "SKIP_GLOBAL_JOBS", "value": "${SKIP_GLOBAL_JOBS}"},
        {"name": "ADMIN_EMAILS", "value": "${ADMIN_EMAILS}"},
        {"name": "DATABASE_URL", "value": "${DATABASE_URL}"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${APP_NAME}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:${PORT}/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
EOF
    
    aws ecs register-task-definition \
        --cli-input-json file://${WORK_DIR}/task-definition.json \
        --region ${AWS_REGION}
    
    print_success "Task Definition registrada"
}

create_ecs_service() {
    print_msg "Creando servicio ECS..."
    
    if aws ecs describe-services \
        --cluster ${CLUSTER_NAME} \
        --services ${SERVICE_NAME} \
        --region ${AWS_REGION} \
        --query 'services[0].status' \
        --output text 2>/dev/null | grep -q "ACTIVE"; then
        
        print_msg "Servicio ya existe, actualizando..."
        aws ecs update-service \
            --cluster ${CLUSTER_NAME} \
            --service ${SERVICE_NAME} \
            --force-new-deployment \
            --region ${AWS_REGION}
    else
        aws ecs create-service \
            --cluster ${CLUSTER_NAME} \
            --service-name ${SERVICE_NAME} \
            --task-definition ${TASK_FAMILY} \
            --desired-count ${DESIRED_COUNT} \
            --launch-type EC2 \
            --scheduling-strategy REPLICA \
            --region ${AWS_REGION}
        
        print_success "Servicio ECS creado: ${SERVICE_NAME}"
    fi
}

wait_for_service() {
    print_msg "Esperando que el servicio esté estable..."
    
    MAX_ATTEMPTS=30
    ATTEMPT=0
    
    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        RUNNING_COUNT=$(aws ecs describe-services \
            --cluster ${CLUSTER_NAME} \
            --services ${SERVICE_NAME} \
            --region ${AWS_REGION} \
            --query 'services[0].runningCount' \
            --output text)
        
        if [ "$RUNNING_COUNT" -ge "$DESIRED_COUNT" ]; then
            print_success "Servicio estable con ${RUNNING_COUNT} tareas corriendo"
            return 0
        fi
        
        print_msg "Tareas corriendo: ${RUNNING_COUNT}/${DESIRED_COUNT} (intento $((ATTEMPT + 1))/${MAX_ATTEMPTS})"
        sleep 10
        ATTEMPT=$((ATTEMPT + 1))
    done
    
    print_warning "El servicio no se estabilizó en el tiempo esperado"
}

test_application() {
    print_msg "Probando aplicación..."
    
    # Esperar un poco más para que la aplicación inicie completamente
    sleep 30
    
    HEALTH_URL="http://${PUBLIC_IP}:${PORT}/health"
    
    print_msg "Probando health endpoint: ${HEALTH_URL}"
    
    for i in {1..10}; do
        if curl -s -f "${HEALTH_URL}" > /dev/null; then
            print_success "✅ Health check exitoso!"
            
            RESPONSE=$(curl -s "${HEALTH_URL}")
            echo "Response: ${RESPONSE}"
            return 0
        fi
        
        print_msg "Intento ${i}/10 - esperando..."
        sleep 10
    done
    
    print_warning "No se pudo conectar al health endpoint"
}

display_deployment_info() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  DEPLOYMENT COMPLETADO${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}Aplicación:${NC}"
    echo "  URL: http://${PUBLIC_IP}:${PORT}"
    echo "  Health: http://${PUBLIC_IP}:${PORT}/health"
    echo ""
    echo -e "${BLUE}RDS Database:${NC}"
    echo "  Endpoint: ${DB_ENDPOINT}"
    echo "  Database: ${DB_NAME}"
    echo "  Username: ${DB_USERNAME}"
    echo "  DATABASE_URL: postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_ENDPOINT}:${DB_PORT}/${DB_NAME}"
    echo ""
    echo -e "${BLUE}ECS:${NC}"
    echo "  Cluster: ${CLUSTER_NAME}"
    echo "  Service: ${SERVICE_NAME}"
    echo "  Task: ${TASK_FAMILY}"
    echo ""
    echo -e "${BLUE}EC2:${NC}"
    echo "  Instance ID: ${INSTANCE_ID}"
    echo "  Public IP: ${PUBLIC_IP}"
    echo ""
    echo -e "${BLUE}Logs:${NC}"
    echo "  aws logs tail /ecs/${APP_NAME} --follow --region ${AWS_REGION}"
    echo ""
    echo -e "${BLUE}Google OAuth Callback:${NC}"
    echo "  Actualiza en Google Console: http://${PUBLIC_IP}:${PORT}/auth/google/callback"
    echo ""
    
    cat > ${WORK_DIR}/deployment-info.txt <<EOF
MAJESTIC APP - DEPLOYMENT INFO
================================

Application URLs:
  Main: http://${PUBLIC_IP}:${PORT}
  Health: http://${PUBLIC_IP}:${PORT}/health
  Google OAuth Callback: http://${PUBLIC_IP}:${PORT}/auth/google/callback

Database:
  Endpoint: ${DB_ENDPOINT}
  Port: ${DB_PORT}
  Database: ${DB_NAME}
  Username: ${DB_USERNAME}
  Password: ${DB_PASSWORD}
  Full URL: postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_ENDPOINT}:${DB_PORT}/${DB_NAME}

AWS Resources:
  Region: ${AWS_REGION}
  Account ID: ${ACCOUNT_ID}
  
  ECS Cluster: ${CLUSTER_NAME}
  ECS Service: ${SERVICE_NAME}
  Task Definition: ${TASK_FAMILY}
  
  EC2 Instance: ${INSTANCE_ID}
  Public IP: ${PUBLIC_IP}
  Security Group: ${ECS_SG_ID}
  
  RDS Instance: ${DB_INSTANCE_IDENTIFIER}
  RDS Security Group: ${RDS_SG_ID}
  
  ECR Repository: ${ECR_URI}

Useful Commands:
  View logs:
    aws logs tail /ecs/${APP_NAME} --follow --region ${AWS_REGION}
  
  SSH to EC2:
    ssh -i ${KEY_PAIR_NAME}.pem ec2-user@${PUBLIC_IP}
  
  Describe service:
    aws ecs describe-services --cluster ${CLUSTER_NAME} --services ${SERVICE_NAME} --region ${AWS_REGION}
  
  List tasks:
    aws ecs list-tasks --cluster ${CLUSTER_NAME} --region ${AWS_REGION}
  
  Force new deployment:
    aws ecs update-service --cluster ${CLUSTER_NAME} --service ${SERVICE_NAME} --force-new-deployment --region ${AWS_REGION}

Testing:
  Use test-majestic-deployment.sh script for comprehensive testing
  
IMPORTANT:
  - Update Google OAuth callback URL in Google Console
  - Monitor CloudWatch logs for initialization
  - Database tables are created automatically on first run (SKIP_DB_INIT=false)
EOF
    
    print_msg "Información guardada en: ${WORK_DIR}/deployment-info.txt"
}

##############################################
# MAIN
##############################################

main() {
    echo ""
    echo "=========================================="
    echo "  MAJESTIC APP - DEPLOYMENT COMPLETO"
    echo "=========================================="
    echo ""
    
    check_prerequisites
    #clone_repository
    get_or_create_vpc
    create_security_groups
    create_rds_subnet_group
    create_rds_instance
    create_ecr_repository
    build_and_push_image
    create_iam_roles
    create_ecs_cluster
    launch_ec2_instance
    register_task_definition
    create_ecs_service
    wait_for_service
    test_application
    display_deployment_info
    
    echo ""
    print_success "🎉 DEPLOYMENT COMPLETADO EXITOSAMENTE!"
    echo ""
    print_msg "Próximos pasos:"
    echo "  1. Actualiza la URL de callback de Google OAuth en Google Console"
    echo "  2. Verifica los logs: aws logs tail /ecs/${APP_NAME} --follow --region ${AWS_REGION}"
    echo "  3. Accede a la aplicación: http://${PUBLIC_IP}:${PORT}"
    echo ""
    print_msg "Para más información, revisa: ${WORK_DIR}/deployment-info.txt"
}

##############################################
# EJECUTAR
##############################################

# Manejar Ctrl+C
trap 'print_error "Deployment interrumpido"; exit 1' INT TERM

# Ejecutar deployment
main "$@"

exit 0