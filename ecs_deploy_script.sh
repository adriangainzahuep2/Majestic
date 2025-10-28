#!/bin/bash

##############################################
# Script de Despliegue ECS Básico
# Despliega aplicación Docker en AWS ECS (EC2)
##############################################

set -e  # Salir si hay error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para imprimir mensajes
print_msg() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

##############################################
# CONFIGURACIÓN - MODIFICAR SEGÚN TUS NECESIDADES
##############################################

# Configuración general
AWS_REGION="us-east-1"
APP_NAME="majestic-app"
ECR_REPO_NAME="${APP_NAME}-repo"
ECS_CLUSTER_NAME="${APP_NAME}-cluster"
ECS_SERVICE_NAME="${APP_NAME}-service"
TASK_FAMILY="${APP_NAME}-task"

# Configuración de la instancia EC2
INSTANCE_TYPE="t3.micro"  # Capa gratuita elegible
KEY_PAIR_NAME="ecs-keypair"  # Crear o usar existente
SECURITY_GROUP_NAME="${APP_NAME}-sg"

# Variables de entorno de la aplicación
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

# DATABASE_URL se configurará después de crear RDS
DATABASE_URL="postgresql://majestic:simple123@health-app.c4vuie06a0wt.us-east-1.rds.amazonaws.com:5432/health_app"

##############################################
# FUNCIONES
##############################################

check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI no está instalado. Instálalo desde: https://aws.amazon.com/cli/"
        exit 1
    fi
    print_msg "AWS CLI encontrado: $(aws --version)"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker no está instalado."
        exit 1
    fi
    print_msg "Docker encontrado: $(docker --version)"
}

get_account_id() {
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    print_msg "AWS Account ID: ${ACCOUNT_ID}"
}

create_ecr_repository() {
    print_msg "Creando repositorio ECR..."
    
    if aws ecr describe-repositories --repository-names ${ECR_REPO_NAME} --region ${AWS_REGION} 2>/dev/null; then
        print_warning "Repositorio ECR ya existe"
    else
        aws ecr create-repository \
            --repository-name ${ECR_REPO_NAME} \
            --region ${AWS_REGION} \
            --image-scanning-configuration scanOnPush=true
        print_msg "Repositorio ECR creado: ${ECR_REPO_NAME}"
    fi
    
    ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"
}

build_and_push_docker() {
    print_msg "Construyendo imagen Docker..."
    
    # Build imagen
    docker build -t ${APP_NAME}:latest .
    
    # Tag imagen
    docker tag ${APP_NAME}:latest ${ECR_URI}:latest
    
    print_msg "Autenticando con ECR..."
    aws ecr get-login-password --region ${AWS_REGION} | \
        docker login --username AWS --password-stdin ${ECR_URI}
    
    print_msg "Subiendo imagen a ECR..."
    docker push ${ECR_URI}:latest
    
    print_msg "Imagen subida exitosamente: ${ECR_URI}:latest"
}

create_iam_roles() {
    print_msg "Creando roles IAM..."
    
    # ECS Task Execution Role
    TASK_EXECUTION_ROLE_NAME="${APP_NAME}-task-execution-role"
    
    if aws iam get-role --role-name ${TASK_EXECUTION_ROLE_NAME} 2>/dev/null; then
        print_warning "Role de ejecución ya existe"
    else
        cat > trust-policy.json <<EOF
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
        
        aws iam create-role \
            --role-name ${TASK_EXECUTION_ROLE_NAME} \
            --assume-role-policy-document file://trust-policy.json
        
        aws iam attach-role-policy \
            --role-name ${TASK_EXECUTION_ROLE_NAME} \
            --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
        
        rm trust-policy.json
        print_msg "Role de ejecución creado"
    fi
    
    TASK_EXECUTION_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${TASK_EXECUTION_ROLE_NAME}"
    
    # ECS Instance Role
    ECS_INSTANCE_ROLE_NAME="${APP_NAME}-ecs-instance-role"
    
    if aws iam get-role --role-name ${ECS_INSTANCE_ROLE_NAME} 2>/dev/null; then
        print_warning "Role de instancia ya existe"
    else
        cat > ec2-trust-policy.json <<EOF
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
        
        aws iam create-role \
            --role-name ${ECS_INSTANCE_ROLE_NAME} \
            --assume-role-policy-document file://ec2-trust-policy.json
        
        aws iam attach-role-policy \
            --role-name ${ECS_INSTANCE_ROLE_NAME} \
            --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role
        
        # Crear instance profile
        aws iam create-instance-profile --instance-profile-name ${ECS_INSTANCE_ROLE_NAME}
        aws iam add-role-to-instance-profile \
            --instance-profile-name ${ECS_INSTANCE_ROLE_NAME} \
            --role-name ${ECS_INSTANCE_ROLE_NAME}
        
        rm ec2-trust-policy.json
        print_msg "Role de instancia creado"
        
        # Esperar a que se propague
        sleep 10
    fi
}

create_security_group() {
    print_msg "Creando Security Group..."
    
    # Obtener VPC por defecto
    VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --region ${AWS_REGION})
    
    # Verificar si el security group ya existe
    SG_ID=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=${SECURITY_GROUP_NAME}" \
        --query "SecurityGroups[0].GroupId" \
        --output text \
        --region ${AWS_REGION} 2>/dev/null)
    
    if [ "${SG_ID}" != "None" ] && [ -n "${SG_ID}" ]; then
        print_warning "Security Group ya existe: ${SG_ID}"
    else
        SG_ID=$(aws ec2 create-security-group \
            --group-name ${SECURITY_GROUP_NAME} \
            --description "Security group for ${APP_NAME}" \
            --vpc-id ${VPC_ID} \
            --region ${AWS_REGION} \
            --query 'GroupId' \
            --output text)
        
        # Permitir tráfico en puerto de la app
        aws ec2 authorize-security-group-ingress \
            --group-id ${SG_ID} \
            --protocol tcp \
            --port ${PORT} \
            --cidr 0.0.0.0/0 \
            --region ${AWS_REGION}
        
        # Permitir SSH (opcional, para debugging)
        aws ec2 authorize-security-group-ingress \
            --group-id ${SG_ID} \
            --protocol tcp \
            --port 22 \
            --cidr 0.0.0.0/0 \
            --region ${AWS_REGION}
        
        print_msg "Security Group creado: ${SG_ID}"
    fi
}

create_ecs_cluster() {
    print_msg "Creando cluster ECS..."
    
    if aws ecs describe-clusters --clusters ${ECS_CLUSTER_NAME} --region ${AWS_REGION} 2>/dev/null | grep -q "ACTIVE"; then
        print_warning "Cluster ECS ya existe"
    else
        aws ecs create-cluster \
            --cluster-name ${ECS_CLUSTER_NAME} \
            --region ${AWS_REGION}
        print_msg "Cluster ECS creado: ${ECS_CLUSTER_NAME}"
    fi
}

create_task_definition() {
    print_msg "Creando Task Definition..."
    
    cat > task-definition.json <<EOF
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
      "image": "${ECR_URI}:latest",
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
        "logDriver": "json-file",
        "options": {
          "max-size": "10m",
          "max-file": "3"
        }
      }
    }
  ]
}
EOF
    
    aws ecs register-task-definition \
        --cli-input-json file://task-definition.json \
        --region ${AWS_REGION}
    
    rm task-definition.json
    print_msg "Task Definition registrada"
}

launch_ecs_instance() {
    print_msg "Lanzando instancia EC2 para ECS..."
    
    # Obtener AMI optimizada para ECS
    ECS_AMI=$(aws ssm get-parameters \
        --names /aws/service/ecs/optimized-ami/amazon-linux-2/recommended/image_id \
        --region ${AWS_REGION} \
        --query "Parameters[0].Value" \
        --output text)
    
    print_msg "Usando AMI: ${ECS_AMI}"
    
    # User data para configurar instancia ECS
    cat > user-data.txt <<EOF
#!/bin/bash
echo ECS_CLUSTER=${ECS_CLUSTER_NAME} >> /etc/ecs/ecs.config
EOF
    
    # Obtener subnet por defecto
    SUBNET_ID=$(aws ec2 describe-subnets \
        --filters "Name=vpc-id,Values=${VPC_ID}" "Name=default-for-az,Values=true" \
        --query "Subnets[0].SubnetId" \
        --output text \
        --region ${AWS_REGION})
    
    # Lanzar instancia
    INSTANCE_ID=$(aws ec2 run-instances \
        --image-id ${ECS_AMI} \
        --instance-type ${INSTANCE_TYPE} \
        --key-name ${KEY_PAIR_NAME} \
        --security-group-ids ${SG_ID} \
        --subnet-id ${SUBNET_ID} \
        --iam-instance-profile Name=${ECS_INSTANCE_ROLE_NAME} \
        --user-data file://user-data.txt \
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${APP_NAME}-ecs-instance}]" \
        --region ${AWS_REGION} \
        --query 'Instances[0].InstanceId' \
        --output text)
    
    rm user-data.txt
    
    print_msg "Instancia EC2 lanzada: ${INSTANCE_ID}"
    print_msg "Esperando a que la instancia se registre en el cluster..."
    
    # Esperar a que la instancia se registre
    sleep 60
}

create_ecs_service() {
    print_msg "Creando servicio ECS..."
    
    aws ecs create-service \
        --cluster ${ECS_CLUSTER_NAME} \
        --service-name ${ECS_SERVICE_NAME} \
        --task-definition ${TASK_FAMILY} \
        --desired-count 1 \
        --launch-type EC2 \
        --region ${AWS_REGION}
    
    print_msg "Servicio ECS creado: ${ECS_SERVICE_NAME}"
}

get_public_ip() {
    print_msg "Obteniendo IP pública de la instancia..."
    
    # Obtener ID de instancia del cluster
    INSTANCE_ARN=$(aws ecs list-container-instances \
        --cluster ${ECS_CLUSTER_NAME} \
        --region ${AWS_REGION} \
        --query 'containerInstanceArns[0]' \
        --output text)
    
    if [ -z "${INSTANCE_ARN}" ] || [ "${INSTANCE_ARN}" == "None" ]; then
        print_warning "No se encontró instancia registrada aún. Espera unos minutos."
        return
    fi
    
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
    
    print_msg "IP Pública: ${PUBLIC_IP}"
    echo ""
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}Tu aplicación estará disponible en:${NC}"
    echo -e "${GREEN}http://${PUBLIC_IP}:${PORT}${NC}"
    echo -e "${GREEN}======================================${NC}"
}

##############################################
# MAIN
##############################################

main() {
    print_msg "Iniciando despliegue en AWS ECS..."
    
    #check_aws_cli
    #check_docker
    #get_account_id
    #create_ecr_repository
    #build_and_push_docker
    #create_iam_roles
    #create_security_group
    #create_ecs_cluster
    #create_task_definition
    #launch_ecs_instance
    #create_ecs_service
    
    sleep 10
    get_public_ip
    
    print_msg "¡Despliegue completado!"
    print_warning "IMPORTANTE: Actualiza DATABASE_URL con tu endpoint RDS real"
    print_warning "Recuerda revisar los costos en tu cuenta AWS"
}

# Ejecutar script
main