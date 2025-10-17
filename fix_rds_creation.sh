#!/bin/bash

##############################################
# Script de Reparación para Creación de RDS
##############################################

set -e

AWS_REGION="us-east-1"
APP_NAME="majestic-app"
DB_INSTANCE_IDENTIFIER="${APP_NAME}-postgres"
DB_NAME="health_app"
DB_USERNAME="majestic"
DB_PASSWORD="simple123"
DB_INSTANCE_CLASS="db.t3.micro"
ALLOCATED_STORAGE="20"
DB_PORT="5432"

# Obtener VPC
VPC_ID=$(aws ec2 describe-vpcs \
    --filters "Name=isDefault,Values=true" \
    --query "Vpcs[0].VpcId" \
    --output text \
    --region ${AWS_REGION})

echo "VPC ID: ${VPC_ID}"

# Obtener subnets
SUBNET_IDS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=${VPC_ID}" \
    --query "Subnets[*].SubnetId" \
    --output text \
    --region ${AWS_REGION})

echo "Subnets: ${SUBNET_IDS}"

# Crear DB Subnet Group si no existe
DB_SUBNET_GROUP_NAME="${APP_NAME}-db-subnet-group"

if ! aws rds describe-db-subnet-groups \
    --db-subnet-group-name ${DB_SUBNET_GROUP_NAME} \
    --region ${AWS_REGION} &>/dev/null; then
    
    echo "Creando DB Subnet Group..."
    aws rds create-db-subnet-group \
        --db-subnet-group-name ${DB_SUBNET_GROUP_NAME} \
        --db-subnet-group-description "Subnet group for ${APP_NAME} RDS" \
        --subnet-ids ${SUBNET_IDS} \
        --region ${AWS_REGION}
fi

# Crear Security Group si no existe
DB_SECURITY_GROUP_NAME="${APP_NAME}-rds-sg"

DB_SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=${DB_SECURITY_GROUP_NAME}" \
    --query "SecurityGroups[0].GroupId" \
    --output text \
    --region ${AWS_REGION} 2>/dev/null)

if [ "${DB_SG_ID}" == "None" ] || [ -z "${DB_SG_ID}" ]; then
    echo "Creando RDS Security Group..."
    DB_SG_ID=$(aws ec2 create-security-group \
        --group-name ${DB_SECURITY_GROUP_NAME} \
        --description "Security group for ${APP_NAME} RDS PostgreSQL" \
        --vpc-id ${VPC_ID} \
        --region ${AWS_REGION} \
        --query 'GroupId' \
        --output text)
fi

echo "Security Group ID: ${DB_SG_ID}"

# Intentar crear instancia RDS con configuración mínima
echo ""
echo "Creando instancia RDS con configuración mínima..."
echo "Esto puede tomar 5-10 minutos..."
echo ""

aws rds create-db-instance \
    --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
    --db-instance-class ${DB_INSTANCE_CLASS} \
    --engine postgres \
    --master-username ${DB_USERNAME} \
    --master-user-password ${DB_PASSWORD} \
    --allocated-storage ${ALLOCATED_STORAGE} \
    --db-name ${DB_NAME} \
    --vpc-security-group-ids ${DB_SG_ID} \
    --db-subnet-group-name ${DB_SUBNET_GROUP_NAME} \
    --backup-retention-period 7 \
    --storage-type gp3 \
    --publicly-accessible false \
    --region ${AWS_REGION}

echo ""
echo "✓ Instancia RDS creada exitosamente"
echo ""
echo "Monitorea el estado con:"
echo "aws rds describe-db-instances --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} --region ${AWS_REGION}"
