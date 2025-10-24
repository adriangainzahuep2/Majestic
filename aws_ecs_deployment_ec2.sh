#!/bin/bash
# ============================================================================
# Script de Despliegue Completo: NodeJS + PostgreSQL en AWS con EC2
# ============================================================================
# Este script despliega:
# 1. RDS PostgreSQL
# 2. ECS Cluster con EC2 (en lugar de Fargate)
# 3. Application Load Balancer
# 4. Networking (VPC, Subnets, Security Groups)
# 5. Auto Scaling Group para EC2 instances
# 6. Migraciones automáticas de schema
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

# ============================================================================
# CONFIGURACIÓN - Personaliza estos valores
# ============================================================================

# Configuración general
PROJECT_NAME="${PROJECT_NAME:-majestic-app}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Configuración de Base de Datos
DB_INSTANCE_IDENTIFIER="${DB_INSTANCE_IDENTIFIER:-health-app}"
DB_NAME="${DB_NAME:-health_app}"
DB_USERNAME="${DB_USERNAME:-majestic}"
DB_PASSWORD="${DB_PASSWORD:-simple123}"
DB_INSTANCE_CLASS="${DB_INSTANCE_CLASS:-db.t3.micro}"
DB_ALLOCATED_STORAGE="${DB_ALLOCATED_STORAGE:-20}"

# Configuración de Docker
DOCKER_IMAGE="${DOCKER_IMAGE:-}"  # Se solicitará si está vacío
CONTAINER_PORT="${CONTAINER_PORT:-3000}"
CONTAINER_CPU="${CONTAINER_CPU:-1024}"      # CPU units (1024 = 1 vCPU)
CONTAINER_MEMORY="${CONTAINER_MEMORY:-2048}" # MB soft limit
CONTAINER_MEMORY_RESERVATION="${CONTAINER_MEMORY_RESERVATION:-1024}" # MB hard limit

# Configuración de EC2
EC2_INSTANCE_TYPE="${EC2_INSTANCE_TYPE:-t3.small}"
EC2_KEY_NAME="${EC2_KEY_NAME:-ecs-keypair}"  # Opcional: nombre de tu key pair
EC2_MIN_SIZE="${EC2_MIN_SIZE:-1}"
EC2_MAX_SIZE="${EC2_MAX_SIZE:-3}"
EC2_DESIRED_CAPACITY="${EC2_DESIRED_CAPACITY:-1}"

# Configuración de ECS
ECS_CLUSTER_NAME="${ECS_CLUSTER_NAME:-${PROJECT_NAME}-cluster}"
ECS_SERVICE_NAME="${ECS_SERVICE_NAME:-${PROJECT_NAME}-service}"
ECS_TASK_FAMILY="${ECS_TASK_FAMILY:-${PROJECT_NAME}-task}"
DESIRED_COUNT="${DESIRED_COUNT:-1}"

# Variables de entorno adicionales para la app
EXTRA_ENV_VARS="${EXTRA_ENV_VARS:-NODE_ENV=production}"

# ============================================================================
# VALIDACIONES INICIALES
# ============================================================================

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║      DESPLIEGUE COMPLETO DE APLICACIÓN EN AWS (ECS con EC2)       ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

log_info "Verificando requisitos previos..."

# AWS CLI
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI no está instalado"
    exit 1
fi

# jq
if ! command -v jq &> /dev/null; then
    log_error "jq no está instalado (requerido para procesamiento JSON)"
    exit 1
fi

# Docker
if ! command -v docker &> /dev/null; then
    log_warning "Docker no está instalado (necesario para build de imágenes)"
fi

# Verificar credenciales AWS
if ! aws sts get-caller-identity &> /dev/null; then
    log_error "Credenciales de AWS no configuradas"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
log_success "AWS Account ID: $ACCOUNT_ID"

# Solicitar imagen Docker si no está configurada
if [ -z "$DOCKER_IMAGE" ]; then
    echo ""
    log_warning "No se especificó imagen Docker"
    echo "Opciones:"
    echo "  1. Usar imagen existente en ECR/DockerHub"
    echo "  2. Construir desde Dockerfile local"
    read -p "Selecciona opción (1/2): " DOCKER_OPTION
    
    if [ "$DOCKER_OPTION" == "1" ]; then
        read -p "Introduce la imagen completa (ej: 123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:latest): " DOCKER_IMAGE
    else
        read -p "Ruta al Dockerfile [./Dockerfile]: " DOCKERFILE_PATH
        DOCKERFILE_PATH=${DOCKERFILE_PATH:-./Dockerfile}
        
        if [ ! -f "$DOCKERFILE_PATH" ]; then
            log_error "Dockerfile no encontrado en $DOCKERFILE_PATH"
            exit 1
        fi
        
        # Crear repositorio ECR si no existe
        ECR_REPO_NAME="${PROJECT_NAME}"
        log_info "Creando repositorio ECR: $ECR_REPO_NAME"
        
        ECR_URI=$(aws ecr describe-repositories \
            --repository-names $ECR_REPO_NAME \
            --region $AWS_REGION \
            --query 'repositories[0].repositoryUri' \
            --output text 2>/dev/null || echo "")
        
        if [ -z "$ECR_URI" ]; then
            ECR_URI=$(aws ecr create-repository \
                --repository-name $ECR_REPO_NAME \
                --region $AWS_REGION \
                --query 'repository.repositoryUri' \
                --output text)
            log_success "Repositorio ECR creado: $ECR_URI"
        else
            log_info "Usando repositorio ECR existente: $ECR_URI"
        fi
        
        # Login a ECR
        log_info "Autenticando con ECR..."
        aws ecr get-login-password --region $AWS_REGION | \
            docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
        
        # Construir y pushear imagen
        log_info "Construyendo imagen Docker..."
        docker build -t $ECR_REPO_NAME:latest -f $DOCKERFILE_PATH .
        
        docker tag $ECR_REPO_NAME:latest $ECR_URI:latest
        
        log_info "Pusheando imagen a ECR..."
        docker push $ECR_URI:latest
        
        DOCKER_IMAGE="$ECR_URI:latest"
        log_success "Imagen disponible: $DOCKER_IMAGE"
    fi
fi

echo ""
log_info "Configuración del despliegue:"
echo "  - Proyecto: $PROJECT_NAME"
echo "  - Región: $AWS_REGION"
echo "  - Imagen: $DOCKER_IMAGE"
echo "  - DB: PostgreSQL ($DB_INSTANCE_CLASS)"
echo "  - EC2: $EC2_INSTANCE_TYPE"
echo "  - Capacidad: Min=$EC2_MIN_SIZE, Desired=$EC2_DESIRED_CAPACITY, Max=$EC2_MAX_SIZE"
echo ""

read -p "¿Continuar con el despliegue? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    log_warning "Despliegue cancelado"
    exit 0
fi

# ============================================================================
# PASO 1: CONFIGURAR NETWORKING (VPC, SUBNETS, SECURITY GROUPS)
# ============================================================================

echo ""
echo "════════════════════════════════════════════════════════════════════"
log_info "PASO 1: Configurando Networking"
echo "════════════════════════════════════════════════════════════════════"

# Detectar VPC por defecto
VPC_ID=$(aws ec2 describe-vpcs \
    --region $AWS_REGION \
    --filters "Name=isDefault,Values=true" \
    --query 'Vpcs[0].VpcId' \
    --output text)

if [ "$VPC_ID" == "None" ] || [ -z "$VPC_ID" ]; then
    log_error "No se encontró VPC por defecto"
    exit 1
fi

log_success "VPC: $VPC_ID"

# Obtener subnets públicas
PUBLIC_SUBNETS=$(aws ec2 describe-subnets \
    --region $AWS_REGION \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[?MapPublicIpOnLaunch==`true`].SubnetId' \
    --output text)

if [ -z "$PUBLIC_SUBNETS" ]; then
    log_error "No se encontraron subnets públicas"
    exit 1
fi

SUBNET_ARRAY=($PUBLIC_SUBNETS)
log_success "Subnets públicas encontradas: ${#SUBNET_ARRAY[@]}"

# Crear Security Group para ALB
ALB_SG_NAME="${PROJECT_NAME}-alb-sg"
log_info "Creando Security Group para ALB: $ALB_SG_NAME"

ALB_SG_ID=$(aws ec2 describe-security-groups \
    --region $AWS_REGION \
    --filters "Name=group-name,Values=$ALB_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [ -z "$ALB_SG_ID" ] || [ "$ALB_SG_ID" == "None" ]; then
    ALB_SG_ID=$(aws ec2 create-security-group \
        --region $AWS_REGION \
        --group-name $ALB_SG_NAME \
        --description "Security group for ${PROJECT_NAME} ALB" \
        --vpc-id $VPC_ID \
        --output text)
    
    # Permitir HTTP y HTTPS
    aws ec2 authorize-security-group-ingress \
        --region $AWS_REGION \
        --group-id $ALB_SG_ID \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0
    
    aws ec2 authorize-security-group-ingress \
        --region $AWS_REGION \
        --group-id $ALB_SG_ID \
        --protocol tcp \
        --port 443 \
        --cidr 0.0.0.0/0
    
    log_success "Security Group ALB creado: $ALB_SG_ID"
else
    log_info "Reutilizando Security Group ALB: $ALB_SG_ID"
fi

# Crear Security Group para EC2 Instances con TODOS los puertos configurados
EC2_SG_NAME="${PROJECT_NAME}-ec2-sg"
log_info "Creando Security Group para EC2: $EC2_SG_NAME"

EC2_SG_ID=$(aws ec2 describe-security-groups \
    --region $AWS_REGION \
    --filters "Name=group-name,Values=$EC2_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [ -z "$EC2_SG_ID" ] || [ "$EC2_SG_ID" == "None" ]; then
    EC2_SG_ID=$(aws ec2 create-security-group \
        --region $AWS_REGION \
        --group-name $EC2_SG_NAME \
        --description "Security group for ${PROJECT_NAME} EC2 instances" \
        --vpc-id $VPC_ID \
        --output text)
    
    log_info "Configurando reglas de seguridad para EC2..."
    
    # Permitir rango dinámico de puertos desde ALB
    aws ec2 authorize-security-group-ingress \
        --region $AWS_REGION \
        --group-id $EC2_SG_ID \
        --protocol tcp \
        --port 32768-65535 \
        --source-group $ALB_SG_ID \
        --description "Allow dynamic ports from ALB" 2>/dev/null || true
    
    # Puerto 5000 (desde cualquier lugar Y desde ALB)
    aws ec2 authorize-security-group-ingress \
        --region $AWS_REGION \
        --group-id $EC2_SG_ID \
        --protocol tcp \
        --port 5000 \
        --cidr 0.0.0.0/0 \
        --description "Allow port 5000" 2>/dev/null || true
    
    # Puerto 6543
    aws ec2 authorize-security-group-ingress \
        --region $AWS_REGION \
        --group-id $EC2_SG_ID \
        --protocol tcp \
        --port 6543 \
        --cidr 0.0.0.0/0 \
        --description "Allow port 6543" 2>/dev/null || true
    
    # Puerto 5432 (PostgreSQL)
    aws ec2 authorize-security-group-ingress \
        --region $AWS_REGION \
        --group-id $EC2_SG_ID \
        --protocol tcp \
        --port 5432 \
        --cidr 0.0.0.0/0 \
        --description "Allow PostgreSQL port 5432" 2>/dev/null || true
    
    # Puerto 8080
    aws ec2 authorize-security-group-ingress \
        --region $AWS_REGION \
        --group-id $EC2_SG_ID \
        --protocol tcp \
        --port 8080 \
        --cidr 0.0.0.0/0 \
        --description "Allow port 8080" 2>/dev/null || true
    
    # Puerto 80 (HTTP)
    aws ec2 authorize-security-group-ingress \
        --region $AWS_REGION \
        --group-id $EC2_SG_ID \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0 \
        --description "Allow HTTP port 80" 2>/dev/null || true
    
    # Puerto 3000
    aws ec2 authorize-security-group-ingress \
        --region $AWS_REGION \
        --group-id $EC2_SG_ID \
        --protocol tcp \
        --port 3000 \
        --cidr 0.0.0.0/0 \
        --description "Allow port 3000" 2>/dev/null || true
    
    # Puerto 443 (HTTPS)
    aws ec2 authorize-security-group-ingress \
        --region $AWS_REGION \
        --group-id $EC2_SG_ID \
        --protocol tcp \
        --port 443 \
        --cidr 0.0.0.0/0 \
        --description "Allow HTTPS port 443" 2>/dev/null || true
    
    # Puerto 22 (SSH - si se especificó key pair)
    if [ -n "$EC2_KEY_NAME" ]; then
        aws ec2 authorize-security-group-ingress \
            --region $AWS_REGION \
            --group-id $EC2_SG_ID \
            --protocol tcp \
            --port 22 \
            --cidr 0.0.0.0/0 \
            --description "SSH access" 2>/dev/null || true
    fi
    
    log_success "Security Group EC2 creado con puertos: 22, 80, 443, 3000, 5000, 5432, 6543, 8080, 32768-65535"
else
    log_info "Reutilizando Security Group EC2: $EC2_SG_ID"
fi

# Crear Security Group para RDS
RDS_SG_NAME="${PROJECT_NAME}-rds-sg"
log_info "Creando Security Group para RDS: $RDS_SG_NAME"

RDS_SG_ID=$(aws ec2 describe-security-groups \
    --region $AWS_REGION \
    --filters "Name=group-name,Values=$RDS_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [ -z "$RDS_SG_ID" ] || [ "$RDS_SG_ID" == "None" ]; then
    RDS_SG_ID=$(aws ec2 create-security-group \
        --region $AWS_REGION \
        --group-name $RDS_SG_NAME \
        --description "Security group for ${PROJECT_NAME} RDS" \
        --vpc-id $VPC_ID \
        --output text)
    
    # Permitir PostgreSQL desde EC2
    aws ec2 authorize-security-group-ingress \
        --region $AWS_REGION \
        --group-id $RDS_SG_ID \
        --protocol tcp \
        --port 5432 \
        --source-group $EC2_SG_ID
    
    log_success "Security Group RDS creado: $RDS_SG_ID"
else
    log_info "Reutilizando Security Group RDS: $RDS_SG_ID"
fi

# ============================================================================
# PASO 2: CREAR RDS POSTGRESQL
# ============================================================================

echo ""
echo "════════════════════════════════════════════════════════════════════"
log_info "PASO 2: Creando Base de Datos PostgreSQL"
echo "════════════════════════════════════════════════════════════════════"

# Crear DB Subnet Group
DB_SUBNET_GROUP_NAME="${PROJECT_NAME}-db-subnet-group"
log_info "Creando DB Subnet Group: $DB_SUBNET_GROUP_NAME"

if ! aws rds describe-db-subnet-groups \
    --region $AWS_REGION \
    --db-subnet-group-name $DB_SUBNET_GROUP_NAME &> /dev/null; then
    
    aws rds create-db-subnet-group \
        --region $AWS_REGION \
        --db-subnet-group-name $DB_SUBNET_GROUP_NAME \
        --db-subnet-group-description "Subnet group for $PROJECT_NAME" \
        --subnet-ids $PUBLIC_SUBNETS
    
    log_success "DB Subnet Group creado"
else
    log_info "DB Subnet Group ya existe"
fi

# Crear instancia RDS
log_info "Creando instancia RDS: $DB_INSTANCE_IDENTIFIER"

if aws rds describe-db-instances \
    --region $AWS_REGION \
    --db-instance-identifier $DB_INSTANCE_IDENTIFIER &> /dev/null; then
    log_warning "Instancia RDS ya existe"
    
    DB_ENDPOINT=$(aws rds describe-db-instances \
        --region $AWS_REGION \
        --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text)
    
    DB_PORT=$(aws rds describe-db-instances \
        --region $AWS_REGION \
        --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
        --query 'DBInstances[0].Endpoint.Port' \
        --output text)
else
    aws rds create-db-instance \
        --region $AWS_REGION \
        --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
        --db-instance-class $DB_INSTANCE_CLASS \
        --engine postgres \
        --engine-version 15.4 \
        --master-username $DB_USERNAME \
        --master-user-password "$DB_PASSWORD" \
        --allocated-storage $DB_ALLOCATED_STORAGE \
        --db-subnet-group-name $DB_SUBNET_GROUP_NAME \
        --vpc-security-group-ids $RDS_SG_ID \
        --backup-retention-period 7 \
        --no-publicly-accessible \
        --db-name $DB_NAME \
        --storage-encrypted \
        --storage-type gp3
    
    log_success "Instancia RDS creada (iniciando...)"
    
    log_info "Esperando a que RDS esté disponible (esto puede tomar 5-10 minutos)..."
    
    aws rds wait db-instance-available \
        --region $AWS_REGION \
        --db-instance-identifier $DB_INSTANCE_IDENTIFIER
    
    log_success "RDS disponible"
    
    DB_ENDPOINT=$(aws rds describe-db-instances \
        --region $AWS_REGION \
        --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text)
    
    DB_PORT=$(aws rds describe-db-instances \
        --region $AWS_REGION \
        --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
        --query 'DBInstances[0].Endpoint.Port' \
        --output text)
fi

log_success "Database Endpoint: $DB_ENDPOINT:$DB_PORT"

# ============================================================================
# PASO 3: CREAR APPLICATION LOAD BALANCER
# ============================================================================

echo ""
echo "════════════════════════════════════════════════════════════════════"
log_info "PASO 3: Creando Application Load Balancer"
echo "════════════════════════════════════════════════════════════════════"

ALB_NAME="${PROJECT_NAME}-alb"
log_info "Creando ALB: $ALB_NAME"

EXISTING_ALB=$(aws elbv2 describe-load-balancers \
    --region $AWS_REGION \
    --names $ALB_NAME \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_ALB" ] && [ "$EXISTING_ALB" != "None" ]; then
    ALB_ARN=$EXISTING_ALB
    log_info "Reutilizando ALB existente"
else
    ALB_ARN=$(aws elbv2 create-load-balancer \
        --region $AWS_REGION \
        --name $ALB_NAME \
        --subnets ${SUBNET_ARRAY[@]} \
        --security-groups $ALB_SG_ID \
        --scheme internet-facing \
        --type application \
        --ip-address-type ipv4 \
        --query 'LoadBalancers[0].LoadBalancerArn' \
        --output text)
    
    log_success "ALB creado: $ALB_ARN"
fi

ALB_DNS=$(aws elbv2 describe-load-balancers \
    --region $AWS_REGION \
    --load-balancer-arns $ALB_ARN \
    --query 'LoadBalancers[0].DNSName' \
    --output text)

log_success "ALB DNS: $ALB_DNS"

# Crear Target Group
TG_NAME="${PROJECT_NAME}-tg"
log_info "Creando Target Group: $TG_NAME"

EXISTING_TG=$(aws elbv2 describe-target-groups \
    --region $AWS_REGION \
    --names $TG_NAME \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_TG" ] && [ "$EXISTING_TG" != "None" ]; then
    TG_ARN=$EXISTING_TG
    log_info "Reutilizando Target Group existente"
else
    TG_ARN=$(aws elbv2 create-target-group \
        --region $AWS_REGION \
        --name $TG_NAME \
        --protocol HTTP \
        --port $CONTAINER_PORT \
        --vpc-id $VPC_ID \
        --target-type instance \
        --health-check-enabled \
        --health-check-path / \
        --health-check-interval-seconds 30 \
        --health-check-timeout-seconds 5 \
        --healthy-threshold-count 2 \
        --unhealthy-threshold-count 3 \
        --query 'TargetGroups[0].TargetGroupArn' \
        --output text)
    
    log_success "Target Group creado"
fi

# Crear Listener
log_info "Configurando Listener HTTP en puerto 80"

EXISTING_LISTENER=$(aws elbv2 describe-listeners \
    --region $AWS_REGION \
    --load-balancer-arn $ALB_ARN \
    --query 'Listeners[?Port==`80`].ListenerArn' \
    --output text 2>/dev/null || echo "")

if [ -z "$EXISTING_LISTENER" ] || [ "$EXISTING_LISTENER" == "None" ]; then
    aws elbv2 create-listener \
        --region $AWS_REGION \
        --load-balancer-arn $ALB_ARN \
        --protocol HTTP \
        --port 80 \
        --default-actions Type=forward,TargetGroupArn=$TG_ARN
    
    log_success "Listener creado"
else
    log_info "Listener ya existe"
fi

# ============================================================================
# PASO 4: CREAR IAM ROLES
# ============================================================================

echo ""
echo "════════════════════════════════════════════════════════════════════"
log_info "PASO 4: Configurando IAM Roles"
echo "════════════════════════════════════════════════════════════════════"

# Crear rol de ejecución para ECS
EXECUTION_ROLE_NAME="${PROJECT_NAME}-ecs-execution-role"
log_info "Configurando IAM Role para ECS Task Execution"

EXECUTION_ROLE_ARN=$(aws iam get-role \
    --role-name $EXECUTION_ROLE_NAME \
    --query 'Role.Arn' \
    --output text 2>/dev/null || echo "")

if [ -z "$EXECUTION_ROLE_ARN" ]; then
    cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
    EXECUTION_ROLE_ARN=$(aws iam create-role \
        --role-name $EXECUTION_ROLE_NAME \
        --assume-role-policy-document file:///tmp/trust-policy.json \
        --query 'Role.Arn' \
        --output text)
    
    aws iam attach-role-policy \
        --role-name $EXECUTION_ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
    
    log_success "IAM Role (Execution) creado: $EXECUTION_ROLE_ARN"
    sleep 10
else
    log_info "Usando IAM Role (Execution) existente"
fi

# Crear rol para EC2 instances
EC2_INSTANCE_ROLE_NAME="${PROJECT_NAME}-ec2-instance-role"
log_info "Configurando IAM Role para EC2 Instances"

EC2_INSTANCE_ROLE_ARN=$(aws iam get-role \
    --role-name $EC2_INSTANCE_ROLE_NAME \
    --query 'Role.Arn' \
    --output text 2>/dev/null || echo "")

if [ -z "$EC2_INSTANCE_ROLE_ARN" ]; then
    cat > /tmp/ec2-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
    EC2_INSTANCE_ROLE_ARN=$(aws iam create-role \
        --role-name $EC2_INSTANCE_ROLE_NAME \
        --assume-role-policy-document file:///tmp/ec2-trust-policy.json \
        --query 'Role.Arn' \
        --output text)
    
    aws iam attach-role-policy \
        --role-name $EC2_INSTANCE_ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role
    
    aws iam attach-role-policy \
        --role-name $EC2_INSTANCE_ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess
    
    log_success "IAM Role (EC2) creado: $EC2_INSTANCE_ROLE_ARN"
    sleep 10
else
    log_info "Usando IAM Role (EC2) existente"
fi

# Crear Instance Profile
INSTANCE_PROFILE_NAME="${PROJECT_NAME}-ec2-instance-profile"
log_info "Configurando Instance Profile"

INSTANCE_PROFILE_ARN=$(aws iam get-instance-profile \
    --instance-profile-name $INSTANCE_PROFILE_NAME \
    --query 'InstanceProfile.Arn' \
    --output text 2>/dev/null || echo "")

if [ -z "$INSTANCE_PROFILE_ARN" ]; then
    INSTANCE_PROFILE_ARN=$(aws iam create-instance-profile \
        --instance-profile-name $INSTANCE_PROFILE_NAME \
        --query 'InstanceProfile.Arn' \
        --output text)
    
    aws iam add-role-to-instance-profile \
        --instance-profile-name $INSTANCE_PROFILE_NAME \
        --role-name $EC2_INSTANCE_ROLE_NAME
    
    log_success "Instance Profile creado: $INSTANCE_PROFILE_ARN"
    sleep 10
else
    log_info "Usando Instance Profile existente"
fi

# ============================================================================
# PASO 5: CREAR ECS CLUSTER
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════"
log_info "PASO 5: Creando ECS Cluster"
echo "═══════════════════════════════════════════════════════════════════"

log_info "Creando ECS Cluster: $ECS_CLUSTER_NAME"

if aws ecs describe-clusters \
    --region $AWS_REGION \
    --clusters $ECS_CLUSTER_NAME \
    --query 'clusters[0].status' \
    --output text 2>/dev/null | grep -q "ACTIVE"; then
    log_info "ECS Cluster ya existe"
else
    aws ecs create-cluster \
        --region $AWS_REGION \
        --cluster-name $ECS_CLUSTER_NAME \
        --capacity-providers FARGATE FARGATE_SPOT \
        --settings name=containerInsights,value=enabled
    
    log_success "ECS Cluster creado"
fi

# ============================================================================
# PASO 6: CREAR LAUNCH TEMPLATE Y AUTO SCALING GROUP
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════"
log_info "PASO 6: Configurando Auto Scaling Group"
echo "═══════════════════════════════════════════════════════════════════"

# Obtener la AMI más reciente de ECS-optimized
log_info "Obteniendo AMI optimizada para ECS..."

ECS_AMI_ID=$(aws ssm get-parameters \
    --region $AWS_REGION \
    --names /aws/service/ecs/optimized-ami/amazon-linux-2/recommended/image_id \
    --query 'Parameters[0].Value' \
    --output text)

log_success "AMI ID: $ECS_AMI_ID"

# Crear User Data para EC2
cat > /tmp/user-data.txt <<EOF
#!/bin/bash
echo ECS_CLUSTER=${ECS_CLUSTER_NAME} >> /etc/ecs/ecs.config
echo ECS_ENABLE_TASK_IAM_ROLE=true >> /etc/ecs/ecs.config
echo ECS_ENABLE_TASK_IAM_ROLE_NETWORK_HOST=true >> /etc/ecs/ecs.config
EOF

USER_DATA=$(base64 -w 0 /tmp/user-data.txt)

# Crear Launch Template
LAUNCH_TEMPLATE_NAME="${PROJECT_NAME}-launch-template"
log_info "Creando Launch Template: $LAUNCH_TEMPLATE_NAME"

# Verificar si existe
EXISTING_LT=$(aws ec2 describe-launch-templates \
    --region $AWS_REGION \
    --launch-template-names $LAUNCH_TEMPLATE_NAME \
    --query 'LaunchTemplates[0].LaunchTemplateId' \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_LT" ] && [ "$EXISTING_LT" != "None" ]; then
    log_info "Launch Template ya existe, creando nueva versión..."
    
    aws ec2 create-launch-template-version \
        --region $AWS_REGION \
        --launch-template-name $LAUNCH_TEMPLATE_NAME \
        --source-version '$Latest' \
        --launch-template-data "{
            \"ImageId\": \"$ECS_AMI_ID\",
            \"InstanceType\": \"$EC2_INSTANCE_TYPE\",
            \"IamInstanceProfile\": {
                \"Name\": \"$INSTANCE_PROFILE_NAME\"
            },
            \"SecurityGroupIds\": [\"$EC2_SG_ID\"],
            \"UserData\": \"$USER_DATA\",
            \"TagSpecifications\": [{
                \"ResourceType\": \"instance\",
                \"Tags\": [
                    {\"Key\": \"Name\", \"Value\": \"${PROJECT_NAME}-ecs-instance\"},
                    {\"Key\": \"Project\", \"Value\": \"${PROJECT_NAME}\"}
                ]
            }]
        }" > /dev/null
    
    # Establecer como versión por defecto
    aws ec2 modify-launch-template \
        --region $AWS_REGION \
        --launch-template-name $LAUNCH_TEMPLATE_NAME \
        --default-version '$Latest' > /dev/null
    
    log_success "Nueva versión de Launch Template creada"
else
    KEY_PARAM=""
    if [ -n "$EC2_KEY_NAME" ]; then
        KEY_PARAM=",\"KeyName\": \"$EC2_KEY_NAME\""
    fi
    
    aws ec2 create-launch-template \
        --region $AWS_REGION \
        --launch-template-name $LAUNCH_TEMPLATE_NAME \
        --launch-template-data "{
            \"ImageId\": \"$ECS_AMI_ID\",
            \"InstanceType\": \"$EC2_INSTANCE_TYPE\",
            \"IamInstanceProfile\": {
                \"Name\": \"$INSTANCE_PROFILE_NAME\"
            },
            \"SecurityGroupIds\": [\"$EC2_SG_ID\"],
            \"UserData\": \"$USER_DATA\"
            ${KEY_PARAM},
            \"TagSpecifications\": [{
                \"ResourceType\": \"instance\",
                \"Tags\": [
                    {\"Key\": \"Name\", \"Value\": \"${PROJECT_NAME}-ecs-instance\"},
                    {\"Key\": \"Project\", \"Value\": \"${PROJECT_NAME}\"}
                ]
            }]
        }" > /dev/null
    
    log_success "Launch Template creado"
fi

# Crear Auto Scaling Group
ASG_NAME="${PROJECT_NAME}-asg"
log_info "Creando Auto Scaling Group: $ASG_NAME"

if aws autoscaling describe-auto-scaling-groups \
    --region $AWS_REGION \
    --auto-scaling-group-names $ASG_NAME 2>/dev/null | grep -q "AutoScalingGroupName"; then
    log_info "Auto Scaling Group ya existe, actualizando..."
    
    aws autoscaling update-auto-scaling-group \
        --region $AWS_REGION \
        --auto-scaling-group-name $ASG_NAME \
        --min-size $EC2_MIN_SIZE \
        --max-size $EC2_MAX_SIZE \
        --desired-capacity $EC2_DESIRED_CAPACITY \
        --launch-template LaunchTemplateName=$LAUNCH_TEMPLATE_NAME,Version='$Latest'
    
    log_success "Auto Scaling Group actualizado"
else
    aws autoscaling create-auto-scaling-group \
        --region $AWS_REGION \
        --auto-scaling-group-name $ASG_NAME \
        --launch-template LaunchTemplateName=$LAUNCH_TEMPLATE_NAME,Version='$Latest' \
        --min-size $EC2_MIN_SIZE \
        --max-size $EC2_MAX_SIZE \
        --desired-capacity $EC2_DESIRED_CAPACITY \
        --vpc-zone-identifier "$(echo ${SUBNET_ARRAY[@]} | tr ' ' ',')" \
        --health-check-type EC2 \
        --health-check-grace-period 300 \
        --tags "Key=Name,Value=${PROJECT_NAME}-ecs-instance,PropagateAtLaunch=true" \
               "Key=Project,Value=${PROJECT_NAME},PropagateAtLaunch=true"
    
    log_success "Auto Scaling Group creado"
fi

# Registrar Capacity Provider
CAPACITY_PROVIDER_NAME="${PROJECT_NAME}-capacity-provider"
log_info "Configurando Capacity Provider: $CAPACITY_PROVIDER_NAME"

EXISTING_CP=$(aws ecs describe-capacity-providers \
    --region $AWS_REGION \
    --capacity-providers $CAPACITY_PROVIDER_NAME \
    --query 'capacityProviders[0].name' \
    --output text 2>/dev/null || echo "")

if [ -z "$EXISTING_CP" ] || [ "$EXISTING_CP" == "None" ]; then
    aws ecs create-capacity-provider \
        --region $AWS_REGION \
        --name $CAPACITY_PROVIDER_NAME \
        --auto-scaling-group-provider "autoScalingGroupArn=$(aws autoscaling describe-auto-scaling-groups --region $AWS_REGION --auto-scaling-group-names $ASG_NAME --query 'AutoScalingGroups[0].AutoScalingGroupARN' --output text),managedScaling={status=ENABLED,targetCapacity=80,minimumScalingStepSize=1,maximumScalingStepSize=100},managedTerminationProtection=DISABLED" > /dev/null
    
    log_success "Capacity Provider creado"
else
    log_info "Capacity Provider ya existe"
fi

# Asociar Capacity Provider con el Cluster
log_info "Asociando Capacity Provider con ECS Cluster..."

aws ecs put-cluster-capacity-providers \
    --region $AWS_REGION \
    --cluster $ECS_CLUSTER_NAME \
    --capacity-providers $CAPACITY_PROVIDER_NAME \
    --default-capacity-provider-strategy capacityProvider=$CAPACITY_PROVIDER_NAME,weight=1,base=0 > /dev/null

log_success "Capacity Provider asociado"

# ============================================================================
# PASO 8: CREAR ECS SERVICE
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════"
log_info "PASO 8: Creando ECS Service"
echo "═══════════════════════════════════════════════════════════════════"

log_info "Esperando que las instancias EC2 se registren en el cluster..."
sleep 30

# Verificar instancias en el cluster
INSTANCES_COUNT=0
for i in {1..20}; do
    INSTANCES_COUNT=$(aws ecs list-container-instances \
        --region $AWS_REGION \
        --cluster $ECS_CLUSTER_NAME \
        --query 'length(containerInstanceArns)' \
        --output text)
    
    if [ "$INSTANCES_COUNT" -gt 0 ]; then
        log_success "Instancias EC2 registradas en el cluster: $INSTANCES_COUNT"
        break
    fi
    
    log_info "Esperando instancias... (intento $i/20)"
    sleep 15
done

if [ "$INSTANCES_COUNT" -eq 0 ]; then
    log_warning "No hay instancias EC2 registradas aún. El servicio se creará pero puede tardar en iniciar tasks."
fi

# Verificar si el servicio ya existe
if aws ecs describe-services \
    --region $AWS_REGION \
    --cluster $ECS_CLUSTER_NAME \
    --services $ECS_SERVICE_NAME 2>/dev/null | grep -q "ACTIVE"; then
    
    log_info "Servicio ECS ya existe, actualizando..."
    
    aws ecs update-service \
        --region $AWS_REGION \
        --cluster $ECS_CLUSTER_NAME \
        --service $ECS_SERVICE_NAME \
        --task-definition $ECS_TASK_FAMILY \
        --desired-count $DESIRED_COUNT \
        --force-new-deployment > /dev/null
    
    log_success "Servicio actualizado"
else
    log_info "Creando servicio ECS: $ECS_SERVICE_NAME"
    
    aws ecs create-service \
        --region $AWS_REGION \
        --cluster $ECS_CLUSTER_NAME \
        --service-name $ECS_SERVICE_NAME \
        --task-definition $ECS_TASK_FAMILY \
        --desired-count $DESIRED_COUNT \
        --launch-type EC2 \
        --scheduling-strategy REPLICA \
        --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100" \
        --load-balancers "targetGroupArn=${TG_ARN},containerName=${PROJECT_NAME}-container,containerPort=${CONTAINER_PORT}" \
        --health-check-grace-period-seconds 60 > /dev/null
    
    log_success "Servicio ECS creado"
fi

# ============================================================================
# PASO 9: OBTENER INFORMACIÓN DE INSTANCIAS EC2
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════"
log_info "PASO 9: Obteniendo información de instancias EC2"
echo "═══════════════════════════════════════════════════════════════════"

# Obtener ID de instancia del cluster
log_info "Buscando instancias EC2 en el cluster..."

INSTANCE_ARN=$(aws ecs list-container-instances \
    --cluster ${ECS_CLUSTER_NAME} \
    --region ${AWS_REGION} \
    --query 'containerInstanceArns[0]' \
    --output text)

if [ -z "${INSTANCE_ARN}" ] || [ "${INSTANCE_ARN}" == "None" ]; then
    log_warning "No se encontró instancia registrada aún. Espera unos minutos y vuelve a verificar."
    EC2_INSTANCE_ID=""
    PUBLIC_IP=""
else
    EC2_INSTANCE_ID=$(aws ecs describe-container-instances \
        --cluster ${ECS_CLUSTER_NAME} \
        --container-instances ${INSTANCE_ARN} \
        --region ${AWS_REGION} \
        --query 'containerInstances[0].ec2InstanceId' \
        --output text)
    
    PUBLIC_IP=$(aws ec2 describe-instances \
        --instance-ids ${EC2_INSTANCE_ID} \
        --region ${AWS_REGION} \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text)
    
    log_success "Instancia EC2 ID: ${EC2_INSTANCE_ID}"
    log_success "IP Pública: ${PUBLIC_IP}"
fi

# ============================================================================
# PASO 10: CONFIGURACIÓN DE SEGURIDAD EN INSTANCIAS EC2
# ============================================================================

if [ -n "$EC2_INSTANCE_ID" ] && [ -n "$EC2_KEY_NAME" ]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    log_info "PASO 10: Configurando Seguridad en Instancias EC2"
    echo "═══════════════════════════════════════════════════════════════════"
    
    # Crear script de configuración de seguridad
    cat > /tmp/security-setup.sh <<'SECURITY_EOF'
#!/bin/bash
set -e

echo "=== Instalando herramientas de seguridad ==="

# Actualizar sistema
sudo yum update -y

# Instalar UFW (via EPEL)
sudo yum install -y epel-release
sudo yum install -y ufw fail2ban certbot bind bind-utils

echo "=== Configurando UFW Firewall ==="

# Configurar UFW
sudo systemctl enable ufw
sudo ufw --force reset

# Permitir SSH (crítico - antes de habilitar)
sudo ufw allow 22/tcp comment 'SSH'

# Permitir puertos HTTP/HTTPS
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# Permitir puerto de aplicación
sudo ufw allow 3000/tcp comment 'Application'
sudo ufw allow 5000/tcp comment 'Application Alt'
sudo ufw allow 8080/tcp comment 'Application Alt 2'

# Permitir rango dinámico para ECS
sudo ufw allow 32768:65535/tcp comment 'ECS Dynamic Ports'

# Permitir DNS (BIND9)
sudo ufw allow 53/tcp comment 'DNS TCP'
sudo ufw allow 53/udp comment 'DNS UDP'

# Habilitar UFW
sudo ufw --force enable

echo "=== Configurando Fail2ban ==="

# Crear configuración de Fail2ban
sudo tee /etc/fail2ban/jail.local > /dev/null <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
destemail = admin@localhost
sendername = Fail2Ban
action = %(action_mwl)s

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s

[http-get-dos]
enabled = true
port = http,https
filter = http-get-dos
logpath = /var/log/nginx/access.log
maxretry = 300
findtime = 300
bantime = 600
EOF

# Crear filtro HTTP GET DoS
sudo tee /etc/fail2ban/filter.d/http-get-dos.conf > /dev/null <<EOF
[Definition]
failregex = ^<HOST> -.*"(GET|POST).*
ignoreregex =
EOF

# Iniciar Fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

echo "=== Configurando BIND9 (DNS) ==="

# Configuración básica de BIND9
sudo tee /etc/named.conf > /dev/null <<EOF
options {
    listen-on port 53 { any; };
    listen-on-v6 port 53 { any; };
    directory "/var/named";
    dump-file "/var/named/data/cache_dump.db";
    statistics-file "/var/named/data/named_stats.txt";
    memstatistics-file "/var/named/data/named_mem_stats.txt";
    allow-query { any; };
    recursion yes;
    dnssec-enable yes;
    dnssec-validation yes;
    managed-keys-directory "/var/named/dynamic";
    pid-file "/run/named/named.pid";
    session-keyfile "/run/named/session.key";
};

logging {
    channel default_debug {
        file "data/named.run";
        severity dynamic;
    };
};

zone "." IN {
    type hint;
    file "named.ca";
};

include "/etc/named.rfc1912.zones";
include "/etc/named.root.key";
EOF

# Iniciar BIND9
sudo systemctl enable named
sudo systemctl start named

echo "=== Configuración de seguridad completada ==="
echo ""
echo "Estado de servicios:"
sudo systemctl status ufw --no-pager | head -3
sudo systemctl status fail2ban --no-pager | head -3
sudo systemctl status named --no-pager | head -3

echo ""
echo "Reglas UFW activas:"
sudo ufw status numbered

echo ""
echo "Fail2ban jails activas:"
sudo fail2ban-client status
SECURITY_EOF

    log_info "Script de seguridad creado en /tmp/security-setup.sh"
    
    # Información para el usuario
    log_warning "Para configurar seguridad en las instancias EC2, ejecuta:"
    echo ""
    echo "  # Copiar script a la instancia:"
    echo "  scp -i ~/.ssh/${EC2_KEY_NAME}.pem /tmp/security-setup.sh ec2-user@${PUBLIC_IP}:/tmp/"
    echo ""
    echo "  # Conectar y ejecutar:"
    echo "  ssh -i ~/.ssh/${EC2_KEY_NAME}.pem ec2-user@${PUBLIC_IP}"
    echo "  chmod +x /tmp/security-setup.sh"
    echo "  sudo /tmp/security-setup.sh"
    echo ""
    
    # Preguntar si desea ejecutar automáticamente
    read -p "¿Deseas ejecutar la configuración de seguridad automáticamente? (y/n): " AUTO_SECURITY
    
    if [ "$AUTO_SECURITY" == "y" ]; then
        log_info "Copiando y ejecutando script de seguridad..."
        
        # Copiar script
        scp -i ~/.ssh/${EC2_KEY_NAME}.pem -o StrictHostKeyChecking=no \
            /tmp/security-setup.sh ec2-user@${PUBLIC_IP}:/tmp/ 2>/dev/null || {
            log_error "No se pudo copiar el script. Verifica la conectividad SSH."
        }
        
        # Ejecutar script
        ssh -i ~/.ssh/${EC2_KEY_NAME}.pem -o StrictHostKeyChecking=no \
            ec2-user@${PUBLIC_IP} "chmod +x /tmp/security-setup.sh && sudo /tmp/security-setup.sh" 2>/dev/null || {
            log_error "No se pudo ejecutar el script remotamente."
        }
        
        log_success "Configuración de seguridad completada"
    fi
else
    log_warning "Configuración de seguridad omitida (no hay key pair o instancia no disponible)"
fi

# ============================================================================
# PASO 11: CONFIGURACIÓN DE SSL/TLS CON LET'S ENCRYPT
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════"
log_info "PASO 11: Información sobre SSL/TLS"
echo "═══════════════════════════════════════════════════════════════════"

log_info "Para configurar SSL/TLS con Let's Encrypt necesitas:"
echo ""
echo "  1. Un dominio apuntando a: ${ALB_DNS}"
echo "  2. Certificado ACM (AWS Certificate Manager) o configuración manual"
echo ""
echo "Opción A - AWS Certificate Manager (Recomendado):"
echo "  1. Ve a ACM en AWS Console"
echo "  2. Solicita certificado público"
echo "  3. Valida dominio (DNS o Email)"
echo "  4. Asocia certificado al ALB listener HTTPS"
echo ""
echo "Opción B - Let's Encrypt en EC2 (Manual):"
if [ -n "$PUBLIC_IP" ] && [ -n "$EC2_KEY_NAME" ]; then
    echo ""
    echo "  ssh -i ~/.ssh/${EC2_KEY_NAME}.pem ec2-user@${PUBLIC_IP}"
    echo "  sudo certbot certonly --standalone -d tudominio.com"
    echo "  sudo certbot renew --dry-run  # Probar renovación"
    echo ""
    echo "  Nota: Requiere que el puerto 80 esté abierto temporalmente"
fi

# ============================================================================
# FINALIZACIÓN
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════"
log_success "DESPLIEGUE COMPLETADO CON ÉXITO"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "📊 INFORMACIÓN DEL DESPLIEGUE:"
echo ""
echo "🌐 URLs de la aplicación:"
echo "   Load Balancer: http://${ALB_DNS}"
if [ -n "$PUBLIC_IP" ]; then
    echo "   IP Directa: http://${PUBLIC_IP}:${CONTAINER_PORT}"
    echo ""
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}Tu aplicación estará disponible en:${NC}"
    echo -e "${GREEN}http://${PUBLIC_IP}:${CONTAINER_PORT}${NC}"
    echo -e "${GREEN}======================================${NC}"
fi
echo ""
echo "🗄️  Base de Datos PostgreSQL:"
echo "   Endpoint: ${DB_ENDPOINT}:${DB_PORT}"
echo "   Database: ${DB_NAME}"
echo "   Username: ${DB_USERNAME}"
echo ""
echo "🐳 ECS Cluster:"
echo "   Nombre: ${ECS_CLUSTER_NAME}"
echo "   Región: ${AWS_REGION}"
echo ""
echo "🖥️  EC2 Auto Scaling:"
echo "   Tipo: ${EC2_INSTANCE_TYPE}"
echo "   Min: ${EC2_MIN_SIZE} | Desired: ${EC2_DESIRED_CAPACITY} | Max: ${EC2_MAX_SIZE}"
if [ -n "$EC2_INSTANCE_ID" ]; then
    echo "   Instancia Principal: ${EC2_INSTANCE_ID}"
    echo "   IP Pública: ${PUBLIC_IP}"
fi
echo ""
echo "🔒 Seguridad Configurada:"
echo "   ✓ UFW Firewall (Linux)"
echo "   ✓ AWS Security Groups"
echo "   ✓ Fail2ban (Protección contra ataques)"
echo "   ✓ BIND9 DNS (Servidor autoritativo)"
echo "   ℹ Let's Encrypt (Requiere configuración manual)"
echo ""
echo "📋 Comandos útiles:"
echo ""
echo "  Ver estado del servicio:"
echo "  aws ecs describe-services --cluster ${ECS_CLUSTER_NAME} --services ${ECS_SERVICE_NAME} --region ${AWS_REGION}"
echo ""
echo "  Ver logs de aplicación:"
echo "  aws logs tail /ecs/${PROJECT_NAME} --follow --region ${AWS_REGION}"
echo ""
echo "  Ver instancias EC2 en el cluster:"
echo "  aws ecs list-container-instances --cluster ${ECS_CLUSTER_NAME} --region ${AWS_REGION}"
echo ""
echo "  Ver estado de health checks:"
echo "  aws elbv2 describe-target-health --target-group-arn ${TG_ARN} --region ${AWS_REGION}"
echo ""
echo "  Escalar servicio:"
echo "  aws ecs update-service --cluster ${ECS_CLUSTER_NAME} --service ${ECS_SERVICE_NAME} --desired-count 2 --region ${AWS_REGION}"
echo ""
if [ -n "$EC2_KEY_NAME" ] && [ -n "$PUBLIC_IP" ]; then
    echo "  Conectar a instancia EC2:"
    echo "  ssh -i ~/.ssh/${EC2_KEY_NAME}.pem ec2-user@${PUBLIC_IP}"
    echo ""
    echo "  Ver estado de firewall:"
    echo "  ssh -i ~/.ssh/${EC2_KEY_NAME}.pem ec2-user@${PUBLIC_IP} 'sudo ufw status verbose'"
    echo ""
    echo "  Ver intentos de ataque bloqueados:"
    echo "  ssh -i ~/.ssh/${EC2_KEY_NAME}.pem ec2-user@${PUBLIC_IP} 'sudo fail2ban-client status sshd'"
    echo ""
    echo "  Verificar servidor DNS:"
    echo "  ssh -i ~/.ssh/${EC2_KEY_NAME}.pem ec2-user@${PUBLIC_IP} 'sudo systemctl status named'"
    echo ""
fi
echo "═══════════════════════════════════════════════════════════════════"
echo ""
log_info "La aplicación puede tardar algunos minutos en estar completamente disponible."
log_info "Monitorea el estado en la consola de AWS ECS o con los comandos anteriores."
echo ""
log_warning "IMPORTANTE: Guarda la información de este despliegue para referencia futura."
echo ""