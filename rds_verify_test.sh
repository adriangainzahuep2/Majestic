#!/bin/bash

# ============================================================================
# Script de Verificación y Pruebas de RDS
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

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

DB_INSTANCE_IDENTIFIER="${1:-health-app}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "============================================================================"
echo "  VERIFICACIÓN DE INSTANCIA RDS"
echo "============================================================================"
echo ""

# ============================================================================
# VERIFICAR EXISTENCIA
# ============================================================================

log_info "Verificando instancia: $DB_INSTANCE_IDENTIFIER"

if ! aws rds describe-db-instances \
    --region $AWS_REGION \
    --db-instance-identifier $DB_INSTANCE_IDENTIFIER &> /dev/null; then
    log_error "La instancia '$DB_INSTANCE_IDENTIFIER' no existe"
    exit 1
fi

log_success "Instancia encontrada"

# ============================================================================
# OBTENER INFORMACIÓN DETALLADA
# ============================================================================

log_info "Obteniendo información detallada..."

DB_INFO=$(aws rds describe-db-instances \
    --region $AWS_REGION \
    --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
    --query 'DBInstances[0]')

STATUS=$(echo $DB_INFO | jq -r '.DBInstanceStatus')
ENDPOINT=$(echo $DB_INFO | jq -r '.Endpoint.Address // "N/A"')
PORT=$(echo $DB_INFO | jq -r '.Endpoint.Port // "N/A"')
ENGINE=$(echo $DB_INFO | jq -r '.Engine')
ENGINE_VERSION=$(echo $DB_INFO | jq -r '.EngineVersion')
STORAGE=$(echo $DB_INFO | jq -r '.AllocatedStorage')
INSTANCE_CLASS=$(echo $DB_INFO | jq -r '.DBInstanceClass')
MULTI_AZ=$(echo $DB_INFO | jq -r '.MultiAZ')
PUBLIC=$(echo $DB_INFO | jq -r '.PubliclyAccessible')
DB_NAME=$(echo $DB_INFO | jq -r '.DBName // "N/A"')

echo ""
echo "📊 Estado de la Instancia"
echo "  Estado: $STATUS"
echo "  Motor: $ENGINE $ENGINE_VERSION"
echo "  Clase: $INSTANCE_CLASS"
echo "  Almacenamiento: ${STORAGE}GB"
echo "  Multi-AZ: $MULTI_AZ"
echo "  Público: $PUBLIC"
echo ""

if [ "$STATUS" != "available" ]; then
    log_warning "La instancia no está disponible (Estado: $STATUS)"
    exit 1
fi

log_success "Instancia disponible"

echo ""
echo "🌐 Información de Conexión"
echo "  Endpoint: $ENDPOINT"
echo "  Puerto: $PORT"
echo "  Base de datos: $DB_NAME"
echo ""

# ============================================================================
# VERIFICAR SECURITY GROUP
# ============================================================================

log_info "Verificando Security Groups..."

SG_IDS=$(echo $DB_INFO | jq -r '.VpcSecurityGroups[].VpcSecurityGroupId' | tr '\n' ' ')

for SG_ID in $SG_IDS; do
    echo "  🔒 Security Group: $SG_ID"
    
    RULES=$(aws ec2 describe-security-groups \
        --region $AWS_REGION \
        --group-ids $SG_ID \
        --query 'SecurityGroups[0].IpPermissions[]')
    
    echo "$RULES" | jq -r '.[] | "    Puerto \(.FromPort)-\(.ToPort) desde \(.IpRanges[0].CidrIp // .Ipv6Ranges[0].CidrIpv6 // "N/A")"'
done

log_success "Security Groups verificados"

# ============================================================================
# VERIFICAR SUBNET GROUP
# ============================================================================

log_info "Verificando DB Subnet Group..."

SUBNET_GROUP=$(echo $DB_INFO | jq -r '.DBSubnetGroup.DBSubnetGroupName')
SUBNETS=$(echo $DB_INFO | jq -r '.DBSubnetGroup.Subnets[].SubnetIdentifier' | wc -l)

echo "  📍 Subnet Group: $SUBNET_GROUP"
echo "  📍 Subnets: $SUBNETS"

log_success "Subnet Group verificado"

# ============================================================================
# PRUEBA DE CONECTIVIDAD (si tiene endpoint público)
# ============================================================================

if [ "$PUBLIC" == "true" ] && [ "$ENDPOINT" != "N/A" ]; then
    log_info "Probando conectividad al endpoint..."
    
    if command -v nc &> /dev/null; then
        if nc -z -w5 $ENDPOINT $PORT 2>/dev/null; then
            log_success "Puerto $PORT accesible en $ENDPOINT"
        else
            log_warning "No se puede conectar al puerto $PORT"
            echo "  Posibles causas:"
            echo "    - Security Group no permite tu IP"
            echo "    - La instancia aún no está completamente lista"
            echo "    - Firewall local bloqueando conexiones"
        fi
    else
        log_warning "Comando 'nc' no disponible. Instálalo para probar conectividad"
    fi
fi

# ============================================================================
# VERIFICAR BACKUPS
# ============================================================================

log_info "Verificando configuración de backups..."

BACKUP_RETENTION=$(echo $DB_INFO | jq -r '.BackupRetentionPeriod')
BACKUP_WINDOW=$(echo $DB_INFO | jq -r '.PreferredBackupWindow')

echo "  💾 Retención: $BACKUP_RETENTION días"
echo "  💾 Ventana: $BACKUP_WINDOW"

log_success "Configuración de backups verificada"

# ============================================================================
# VERIFICAR MÉTRICAS (últimas 1 hora)
# ============================================================================

log_info "Obteniendo métricas recientes..."

END_TIME=$(date -u +"%Y-%m-%dT%H:%M:%S")
START_TIME=$(date -u -d '1 hour ago' +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || date -u -v-1H +"%Y-%m-%dT%H:%M:%S")

# CPU
CPU=$(aws cloudwatch get-metric-statistics \
    --region $AWS_REGION \
    --namespace AWS/RDS \
    --metric-name CPUUtilization \
    --dimensions Name=DBInstanceIdentifier,Value=$DB_INSTANCE_IDENTIFIER \
    --start-time $START_TIME \
    --end-time $END_TIME \
    --period 3600 \
    --statistics Average \
    --query 'Datapoints[0].Average' \
    --output text 2>/dev/null || echo "N/A")

# Conexiones
CONNECTIONS=$(aws cloudwatch get-metric-statistics \
    --region $AWS_REGION \
    --namespace AWS/RDS \
    --metric-name DatabaseConnections \
    --dimensions Name=DBInstanceIdentifier,Value=$DB_INSTANCE_IDENTIFIER \
    --start-time $START_TIME \
    --end-time $END_TIME \
    --period 3600 \
    --statistics Average \
    --query 'Datapoints[0].Average' \
    --output text 2>/dev/null || echo "N/A")

echo "  📈 CPU promedio (última hora): ${CPU}%"
echo "  📈 Conexiones promedio: $CONNECTIONS"

# ============================================================================
# LISTAR SNAPSHOTS
# ============================================================================

log_info "Verificando snapshots..."

SNAPSHOT_COUNT=$(aws rds describe-db-snapshots \
    --region $AWS_REGION \
    --db-instance-identifier $DB_INSTANCE_IDENTIFIER \
    --query 'length(DBSnapshots)' \
    --output text 2>/dev/null || echo "0")

echo "  📸 Snapshots disponibles: $SNAPSHOT_COUNT"

# ============================================================================
# RESUMEN FINAL
# ============================================================================

echo ""
echo "============================================================================"
log_success "VERIFICACIÓN COMPLETADA"
echo "============================================================================"
echo ""

if [ "$STATUS" == "available" ] && [ "$ENDPOINT" != "N/A" ]; then
    echo "✅ La instancia está funcionando correctamente"
    echo ""
    echo "Prueba de conexión PostgreSQL:"
    echo "  psql -h $ENDPOINT -p $PORT -U <username> -d $DB_NAME"
    echo ""
    echo "Cadena de conexión:"
    echo "  postgresql://<username>:<password>@$ENDPOINT:$PORT/$DB_NAME"
else
    log_warning "La instancia puede tener problemas. Revisa los detalles arriba."
fi

echo ""
echo "Para más detalles, visita AWS Console:"
echo "  https://console.aws.amazon.com/rds/home?region=$AWS_REGION#database:id=$DB_INSTANCE_IDENTIFIER"
echo ""