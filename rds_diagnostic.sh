#!/bin/bash

##############################################
# Script de Diagnóstico RDS
# Identifica problemas con la creación de RDS
##############################################

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_msg() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_success() {
    echo -e "${BLUE}[SUCCESS]${NC} $1"
}

##############################################
# CONFIGURACIÓN
##############################################

AWS_REGION="us-east-1"
APP_NAME="majestic-app"
DB_INSTANCE_IDENTIFIER="health-app"
DB_SUBNET_GROUP_NAME="${APP_NAME}-db-subnet-group"
DB_SECURITY_GROUP_NAME="${APP_NAME}-rds-sg"

##############################################
# FUNCIONES DE DIAGNÓSTICO
##############################################

check_aws_cli() {
    echo ""
    echo "=========================================="
    echo "  1. Verificando AWS CLI"
    echo "=========================================="
    
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI no está instalado"
        echo "Instala desde: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
        exit 1
    fi
    
    AWS_VERSION=$(aws --version 2>&1)
    print_success "AWS CLI instalado: ${AWS_VERSION}"
    
    # Verificar credenciales
    if aws sts get-caller-identity &>/dev/null; then
        ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
        USER_ARN=$(aws sts get-caller-identity --query Arn --output text)
        print_success "Credenciales válidas"
        print_msg "  Account ID: ${ACCOUNT_ID}"
        print_msg "  User/Role: ${USER_ARN}"
    else
        print_error "Credenciales de AWS no configuradas o inválidas"
        echo "Configura con: aws configure"
        exit 1
    fi
}

check_vpc_and_subnets() {
    echo ""
    echo "=========================================="
    echo "  2. Verificando VPC y Subnets"
    echo "=========================================="
    
    # Verificar VPC por defecto
    VPC_ID=$(aws ec2 describe-vpcs \
        --filters "Name=isDefault,Values=true" \
        --query "Vpcs[0].VpcId" \
        --output text \
        --region ${AWS_REGION} 2>/dev/null)
    
    if [ -z "${VPC_ID}" ] || [ "${VPC_ID}" == "None" ]; then
        print_error "No se encontró VPC por defecto"
        print_msg "VPCs disponibles:"
        aws ec2 describe-vpcs --region ${AWS_REGION} --query 'Vpcs[].{ID:VpcId,CIDR:CidrBlock,Default:IsDefault}' --output table
        return 1
    fi
    
    print_success "VPC encontrada: ${VPC_ID}"
    
    # Verificar subnets
    SUBNETS=$(aws ec2 describe-subnets \
        --filters "Name=vpc-id,Values=${VPC_ID}" \
        --query 'Subnets[].{ID:SubnetId,AZ:AvailabilityZone,CIDR:CidrBlock}' \
        --output table \
        --region ${AWS_REGION})
    
    SUBNET_COUNT=$(aws ec2 describe-subnets \
        --filters "Name=vpc-id,Values=${VPC_ID}" \
        --query 'Subnets | length(@)' \
        --output text \
        --region ${AWS_REGION})
    
    if [ "${SUBNET_COUNT}" -lt 2 ]; then
        print_error "RDS requiere al menos 2 subnets en diferentes Availability Zones"
        print_msg "Subnets encontradas: ${SUBNET_COUNT}"
        echo "${SUBNETS}"
        return 1
    fi
    
    print_success "Subnets encontradas: ${SUBNET_COUNT}"
    echo "${SUBNETS}"
}

check_db_subnet_group() {
    echo ""
    echo "=========================================="
    echo "  3. Verificando DB Subnet Group"
    echo "=========================================="
    
    if aws rds describe-db-subnet-groups \
        --db-subnet-group-name ${DB_SUBNET_GROUP_NAME} \
        --region ${AWS_REGION} &>/dev/null; then
        
        print_success "DB Subnet Group existe: ${DB_SUBNET_GROUP_NAME}"
        
        SUBNET_INFO=$(aws rds describe-db-subnet-groups \
            --db-subnet-group-name ${DB_SUBNET_GROUP_NAME} \
            --region ${AWS_REGION} \
            --query 'DBSubnetGroups[0].Subnets[].{SubnetId:SubnetIdentifier,AZ:SubnetAvailabilityZone.Name,Status:SubnetStatus}' \
            --output table)
        
        echo "${SUBNET_INFO}"
    else
        print_warning "DB Subnet Group no existe: ${DB_SUBNET_GROUP_NAME}"
        print_msg "Será creado automáticamente por el script rds_setup"
    fi
}

check_security_groups() {
    echo ""
    echo "=========================================="
    echo "  4. Verificando Security Groups"
    echo "=========================================="
    
    # RDS Security Group
    DB_SG_ID=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=${DB_SECURITY_GROUP_NAME}" \
        --query "SecurityGroups[0].GroupId" \
        --output text \
        --region ${AWS_REGION} 2>/dev/null)
    
    if [ "${DB_SG_ID}" != "None" ] && [ -n "${DB_SG_ID}" ]; then
        print_success "RDS Security Group existe: ${DB_SG_ID}"
        
        # Mostrar reglas
        print_msg "Reglas de ingreso:"
        aws ec2 describe-security-groups \
            --group-ids ${DB_SG_ID} \
            --query 'SecurityGroups[0].IpPermissions[].[FromPort,ToPort,IpProtocol,IpRanges[].CidrIp,UserIdGroupPairs[].GroupId]' \
            --output table \
            --region ${AWS_REGION}
    else
        print_warning "RDS Security Group no existe: ${DB_SECURITY_GROUP_NAME}"
        print_msg "Será creado automáticamente por el script rds_setup"
    fi
}

check_postgres_versions() {
    echo ""
    echo "=========================================="
    echo "  5. Verificando Versiones de PostgreSQL"
    echo "=========================================="
    
    print_msg "Versiones de PostgreSQL disponibles en ${AWS_REGION}:"
    
    VERSIONS=$(aws rds describe-db-engine-versions \
    --engine postgres \
    --query "DBEngineVersions[?starts_with(EngineVersion, '17')].EngineVersion" \
    --output text \
    --region ${AWS_REGION})
    
    if [ -z "${VERSIONS}" ]; then
        print_error "No se encontraron versiones de PostgreSQL 17"
        print_msg "Obteniendo todas las versiones disponibles..."
        aws rds describe-db-engine-versions \
            --engine postgres \
            --query 'DBEngineVersions[].EngineVersion' \
            --output table \
            --region ${AWS_REGION}
    else
        echo "${VERSIONS}" | tr '\t' '\n'
        print_success "PostgreSQL 17 disponible"
    fi
}

check_rds_limits() {
    echo ""
    echo "=========================================="
    echo "  6. Verificando Límites y Cuotas RDS"
    echo "=========================================="
    
    # Instancias RDS existentes
    EXISTING_INSTANCES=$(aws rds describe-db-instances \
        --region ${AWS_REGION} \
        --query 'DBInstances[].{ID:DBInstanceIdentifier,Class:DBInstanceClass,Status:DBInstanceStatus}' \
        --output table 2>/dev/null)
    
    INSTANCE_COUNT=$(aws rds describe-db-instances \
        --region ${AWS_REGION} \
        --query 'DBInstances | length(@)' \
        --output text 2>/dev/null)
    
    print_msg "Instancias RDS existentes: ${INSTANCE_COUNT}"
    
    if [ "${INSTANCE_COUNT}" -gt 0 ]; then
        echo "${EXISTING_INSTANCES}"
    fi
    
    # Verificar cuota (requiere Service Quotas)
    print_msg "Verificando límite de instancias DB..."
    
    if aws service-quotas get-service-quota \
        --service-code rds \
        --quota-code L-7B6409FD \
        --region ${AWS_REGION} &>/dev/null; then
        
        QUOTA=$(aws service-quotas get-service-quota \
            --service-code rds \
            --quota-code L-7B6409FD \
            --region ${AWS_REGION} \
            --query 'Quota.Value' \
            --output text)
        
        print_msg "Límite de instancias DB: ${QUOTA}"
        
        if [ "${INSTANCE_COUNT}" -ge "${QUOTA}" ]; then
            print_error "Has alcanzado el límite de instancias RDS"
            print_msg "Solicita aumento de cuota en: https://console.aws.amazon.com/servicequotas"
        fi
    else
        print_warning "No se pudo verificar cuota (permisos insuficientes o Service Quotas no disponible)"
    fi
}

check_iam_permissions() {
    echo ""
    echo "=========================================="
    echo "  7. Verificando Permisos IAM"
    echo "=========================================="
    
    print_msg "Verificando permisos necesarios..."
    
    # Intentar operaciones de lectura
    PERMS_OK=true
    
    if aws rds describe-db-instances --region ${AWS_REGION} &>/dev/null; then
        print_success "✓ rds:DescribeDBInstances"
    else
        print_error "✗ rds:DescribeDBInstances"
        PERMS_OK=false
    fi
    
    if aws ec2 describe-vpcs --region ${AWS_REGION} &>/dev/null; then
        print_success "✓ ec2:DescribeVpcs"
    else
        print_error "✗ ec2:DescribeVpcs"
        PERMS_OK=false
    fi
    
    if aws ec2 describe-security-groups --region ${AWS_REGION} &>/dev/null; then
        print_success "✓ ec2:DescribeSecurityGroups"
    else
        print_error "✗ ec2:DescribeSecurityGroups"
        PERMS_OK=false
    fi
    
    if [ "$PERMS_OK" = false ]; then
        print_error "Permisos insuficientes. Necesitas una política IAM como:"
        echo ""
        echo "AmazonRDSFullAccess + AmazonEC2FullAccess"
        echo "O una política personalizada con permisos específicos"
    fi
}

check_existing_rds() {
    echo ""
    echo "=========================================="
    echo "  8. Buscando Instancia RDS Objetivo"
    echo "=========================================="
    
    print_msg "Buscando: ${DB_INSTANCE_IDENTIFIER}"
    
    if aws rds describe-db-instances \
        --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
        --region ${AWS_REGION} &>/dev/null; then
        
        print_success "¡Instancia RDS encontrada!"
        
        STATUS=$(aws rds describe-db-instances \
            --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
            --region ${AWS_REGION} \
            --query 'DBInstances[0].DBInstanceStatus' \
            --output text)
        
        ENDPOINT=$(aws rds describe-db-instances \
            --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
            --region ${AWS_REGION} \
            --query 'DBInstances[0].Endpoint.Address' \
            --output text)
        
        print_msg "Estado: ${STATUS}"
        print_msg "Endpoint: ${ENDPOINT}"
        
        aws rds describe-db-instances \
            --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
            --region ${AWS_REGION} \
            --query 'DBInstances[0].{Class:DBInstanceClass,Engine:Engine,Version:EngineVersion,Storage:AllocatedStorage,MultiAZ:MultiAZ}' \
            --output table
    else
        print_warning "Instancia RDS no encontrada: ${DB_INSTANCE_IDENTIFIER}"
        print_msg "Esta instancia necesita ser creada"
    fi
}

check_recent_events() {
    echo ""
    echo "=========================================="
    echo "  9. Eventos Recientes de RDS"
    echo "=========================================="
    
    print_msg "Buscando eventos recientes relacionados con ${APP_NAME}..."
    
    EVENTS=$(aws rds describe-events \
        --duration 1440 \
        --region ${AWS_REGION} \
        --query 'Events[?contains(SourceIdentifier, `'${APP_NAME}'`)].{Time:Date,Source:SourceIdentifier,Message:Message}' \
        --output table 2>/dev/null)
    
    if [ -n "${EVENTS}" ] && [ "${EVENTS}" != "None" ]; then
        echo "${EVENTS}"
    else
        print_msg "No hay eventos recientes"
    fi
}

generate_fix_script() {
    echo ""
    echo "=========================================="
    echo "  10. Generando Script de Reparación"
    echo "=========================================="
    
    cat > fix_rds_creation.sh <<'EOF'
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
EOF
    
    chmod +x fix_rds_creation.sh
    print_success "Script de reparación creado: fix_rds_creation.sh"
}

##############################################
# MAIN
##############################################

main() {
    echo ""
    echo "╔════════════════════════════════════════╗"
    echo "║   Diagnóstico de Problemas RDS         ║"
    echo "╚════════════════════════════════════════╝"
    
    check_aws_cli
    check_vpc_and_subnets
    check_db_subnet_group
    check_security_groups
    check_postgres_versions
    check_rds_limits
    check_iam_permissions
    check_existing_rds
    check_recent_events
    generate_fix_script
    
    echo ""
    echo "=========================================="
    echo "  RESUMEN Y RECOMENDACIONES"
    echo "=========================================="
    echo ""
    print_msg "Diagnóstico completado"
    echo ""
    print_msg "Si todos los checks pasaron, ejecuta:"
    echo "  ./rds_setup_improved.sh"
    echo ""
    print_msg "Si hubo problemas, ejecuta el script de reparación:"
    echo "  ./fix_rds_creation.sh"
    echo ""
    print_msg "Para más información sobre RDS:"
    echo "  https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/"
    echo ""
}

main