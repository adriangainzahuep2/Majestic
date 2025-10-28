#!/bin/bash

##############################################
# Script de Configuración RDS PostgreSQL
# Crea base de datos PostgreSQL en AWS RDS
# Crea automáticamente Security Groups necesarios
##############################################

set -e

# Colores para output
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

# Configuración general
AWS_REGION="us-east-1"
APP_NAME="majestic-app"

# Configuración RDS
DB_INSTANCE_IDENTIFIER="${APP_NAME}-postgres"
DB_NAME="health_app"
DB_USERNAME="majestic"
DB_PASSWORD="simple123"  # CAMBIAR EN PRODUCCIÓN
DB_PORT="5432"

# Configuración de instancia
DB_INSTANCE_CLASS="db.t3.micro"  # Capa gratuita elegible (20GB gratis)
ALLOCATED_STORAGE="20"  # GB
ENGINE_VERSION="15.8"  # PostgreSQL 15.8

# Security Group
DB_SECURITY_GROUP_NAME="${APP_NAME}-rds-sg"
ECS_SECURITY_GROUP_NAME="${APP_NAME}-sg"
ALB_SECURITY_GROUP_NAME="${APP_NAME}-alb-sg"

# Subnet Group
DB_SUBNET_GROUP_NAME="${APP_NAME}-db-subnet-group"

# Backup y mantenimiento
BACKUP_RETENTION_PERIOD="7"  # días
PREFERRED_BACKUP_WINDOW="03:00-04:00"  # UTC
PREFERRED_MAINTENANCE_WINDOW="mon:04:00-mon:05:00"  # UTC

# Alta disponibilidad
MULTI_AZ="false"  # true para producción, false para desarrollo (más económico)
PUBLICLY_ACCESSIBLE="false"  # false es más seguro

##############################################
# FUNCIONES
##############################################

check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI no está instalado"
        exit 1
    fi
    print_msg "AWS CLI encontrado: $(aws --version)"
}

get_account_id() {
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    print_msg "AWS Account ID: ${ACCOUNT_ID}"
}

get_vpc_info() {
    print_msg "Obteniendo información de VPC..."
    
    # Obtener VPC por defecto
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
    
    # Obtener subnets
    SUBNET_IDS=$(aws ec2 describe-subnets \
        --filters "Name=vpc-id,Values=${VPC_ID}" \
        --query "Subnets[*].SubnetId" \
        --output text \
        --region ${AWS_REGION})
    
    print_msg "Subnets encontradas: ${SUBNET_IDS}"
}

create_or_get_alb_security_group() {
    print_msg "Verificando/Creando Security Group de ALB..."
    
    # Verificar si ya existe
    ALB_SG_ID=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=${ALB_SECURITY_GROUP_NAME}" \
        --query "SecurityGroups[0].GroupId" \
        --output text \
        --region ${AWS_REGION} 2>/dev/null)
    
    if [ "${ALB_SG_ID}" != "None" ] && [ -n "${ALB_SG_ID}" ]; then
        print_msg "Security Group ALB ya existe: ${ALB_SG_ID}"
        return
    fi
    
    # Crear security group para ALB
    ALB_SG_ID=$(aws ec2 create-security-group \
        --group-name ${ALB_SECURITY_GROUP_NAME} \
        --description "Security group for ${APP_NAME} Application Load Balancer" \
        --vpc-id ${VPC_ID} \
        --region ${AWS_REGION} \
        --query 'GroupId' \
        --output text)
    
    print_msg "Security Group ALB creado: ${ALB_SG_ID}"
    
    # Permitir tráfico HTTP desde internet
    aws ec2 authorize-security-group-ingress \
        --group-id ${ALB_SG_ID} \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0 \
        --region ${AWS_REGION}
    
    print_msg "Regla HTTP (puerto 80) agregada al ALB Security Group"
    
    # Permitir tráfico HTTPS desde internet (opcional)
    aws ec2 authorize-security-group-ingress \
        --group-id ${ALB_SG_ID} \
        --protocol tcp \
        --port 443 \
        --cidr 0.0.0.0/0 \
        --region ${AWS_REGION} 2>/dev/null || true
    
    print_msg "Regla HTTPS (puerto 443) agregada al ALB Security Group"
}

create_or_get_ecs_security_group() {
    print_msg "Verificando/Creando Security Group de ECS..."
    
    # Verificar si ya existe
    ECS_SG_ID=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=${ECS_SECURITY_GROUP_NAME}" \
        --query "SecurityGroups[0].GroupId" \
        --output text \
        --region ${AWS_REGION} 2>/dev/null)
    
    if [ "${ECS_SG_ID}" != "None" ] && [ -n "${ECS_SG_ID}" ]; then
        print_msg "Security Group ECS ya existe: ${ECS_SG_ID}"
        return
    fi
    
    # Crear security group para ECS
    ECS_SG_ID=$(aws ec2 create-security-group \
        --group-name ${ECS_SECURITY_GROUP_NAME} \
        --description "Security group for ${APP_NAME} ECS instances" \
        --vpc-id ${VPC_ID} \
        --region ${AWS_REGION} \
        --query 'GroupId' \
        --output text)
    
    print_msg "Security Group ECS creado: ${ECS_SG_ID}"
    
    # Permitir tráfico desde ALB al puerto de la aplicación (5000)
    aws ec2 authorize-security-group-ingress \
        --group-id ${ECS_SG_ID} \
        --protocol tcp \
        --port 5000 \
        --source-group ${ALB_SG_ID} \
        --region ${AWS_REGION}
    
    print_msg "Regla de ingreso agregada: Puerto 5000 desde ALB"
    
    # Permitir SSH (opcional, para debugging)
    read -p "¿Deseas permitir acceso SSH (puerto 22) a las instancias ECS? (yes/no): " ALLOW_SSH
    if [ "${ALLOW_SSH}" == "yes" ]; then
        MY_IP=$(curl -s https://checkip.amazonaws.com)
        aws ec2 authorize-security-group-ingress \
            --group-id ${ECS_SG_ID} \
            --protocol tcp \
            --port 22 \
            --cidr ${MY_IP}/32 \
            --region ${AWS_REGION}
        print_msg "Acceso SSH permitido desde tu IP: ${MY_IP}"
    fi
    
    # Permitir todo el tráfico de salida (necesario para RDS, internet, etc.)
    aws ec2 authorize-security-group-egress \
        --group-id ${ECS_SG_ID} \
        --protocol all \
        --cidr 0.0.0.0/0 \
        --region ${AWS_REGION} 2>/dev/null || print_msg "Regla de salida por defecto ya existe"
}

create_db_subnet_group() {
    print_msg "Creando DB Subnet Group..."
    
    # Verificar si ya existe
    if aws rds describe-db-subnet-groups \
        --db-subnet-group-name ${DB_SUBNET_GROUP_NAME} \
        --region ${AWS_REGION} 2>/dev/null; then
        print_warning "DB Subnet Group ya existe"
        return
    fi
    
    # Convertir string de subnets a array
    SUBNET_ARRAY=(${SUBNET_IDS})
    
    # Crear subnet group con al menos 2 subnets (requerido por RDS)
    if [ ${#SUBNET_ARRAY[@]} -lt 2 ]; then
        print_error "Se requieren al menos 2 subnets en diferentes zonas de disponibilidad"
        exit 1
    fi
    
    aws rds create-db-subnet-group \
        --db-subnet-group-name ${DB_SUBNET_GROUP_NAME} \
        --db-subnet-group-description "Subnet group for ${APP_NAME} RDS" \
        --subnet-ids ${SUBNET_IDS} \
        --region ${AWS_REGION}
    
    print_msg "DB Subnet Group creado: ${DB_SUBNET_GROUP_NAME}"
}

create_db_security_group() {
    print_msg "Creando Security Group para RDS..."
    
    # Verificar si ya existe
    DB_SG_ID=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=${DB_SECURITY_GROUP_NAME}" \
        --query "SecurityGroups[0].GroupId" \
        --output text \
        --region ${AWS_REGION} 2>/dev/null)
    
    if [ "${DB_SG_ID}" != "None" ] && [ -n "${DB_SG_ID}" ]; then
        print_warning "Security Group RDS ya existe: ${DB_SG_ID}"
        
        # Verificar y agregar regla de ECS si no existe
        print_msg "Verificando reglas de ingreso existentes..."
        add_ecs_to_rds_rule
        return
    fi
    
    # Crear security group
    DB_SG_ID=$(aws ec2 create-security-group \
        --group-name ${DB_SECURITY_GROUP_NAME} \
        --description "Security group for ${APP_NAME} RDS PostgreSQL" \
        --vpc-id ${VPC_ID} \
        --region ${AWS_REGION} \
        --query 'GroupId' \
        --output text)
    
    print_msg "Security Group RDS creado: ${DB_SG_ID}"
    
    # Permitir tráfico PostgreSQL desde ECS
    add_ecs_to_rds_rule
    
    # Opcional: Permitir acceso desde tu IP (para desarrollo/debugging)
    read -p "¿Deseas permitir acceso a RDS desde tu IP actual? (yes/no): " ALLOW_MY_IP
    if [ "${ALLOW_MY_IP}" == "yes" ]; then
        MY_IP=$(curl -s https://checkip.amazonaws.com)
        aws ec2 authorize-security-group-ingress \
            --group-id ${DB_SG_ID} \
            --protocol tcp \
            --port ${DB_PORT} \
            --cidr ${MY_IP}/32 \
            --region ${AWS_REGION}
        print_msg "Acceso permitido desde tu IP: ${MY_IP}"
    fi
}

add_ecs_to_rds_rule() {
    if [ -z "${ECS_SG_ID}" ]; then
        print_error "ECS Security Group no encontrado"
        return 1
    fi
    
    # Intentar agregar la regla (si ya existe, fallará silenciosamente)
    if aws ec2 authorize-security-group-ingress \
        --group-id ${DB_SG_ID} \
        --protocol tcp \
        --port ${DB_PORT} \
        --source-group ${ECS_SG_ID} \
        --region ${AWS_REGION} 2>/dev/null; then
        print_msg "Regla de ingreso agregada: PostgreSQL desde ECS Security Group"
    else
        print_msg "Regla de ingreso desde ECS ya existe"
    fi
}

create_rds_instance() {
    print_msg "Creando instancia RDS PostgreSQL..."
    
    # Verificar si ya existe
    if aws rds describe-db-instances \
        --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
        --region ${AWS_REGION} &>/dev/null; then
        print_warning "Instancia RDS ya existe"
        return
    fi
    
    # Validar que tenemos todos los prerequisitos
    if [ -z "${DB_SG_ID}" ]; then
        print_error "DB Security Group ID no está definido"
        exit 1
    fi
    
    if [ -z "${DB_SUBNET_GROUP_NAME}" ]; then
        print_error "DB Subnet Group no está definido"
        exit 1
    fi
    
    print_msg "Configuración para RDS:"
    print_msg "  - Instance ID: ${DB_INSTANCE_IDENTIFIER}"
    print_msg "  - Instance Class: ${DB_INSTANCE_CLASS}"
    print_msg "  - Engine: postgres ${ENGINE_VERSION}"
    print_msg "  - Storage: ${ALLOCATED_STORAGE}GB GP3"
    print_msg "  - Security Group: ${DB_SG_ID}"
    print_msg "  - Subnet Group: ${DB_SUBNET_GROUP_NAME}"
    print_msg "  - Multi-AZ: ${MULTI_AZ}"
    echo ""
    
    # Crear instancia RDS con manejo de errores mejorado
    print_msg "Ejecutando creación de instancia RDS..."
    
    if ! aws rds create-db-instance \
        --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
        --db-instance-class ${DB_INSTANCE_CLASS} \
        --engine postgres \
        --engine-version ${ENGINE_VERSION} \
        --master-username ${DB_USERNAME} \
        --master-user-password ${DB_PASSWORD} \
        --allocated-storage ${ALLOCATED_STORAGE} \
        --db-name ${DB_NAME} \
        --vpc-security-group-ids ${DB_SG_ID} \
        --db-subnet-group-name ${DB_SUBNET_GROUP_NAME} \
        --backup-retention-period ${BACKUP_RETENTION_PERIOD} \
        --preferred-backup-window ${PREFERRED_BACKUP_WINDOW} \
        --preferred-maintenance-window ${PREFERRED_MAINTENANCE_WINDOW} \
        --multi-az ${MULTI_AZ} \
        --publicly-accessible ${PUBLICLY_ACCESSIBLE} \
        --storage-type gp3 \
        --storage-encrypted \
        --enable-cloudwatch-logs-exports postgresql \
        --deletion-protection \
        --tags Key=Name,Value=${DB_INSTANCE_IDENTIFIER} Key=Environment,Value=production \
        --region ${AWS_REGION} 2>&1 | tee rds-creation-output.log; then
        
        print_error "Error al crear instancia RDS"
        echo ""
        print_msg "Detalles del error guardados en: rds-creation-output.log"
        echo ""
        print_warning "Posibles causas:"
        echo "  1. Límite de instancias RDS alcanzado en tu cuenta"
        echo "  2. Engine version ${ENGINE_VERSION} no disponible en ${AWS_REGION}"
        echo "  3. Subnet Group con problemas de configuración"
        echo "  4. Permisos IAM insuficientes"
        echo ""
        print_msg "Intenta con estas soluciones:"
        echo "  - Verifica versiones disponibles: aws rds describe-db-engine-versions --engine postgres --query 'DBEngineVersions[].EngineVersion'"
        echo "  - Verifica límites: aws service-quotas get-service-quota --service-code rds --quota-code L-7B6409FD"
        echo "  - Verifica subnets: aws rds describe-db-subnet-groups --db-subnet-group-name ${DB_SUBNET_GROUP_NAME}"
        exit 1
    fi
    
    print_success "¡Solicitud de creación enviada exitosamente!"
    print_msg "Instancia RDS: ${DB_INSTANCE_IDENTIFIER}"
    print_msg "Esperando a que la instancia esté disponible (esto puede tomar 5-10 minutos)..."
    echo ""
    
    # Esperar a que esté disponible con mejor feedback
    local wait_count=0
    local max_wait=60  # 60 intentos = ~10 minutos
    
    while [ $wait_count -lt $max_wait ]; do
        STATUS=$(aws rds describe-db-instances \
            --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
            --region ${AWS_REGION} \
            --query 'DBInstances[0].DBInstanceStatus' \
            --output text 2>/dev/null)
        
        if [ "${STATUS}" == "available" ]; then
            print_success "¡Instancia RDS disponible!"
            return 0
        elif [ "${STATUS}" == "creating" ]; then
            echo -ne "\r[INFO] Estado: ${STATUS} ... ($((wait_count * 10)) segundos transcurridos)"
        elif [ "${STATUS}" == "backing-up" ]; then
            echo -ne "\r[INFO] Estado: ${STATUS} ... ($((wait_count * 10)) segundos transcurridos)"
        elif [ -n "${STATUS}" ]; then
            echo -ne "\r[INFO] Estado: ${STATUS} ... ($((wait_count * 10)) segundos transcurridos)"
        fi
        
        sleep 10
        wait_count=$((wait_count + 1))
    done
    
    echo ""
    print_warning "Tiempo de espera agotado. La instancia aún se está creando."
    print_msg "Puedes verificar el estado con:"
    echo "  aws rds describe-db-instances --db-instance-identifier ${DB_INSTANCE_IDENTIFIER}"
}

get_rds_endpoint() {
    print_msg "Obteniendo endpoint de RDS..."
    
    DB_ENDPOINT=$(aws rds describe-db-instances \
        --db-instance-identifier ${DB_INSTANCE_IDENTIFIER} \
        --region ${AWS_REGION} \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text)
    
    if [ -z "${DB_ENDPOINT}" ] || [ "${DB_ENDPOINT}" == "None" ]; then
        print_error "No se pudo obtener el endpoint de RDS"
        exit 1
    fi
    
    print_msg "Endpoint RDS: ${DB_ENDPOINT}"
}

display_connection_info() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  INFORMACIÓN DE CONEXIÓN RDS${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}Host:${NC}     ${DB_ENDPOINT}"
    echo -e "${BLUE}Puerto:${NC}   ${DB_PORT}"
    echo -e "${BLUE}Database:${NC} ${DB_NAME}"
    echo -e "${BLUE}Usuario:${NC}  ${DB_USERNAME}"
    echo -e "${BLUE}Password:${NC} ${DB_PASSWORD}"
    echo ""
    echo -e "${YELLOW}DATABASE_URL para tu aplicación:${NC}"
    echo -e "${GREEN}postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_ENDPOINT}:${DB_PORT}/${DB_NAME}${NC}"
    echo ""
    echo -e "${GREEN}========================================${NC}"
    
    # Guardar en archivo
    cat > rds-connection-info.txt <<EOF
RDS Connection Information
==========================

Host:     ${DB_ENDPOINT}
Port:     ${DB_PORT}
Database: ${DB_NAME}
Username: ${DB_USERNAME}
Password: ${DB_PASSWORD}

DATABASE_URL:
postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_ENDPOINT}:${DB_PORT}/${DB_NAME}

Security Groups creados:
- ALB SG:  ${ALB_SG_ID} (${ALB_SECURITY_GROUP_NAME})
- ECS SG:  ${ECS_SG_ID} (${ECS_SECURITY_GROUP_NAME})
- RDS SG:  ${DB_SG_ID} (${DB_SECURITY_GROUP_NAME})

Flujo de tráfico configurado:
Internet -> ALB (puerto 80/443) -> ECS (puerto 5000) -> RDS (puerto 5432)

Para actualizar tu deployment ECS:
1. Usa el script update_ecs_db_script.sh:
   ./update_ecs_db_script.sh

2. O manualmente:
   - Edita deploy-ecs-basic.sh
   - Actualiza la variable DATABASE_URL con el valor de arriba
   - Re-despliega con: ./deploy-ecs-basic.sh

Para conectarte localmente (si habilitaste acceso desde tu IP):
psql "postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_ENDPOINT}:${DB_PORT}/${DB_NAME}"

Costos estimados (Free Tier - primer año):
- db.t3.micro: Primeros 750 hrs/mes GRATIS, después ~$15-20/mes
- Storage 20GB: Primeros 20GB GRATIS, después ~$2.30/mes
- Backup: Incluido en capa gratuita (hasta 20GB)
- Total después del Free Tier: ~$17-22/mes

IMPORTANTE - Seguridad:
- CAMBIA la contraseña en producción
- deletion-protection está ACTIVADO
- Backups automáticos configurados (7 días)
- Conexiones encriptadas (SSL)
- No accesible públicamente
EOF
    
    print_msg "Información guardada en: rds-connection-info.txt"
}

display_security_group_summary() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  RESUMEN DE SECURITY GROUPS${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "${GREEN}1. ALB Security Group (${ALB_SG_ID})${NC}"
    echo "   - Ingreso: Puerto 80 y 443 desde Internet (0.0.0.0/0)"
    echo "   - Egreso: Hacia ECS en puerto 5000"
    echo ""
    echo -e "${GREEN}2. ECS Security Group (${ECS_SG_ID})${NC}"
    echo "   - Ingreso: Puerto 5000 desde ALB"
    echo "   - Egreso: Todo el tráfico (necesario para RDS, internet, etc.)"
    echo ""
    echo -e "${GREEN}3. RDS Security Group (${DB_SG_ID})${NC}"
    echo "   - Ingreso: Puerto 5432 desde ECS"
    if [ "${ALLOW_MY_IP}" == "yes" ]; then
        echo "   - Ingreso: Puerto 5432 desde tu IP (${MY_IP})"
    fi
    echo "   - Egreso: No requiere (RDS es solo receptor)"
    echo ""
}

test_connection() {
    read -p "¿Deseas probar la conexión a la base de datos? (requiere psql instalado) (yes/no): " TEST_CONN
    
    if [ "${TEST_CONN}" == "yes" ]; then
        if ! command -v psql &> /dev/null; then
            print_warning "psql no está instalado. Instálalo para probar la conexión."
            echo "  Ubuntu/Debian: sudo apt-get install postgresql-client"
            echo "  macOS: brew install postgresql"
            return
        fi
        
        print_msg "Probando conexión..."
        
        export PGPASSWORD=${DB_PASSWORD}
        if psql -h ${DB_ENDPOINT} -U ${DB_USERNAME} -d ${DB_NAME} -p ${DB_PORT} -c "SELECT version();" 2>/dev/null; then
            print_success "¡Conexión exitosa!"
        else
            print_warning "No se pudo conectar. Esto es normal si:"
            echo "  - No habilitaste acceso desde tu IP"
            echo "  - Estás fuera de la VPC"
            echo "  La conexión desde ECS funcionará correctamente."
        fi
        unset PGPASSWORD
    fi
}

show_next_steps() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  PRÓXIMOS PASOS${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "1. Actualiza tu deployment ECS con la nueva DATABASE_URL:"
    echo "   ${GREEN}./update_ecs_db_script.sh${NC}"
    echo ""
    echo "2. O actualiza manualmente deploy-ecs-basic.sh y re-despliega"
    echo ""
    echo "3. Verifica que los Security Groups estén asignados correctamente:"
    echo "   - ALB debe usar: ${ALB_SG_ID}"
    echo "   - Instancias ECS deben usar: ${ECS_SG_ID}"
    echo "   - RDS usa: ${DB_SG_ID}"
    echo ""
    echo "4. Monitorea tu instancia RDS en:"
    echo "   https://console.aws.amazon.com/rds"
    echo ""
    echo "5. Verifica logs de conexión en CloudWatch:"
    echo "   /ecs/${APP_NAME}"
    echo ""
    echo -e "${YELLOW}RECORDATORIOS DE SEGURIDAD:${NC}"
    echo "✓ Cambia la contraseña de DB en producción"
    echo "✓ deletion-protection está activado"
    echo "✓ Backups automáticos configurados"
    echo "✓ Encriptación habilitada"
    echo "✓ No accesible públicamente"
    echo ""
}

##############################################
# MAIN
##############################################

main() {
    echo ""
    echo "=========================================="
    echo "  Setup Completo RDS + Security Groups"
    echo "=========================================="
    echo ""
    
    print_msg "Iniciando configuración de RDS PostgreSQL..."
    
    check_aws_cli
    get_account_id
    get_vpc_info
    
    # Crear Security Groups en orden correcto
    create_or_get_alb_security_group
    create_or_get_ecs_security_group
    create_db_subnet_group
    create_db_security_group
    
    # Crear RDS
    create_rds_instance
    get_rds_endpoint
    
    # Mostrar información
    display_connection_info
    display_security_group_summary
    test_connection
    show_next_steps
    
    print_success "¡Configuración completada exitosamente!"
}

# Ejecutar script
main