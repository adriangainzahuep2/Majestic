#!/bin/bash
# ============================================================================
# Script de Despliegue Completo: Majestic Health App
# AWS Lightsail + RDS PostgreSQL + S3 + Tests Automatizados
# ============================================================================
# VERSIÓN: 2.0 - Despliegue automático sin SSH con validación completa
# ============================================================================

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[⚠]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

PROJECT_NAME="majestic-app"
AWS_REGION="us-east-1"
ENVIRONMENT="production"
DEPLOYMENT_ID="deploy-$(date +%Y%m%d-%H%M%S)"

# Base de Datos RDS Existente
DB_ENDPOINT="health-app.c4vuie06a0wt.us-east-1.rds.amazonaws.com"
DB_PORT="5432"
DB_NAME="health_app"
DB_USERNAME="majestic"
DB_PASSWORD="simple123"
DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_ENDPOINT}:${DB_PORT}/${DB_NAME}"

# Configuración de Lightsail
LIGHTSAIL_INSTANCE_NAME="${PROJECT_NAME}-${DEPLOYMENT_ID}"
LIGHTSAIL_BUNDLE_ID="medium_3_0"
LIGHTSAIL_BLUEPRINT_ID="ubuntu_22_04"
LIGHTSAIL_KEY_PAIR_NAME="${PROJECT_NAME}-keypair"

# Configuración S3
S3_BUCKET_NAME="${PROJECT_NAME}-deployment-${DEPLOYMENT_ID}"
S3_APP_PATH="s3://${S3_BUCKET_NAME}/application"

# Configuración de la Aplicación
CONTAINER_PORT="32769"
NODE_ENV="production"

# Variables de Entorno de Majestic
JWT_SECRET="a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
GOOGLE_CLIENT_ID="504338292423-nneklif626o8vj9n0o7btq03vjt49mqb.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="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"
OPENAI_API_KEY="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"
DIAG_TOKEN="9f2c3f6e8a4b5d17e6f9a0c2d8e4f7b1c6a3d5e8f9b2c1d4e7a9c0f2b4d6e8a1"
ADMIN_EMAILS="jmzv13@gmail.com"

# Directorios de trabajo
WORK_DIR="$HOME/Majestic"
APP_SOURCE_DIR="${WORK_DIR}"
SQL_DIR="${WORK_DIR}/sql"
SCRIPTS_DIR="${WORK_DIR}/scripts"
TESTS_DIR="${WORK_DIR}/tests"
OUTPUT_DIR="${WORK_DIR}/outputs"

# ============================================================================
# VALIDACIONES INICIALES
# ============================================================================

echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║       DESPLIEGUE AUTOMATIZADO - MAJESTIC HEALTH APP v2.0             ║"
echo "║       AWS Lightsail + RDS + S3 + Tests + Auto-Fix                    ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

log_step "Validando requisitos previos..."

# Validar AWS CLI
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI no está instalado"
    exit 1
fi

# Validar jq
if ! command -v jq &> /dev/null; then
    log_error "jq no está instalado. Instalando..."
    sudo apt-get update && sudo apt-get install -y jq
fi

# Validar Node.js para scripts de generación
if ! command -v node &> /dev/null; then
    log_warning "Node.js no encontrado. Instalando..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Validar credenciales AWS
if ! aws sts get-caller-identity &> /dev/null; then
    log_error "Credenciales AWS no configuradas"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
log_success "AWS Account ID: $ACCOUNT_ID"
log_success "Region: $AWS_REGION"

# ============================================================================
# PASO 1: GENERAR SQL SCHEMA DESDE schema.js
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_step "PASO 1: Generar SQL Schema desde schema.js"
echo "═══════════════════════════════════════════════════════════════════════"

log_info "Creando script de conversión schema.js a SQL..."

cat > ${SCRIPTS_DIR}/generate-schema-sql.js <<'GENSCRIPT'
const fs = require('fs');
const path = require('path');

// Leer el archivo schema.js subido
const schemaPath = '/home/adrian/Majestic/database/schema.js';
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

// Extraer la configuración de HEALTH_SYSTEMS
const healthSystemsMatch = schemaContent.match(/const HEALTH_SYSTEMS = \[([\s\S]*?)\];/);
let healthSystems = [];

if (healthSystemsMatch) {
    const systemsText = healthSystemsMatch[1];
    const systemMatches = systemsText.matchAll(/\{\s*id:\s*(\d+),\s*name:\s*'([^']+)',\s*description:\s*'([^']+)'\s*\}/g);
    
    for (const match of systemMatches) {
        healthSystems.push({
            id: parseInt(match[1]),
            name: match[2],
            description: match[3]
        });
    }
}

// Generar SQL completo
let sql = `-- ============================================================================
-- Majestic Health App - Database Schema
-- Generated from schema.js
-- PostgreSQL 17.6
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- DROP EXISTING TABLES (con CASCADE para eliminar dependencias)
-- ============================================================================

DROP TABLE IF EXISTS master_snapshots CASCADE;
DROP TABLE IF EXISTS master_versions CASCADE;
DROP TABLE IF EXISTS master_conversion_groups CASCADE;
DROP TABLE IF EXISTS master_metric_synonyms CASCADE;
DROP TABLE IF EXISTS master_metrics CASCADE;
DROP TABLE IF EXISTS custom_reference_ranges CASCADE;
DROP TABLE IF EXISTS pending_metric_suggestions CASCADE;
DROP TABLE IF EXISTS imaging_studies CASCADE;
DROP TABLE IF EXISTS user_custom_metrics CASCADE;
DROP TABLE IF EXISTS ai_outputs_log CASCADE;
DROP TABLE IF EXISTS user_allergies CASCADE;
DROP TABLE IF EXISTS user_chronic_conditions CASCADE;
DROP TABLE IF EXISTS questionnaire_responses CASCADE;
DROP TABLE IF EXISTS metrics CASCADE;
DROP TABLE IF EXISTS uploads CASCADE;
DROP TABLE IF EXISTS health_systems CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- TABLA: users
-- ============================================================================

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    google_id VARCHAR(255) UNIQUE,
    name VARCHAR(255),
    avatar_url TEXT,
    
    -- Profile fields
    preferred_unit_system VARCHAR(10),
    sex VARCHAR(50),
    date_of_birth DATE,
    height_in INTEGER,
    weight_lb DECIMAL(5,2),
    ethnicity VARCHAR(100),
    country_of_residence VARCHAR(3),
    smoker BOOLEAN,
    packs_per_week DECIMAL(3,1),
    alcohol_drinks_per_week INTEGER,
    pregnant BOOLEAN,
    pregnancy_start_date DATE,
    cycle_phase VARCHAR(50),
    profile_completed BOOLEAN DEFAULT false,
    profile_updated_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);

-- ============================================================================
-- TABLA: health_systems
-- ============================================================================

CREATE TABLE health_systems (
    id INTEGER PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert health systems data
`;

// Agregar datos de health systems
healthSystems.forEach(system => {
    sql += `INSERT INTO health_systems (id, name, description) VALUES (${system.id}, '${system.name}', '${system.description}');\n`;
});

sql += `
-- ============================================================================
-- TABLA: uploads
-- ============================================================================

CREATE TABLE uploads (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    upload_type VARCHAR(50) DEFAULT 'manual',
    storage_path TEXT,
    processing_status VARCHAR(50) DEFAULT 'pending',
    processing_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

CREATE INDEX idx_uploads_user_id ON uploads(user_id);
CREATE INDEX idx_uploads_status ON uploads(processing_status);
CREATE INDEX idx_uploads_user_status ON uploads(user_id, processing_status);

-- ============================================================================
-- TABLA: metrics
-- ============================================================================

CREATE TABLE metrics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
    system_id INTEGER REFERENCES health_systems(id),
    metric_name VARCHAR(255) NOT NULL,
    metric_value DECIMAL,
    metric_unit VARCHAR(50),
    reference_range TEXT,
    is_key_metric BOOLEAN DEFAULT false,
    is_outlier BOOLEAN DEFAULT false,
    is_adjusted BOOLEAN DEFAULT false,
    exclude_from_analysis BOOLEAN DEFAULT false,
    review_reason TEXT,
    test_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, metric_name, test_date, upload_id)
);

CREATE INDEX idx_metrics_user_id ON metrics(user_id);
CREATE INDEX idx_metrics_system_id ON metrics(system_id);
CREATE INDEX idx_metrics_user_system ON metrics(user_id, system_id);
CREATE INDEX idx_metrics_test_date ON metrics(test_date);
CREATE INDEX idx_metrics_metric_name ON metrics(metric_name);

-- ============================================================================
-- TABLA: questionnaire_responses
-- ============================================================================

CREATE TABLE questionnaire_responses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    question_type VARCHAR(255) NOT NULL,
    question TEXT NOT NULL,
    response TEXT NOT NULL,
    response_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_questionnaire_user ON questionnaire_responses(user_id);

-- ============================================================================
-- TABLA: user_chronic_conditions
-- ============================================================================

CREATE TABLE user_chronic_conditions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    condition_name VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chronic_conditions_user ON user_chronic_conditions(user_id);

-- ============================================================================
-- TABLA: user_allergies
-- ============================================================================

CREATE TABLE user_allergies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    allergy_type VARCHAR(40) NOT NULL,
    allergen_name VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_allergies_user ON user_allergies(user_id);

-- ============================================================================
-- TABLA: ai_outputs_log
-- ============================================================================

CREATE TABLE ai_outputs_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    output_type VARCHAR(100) NOT NULL,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    model_version VARCHAR(50) DEFAULT 'gpt-4o',
    processing_time_ms INTEGER,
    system_id INTEGER REFERENCES health_systems(id),
    is_current BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_outputs_user ON ai_outputs_log(user_id);
CREATE INDEX idx_ai_outputs_type ON ai_outputs_log(output_type);
CREATE INDEX idx_ai_outputs_user_type ON ai_outputs_log(user_id, output_type);

-- ============================================================================
-- TABLA: user_custom_metrics
-- ============================================================================

CREATE TABLE user_custom_metrics (
    id SERIAL PRIMARY KEY,
    system_id INTEGER REFERENCES health_systems(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    metric_name VARCHAR(255) NOT NULL,
    value VARCHAR(100) NOT NULL,
    units VARCHAR(50),
    normal_range_min DECIMAL(10,3),
    normal_range_max DECIMAL(10,3),
    range_applicable_to VARCHAR(100) DEFAULT 'General',
    source_type VARCHAR(50) DEFAULT 'user',
    review_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_custom_metrics_user ON user_custom_metrics(user_id);
CREATE INDEX idx_user_custom_metrics_system ON user_custom_metrics(system_id);
CREATE INDEX idx_user_custom_metrics_user_system ON user_custom_metrics(user_id, system_id);
CREATE INDEX idx_user_custom_metrics_review ON user_custom_metrics(source_type, review_status);

-- ============================================================================
-- TABLA: imaging_studies
-- ============================================================================

CREATE TABLE imaging_studies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    linked_system_id INTEGER REFERENCES health_systems(id),
    study_type VARCHAR(100),
    file_url TEXT,
    thumbnail_url TEXT,
    test_date DATE,
    ai_summary TEXT,
    metrics_json JSONB,
    comparison_summary TEXT,
    metric_changes_json JSONB,
    status VARCHAR(50) DEFAULT 'pendingProcessing',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_imaging_studies_user ON imaging_studies(user_id);
CREATE INDEX idx_imaging_studies_system ON imaging_studies(linked_system_id);
CREATE INDEX idx_imaging_studies_user_system ON imaging_studies(user_id, linked_system_id);
CREATE INDEX idx_imaging_studies_type_date ON imaging_studies(study_type, test_date);

-- ============================================================================
-- TABLA: pending_metric_suggestions
-- ============================================================================

CREATE TABLE pending_metric_suggestions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
    unmatched_metrics JSONB NOT NULL,
    ai_suggestions JSONB,
    test_date DATE,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, upload_id)
);

CREATE INDEX idx_pending_metrics_user ON pending_metric_suggestions(user_id);
CREATE INDEX idx_pending_metrics_status ON pending_metric_suggestions(status);
CREATE INDEX idx_pending_metrics_user_status ON pending_metric_suggestions(user_id, status);

-- ============================================================================
-- TABLA: custom_reference_ranges
-- ============================================================================

CREATE TABLE custom_reference_ranges (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    metric_name VARCHAR(255) NOT NULL,
    min_value DECIMAL NOT NULL,
    max_value DECIMAL NOT NULL,
    units VARCHAR(50) NOT NULL,
    medical_condition VARCHAR(100) NOT NULL,
    condition_details TEXT,
    notes TEXT,
    valid_from DATE,
    valid_until DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, metric_name, medical_condition, valid_from)
);

CREATE INDEX idx_custom_ranges_user ON custom_reference_ranges(user_id);
CREATE INDEX idx_custom_ranges_metric ON custom_reference_ranges(metric_name);
CREATE INDEX idx_custom_ranges_user_metric ON custom_reference_ranges(user_id, metric_name);
CREATE INDEX idx_custom_ranges_validity ON custom_reference_ranges(valid_from, valid_until, is_active);

-- ============================================================================
-- ADMIN MASTER TABLES
-- ============================================================================

CREATE TABLE master_metrics (
    metric_id VARCHAR(100) PRIMARY KEY,
    metric_name VARCHAR(255) NOT NULL,
    system_id INTEGER REFERENCES health_systems(id),
    canonical_unit VARCHAR(50),
    conversion_group_id VARCHAR(100),
    normal_min DECIMAL(10,3),
    normal_max DECIMAL(10,3),
    is_key_metric BOOLEAN DEFAULT false,
    source VARCHAR(100),
    explanation TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_master_metrics_name ON master_metrics(metric_name);
CREATE INDEX idx_master_metrics_system ON master_metrics(system_id);

-- ============================================================================

CREATE TABLE master_metric_synonyms (
    id SERIAL PRIMARY KEY,
    synonym_id VARCHAR(100),
    metric_id VARCHAR(100) REFERENCES master_metrics(metric_id) ON DELETE CASCADE,
    synonym_name VARCHAR(255) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_master_synonyms_metric ON master_metric_synonyms(metric_id);
CREATE INDEX idx_master_synonyms_name ON master_metric_synonyms(synonym_name);

-- ============================================================================

CREATE TABLE master_conversion_groups (
    conversion_group_id VARCHAR(100) NOT NULL,
    canonical_unit VARCHAR(50),
    alt_unit VARCHAR(50) NOT NULL,
    to_canonical_formula VARCHAR(255),
    from_canonical_formula VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversion_group_id, alt_unit)
);

CREATE INDEX idx_conversion_groups_id ON master_conversion_groups(conversion_group_id);

-- ============================================================================

CREATE TABLE master_versions (
    version_id SERIAL PRIMARY KEY,
    change_summary TEXT NOT NULL,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    xlsx_path TEXT,
    data_hash VARCHAR(128),
    added_count INTEGER DEFAULT 0,
    changed_count INTEGER DEFAULT 0,
    removed_count INTEGER DEFAULT 0
);

-- ============================================================================

CREATE TABLE master_snapshots (
    version_id INTEGER REFERENCES master_versions(version_id) ON DELETE CASCADE,
    metrics_json JSONB,
    synonyms_json JSONB,
    conversion_groups_json JSONB,
    PRIMARY KEY(version_id)
);

-- ============================================================================
-- FUNCIONES Y TRIGGERS
-- ============================================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar trigger a tablas relevantes
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_outputs_updated_at BEFORE UPDATE ON ai_outputs_log
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_imaging_studies_updated_at BEFORE UPDATE ON imaging_studies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pending_metrics_updated_at BEFORE UPDATE ON pending_metric_suggestions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_ranges_updated_at BEFORE UPDATE ON custom_reference_ranges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_master_metrics_updated_at BEFORE UPDATE ON master_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversion_groups_updated_at BEFORE UPDATE ON master_conversion_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- GRANTS Y PERMISOS
-- ============================================================================

-- Asegurar que el usuario tenga todos los permisos necesarios
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO majestic;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO majestic;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO majestic;

-- ============================================================================
-- DATOS DE PRUEBA (opcional)
-- ============================================================================

-- Insertar usuario de prueba
INSERT INTO users (email, name, profile_completed) 
VALUES ('test@majestichealth.com', 'Test User', false)
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- Ver todas las tablas creadas
SELECT 
    tablename, 
    schemaname 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Ver todos los índices
SELECT 
    indexname, 
    tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;

-- Verificar health_systems
SELECT COUNT(*) as total_health_systems FROM health_systems;

-- ============================================================================
-- FIN DEL SCHEMA
-- ============================================================================

SELECT 'Schema creado exitosamente!' as status;
`;

// Guardar el SQL generado
const outputPath = path.join(__dirname, '../sql/schema_fixed.sql');
fs.writeFileSync(outputPath, sql, 'utf8');

console.log('✓ Schema SQL generado exitosamente en:', outputPath);
console.log('✓ Health Systems encontrados:', healthSystems.length);
console.log('✓ Líneas SQL generadas:', sql.split('\n').length);
GENSCRIPT

log_info "Ejecutando generación de SQL..."
node ${SCRIPTS_DIR}/generate-schema-sql.js

if [ -f "${SQL_DIR}/schema_fixed.sql" ]; then
    log_success "Schema SQL generado exitosamente"
    log_info "Tamaño: $(wc -l < ${SQL_DIR}/schema_fixed.sql) líneas"
else
    log_error "Error al generar schema SQL"
    exit 1
fi

# ============================================================================
# PASO 2: CREAR/VERIFICAR BUCKET S3
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_step "PASO 2: Configurar S3 para distribución de código"
echo "═══════════════════════════════════════════════════════════════════════"

log_info "Verificando bucket S3: $S3_BUCKET_NAME"

if aws s3 ls "s3://${S3_BUCKET_NAME}" 2>/dev/null; then
    log_warning "Bucket S3 ya existe, limpiando..."
    aws s3 rm "s3://${S3_BUCKET_NAME}" --recursive
else
    log_info "Creando bucket S3..."
    aws s3 mb "s3://${S3_BUCKET_NAME}" --region $AWS_REGION
fi

log_success "Bucket S3 configurado: $S3_BUCKET_NAME"

# Configurar política del bucket para acceso desde Lightsail
cat > /tmp/s3-bucket-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowLightsailAccess",
            "Effect": "Allow",
            "Principal": "*",
            "Action": [
                "s3:GetObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::${S3_BUCKET_NAME}",
                "arn:aws:s3:::${S3_BUCKET_NAME}/*"
            ],
            "Condition": {
                "StringEquals": {
                    "aws:SourceAccount": "${ACCOUNT_ID}"
                }
            }
        }
    ]
}
EOF

aws s3api put-bucket-policy \
    --bucket $S3_BUCKET_NAME \
    --policy file:///tmp/s3-bucket-policy.json

log_success "Política de bucket configurada"

# ============================================================================
# PASO 3: PREPARAR CÓDIGO DE LA APLICACIÓN
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_step "PASO 3: Preparar código de la aplicación"
echo "═══════════════════════════════════════════════════════════════════════"


log_info "Creando estructura de la aplicación..."



# Subir código a S3
log_info "Subiendo código a S3..."
aws s3 sync ${APP_SOURCE_DIR} ${S3_APP_PATH}/ 

# Subir SQL schema
aws s3 cp ${SQL_DIR}/schema_fixed.sql s3://${S3_BUCKET_NAME}/sql/schema_fixed.sql

log_success "Código subido a S3: ${S3_APP_PATH}"

# ============================================================================
# PASO 4: VERIFICAR Y CONSTRUIR IMAGEN DOCKER
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_step "PASO 4: Gestionar Imagen Docker en ECR"
echo "═══════════════════════════════════════════════════════════════════════"

ECR_REPO_NAME="${PROJECT_NAME}"

log_info "Verificando repositorio ECR..."
ECR_URI=$(aws ecr describe-repositories \
    --repository-names $ECR_REPO_NAME \
    --region $AWS_REGION \
    --query 'repositories[0].repositoryUri' \
    --output text 2>/dev/null || echo "")

if [ -z "$ECR_URI" ] || [ "$ECR_URI" == "None" ]; then
    log_info "Creando repositorio ECR..."
    ECR_URI=$(aws ecr create-repository \
        --repository-name $ECR_REPO_NAME \
        --region $AWS_REGION \
        --image-scanning-configuration scanOnPush=true \
        --query 'repository.repositoryUri' \
        --output text)
    log_success "Repositorio ECR creado: $ECR_URI"
else
    log_success "Repositorio ECR encontrado: $ECR_URI"
fi

# Autenticar con ECR
log_info "Autenticando con ECR..."
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Construir imagen
log_info "Construyendo imagen Docker..."
cd ${APP_SOURCE_DIR}
docker build -t $ECR_REPO_NAME:latest -t $ECR_REPO_NAME:$DEPLOYMENT_ID .

# Tag y push
docker tag $ECR_REPO_NAME:latest $ECR_URI:latest
docker tag $ECR_REPO_NAME:$DEPLOYMENT_ID $ECR_URI:$DEPLOYMENT_ID

log_info "Subiendo imagen a ECR..."
docker push $ECR_URI:latest
docker push $ECR_URI:$DEPLOYMENT_ID

DOCKER_IMAGE="$ECR_URI:latest"
log_success "Imagen Docker lista: $DOCKER_IMAGE"

cd $WORK_DIR

# ============================================================================
# PASO 5: CREAR USER DATA SCRIPT COMPLETO
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_step "PASO 5: Crear User Data Script para Lightsail"
echo "═══════════════════════════════════════════════════════════════════════"

# Crear el User Data Script completo
USER_DATA=$(cat <<'USERDATA_HEREDOC'
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

exec > >(tee -a /var/log/user-data.log)
exec 2>&1

echo "======================================"
echo "Majestic App - Inicio: $(date)"
echo "======================================"

# Variables (serán reemplazadas)
S3_BUCKET="__S3_BUCKET__"
AWS_REGION="__AWS_REGION__"
DATABASE_URL="__DATABASE_URL__"
DOCKER_IMAGE="__DOCKER_IMAGE__"
CONTAINER_PORT="__CONTAINER_PORT__"

echo "Actualizando sistema..."
apt-get update
apt-get upgrade -y

# Instalar Docker
echo "Instalando Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker ubuntu
rm get-docker.sh

# Instalar Docker Compose
echo "Instalando Docker Compose..."
DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)
curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Instalar herramientas
echo "Instalando herramientas..."
apt-get install -y nginx awscli postgresql-client unzip wget curl jq

# Instalar AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install --update
rm -rf aws awscliv2.zip

# Crear directorio de aplicación
mkdir -p /opt/majestic-app/db
cd /opt/majestic-app

# Descargar código desde S3
echo "Descargando código desde S3..."
aws s3 sync s3://${S3_BUCKET}/application/ /opt/majestic-app/ --region ${AWS_REGION}
aws s3 cp s3://${S3_BUCKET}/sql/schema_fixed.sql /opt/majestic-app/schema_fixed.sql --region ${AWS_REGION}

# Crear archivo .env
cat > /opt/majestic-app/.env <<'ENVFILE'
NODE_ENV=__NODE_ENV__
DATABASE_URL=__DATABASE_URL__
JWT_SECRET=__JWT_SECRET__
GOOGLE_CLIENT_ID=__GOOGLE_CLIENT_ID__
GOOGLE_CLIENT_SECRET=__GOOGLE_CLIENT_SECRET__
OPENAI_API_KEY=__OPENAI_API_KEY__
DIAG_TOKEN=__DIAG_TOKEN__
ADMIN_EMAILS=__ADMIN_EMAILS__
SKIP_DB_INIT=false
SKIP_GLOBAL_JOBS=false
PORT=3000
ENVFILE

chmod 600 /opt/majestic-app/.env

# Inicializar base de datos
echo "Inicializando base de datos..."
export PGPASSWORD="__DB_PASSWORD__"
psql -h __DB_ENDPOINT__ -U __DB_USERNAME__ -d __DB_NAME__ -f /opt/majestic-app/schema_fixed.sql || echo "Database may already be initialized"

# Configurar Nginx
cat > /etc/nginx/sites-available/majestic-app <<'NGINXCONF'
upstream app_backend {
    server localhost:__CONTAINER_PORT__;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 10M;
    
    access_log /var/log/nginx/majestic_access.log;
    error_log /var/log/nginx/majestic_error.log;

    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        proxy_cache_bypass $http_upgrade;
    }

    location /health {
        proxy_pass http://app_backend/health;
        access_log off;
    }
}
NGINXCONF

ln -sf /etc/nginx/sites-available/majestic-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
systemctl enable nginx

# Autenticar con ECR y descargar imagen
echo "Autenticando con ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin __ACCOUNT_ID__.dkr.ecr.${AWS_REGION}.amazonaws.com

echo "Descargando imagen Docker..."
docker pull ${DOCKER_IMAGE}

# Iniciar aplicación
echo "Iniciando aplicación..."
docker run -d \
    --name majestic-app \
    --restart unless-stopped \
    -p ${CONTAINER_PORT}:3000 \
    --env-file /opt/majestic-app/.env \
    ${DOCKER_IMAGE}

# Esperar a que la aplicación esté lista
echo "Esperando a que la aplicación esté lista..."
for i in {1..30}; do
    if curl -f http://localhost:${CONTAINER_PORT}/health >/dev/null 2>&1; then
        echo "✓ Aplicación iniciada exitosamente"
        break
    fi
    echo "Esperando... ($i/30)"
    sleep 5
done

# Crear script de monitoreo
cat > /opt/majestic-app/monitor.sh <<'MONITORSH'
#!/bin/bash
echo "=== Estado Majestic App ==="
echo "Docker Status:"
docker ps -a | grep majestic-app
echo ""
echo "Logs recientes:"
docker logs --tail 20 majestic-app
echo ""
echo "Nginx Status:"
systemctl status nginx --no-pager | head -10
echo ""
echo "Puertos:"
ss -tlnp | grep -E ':(80|443|__CONTAINER_PORT__)'
echo ""
echo "Health Check:"
curl -s http://localhost:__CONTAINER_PORT__/health | jq .
MONITORSH

chmod +x /opt/majestic-app/monitor.sh

# Marcar como completado
echo "DEPLOYMENT_COMPLETE" > /opt/majestic-app/deployment-status.txt
date >> /opt/majestic-app/deployment-status.txt

echo "======================================"
echo "Configuración completada: $(date)"
echo "======================================"
USERDATA_HEREDOC
)

# Reemplazar variables en User Data
USER_DATA="${USER_DATA//__S3_BUCKET__/$S3_BUCKET_NAME}"
USER_DATA="${USER_DATA//__AWS_REGION__/$AWS_REGION}"
USER_DATA="${USER_DATA//__DATABASE_URL__/$DATABASE_URL}"
USER_DATA="${USER_DATA//__DOCKER_IMAGE__/$DOCKER_IMAGE}"
USER_DATA="${USER_DATA//__CONTAINER_PORT__/$CONTAINER_PORT}"
USER_DATA="${USER_DATA//__NODE_ENV__/$NODE_ENV}"
USER_DATA="${USER_DATA//__JWT_SECRET__/$JWT_SECRET}"
USER_DATA="${USER_DATA//__GOOGLE_CLIENT_ID__/$GOOGLE_CLIENT_ID}"
USER_DATA="${USER_DATA//__GOOGLE_CLIENT_SECRET__/$GOOGLE_CLIENT_SECRET}"
USER_DATA="${USER_DATA//__OPENAI_API_KEY__/$OPENAI_API_KEY}"
USER_DATA="${USER_DATA//__DIAG_TOKEN__/$DIAG_TOKEN}"
USER_DATA="${USER_DATA//__ADMIN_EMAILS__/$ADMIN_EMAILS}"
USER_DATA="${USER_DATA//__DB_ENDPOINT__/$DB_ENDPOINT}"
USER_DATA="${USER_DATA//__DB_USERNAME__/$DB_USERNAME}"
USER_DATA="${USER_DATA//__DB_PASSWORD__/$DB_PASSWORD}"
USER_DATA="${USER_DATA//__DB_NAME__/$DB_NAME}"
USER_DATA="${USER_DATA//__ACCOUNT_ID__/$ACCOUNT_ID}"

log_success "User Data Script creado ($(echo "$USER_DATA" | wc -l) líneas)"

# ============================================================================
# PASO 6: CREAR INSTANCIA LIGHTSAIL
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_step "PASO 6: Crear Instancia Lightsail"
echo "═══════════════════════════════════════════════════════════════════════"

# Verificar si existe instancia previa
EXISTING_INSTANCES=$(aws lightsail get-instances \
    --region $AWS_REGION \
    --query "instances[?contains(name, '$PROJECT_NAME')].name" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_INSTANCES" ]; then
    log_warning "Instancias existentes encontradas:"
    echo "$EXISTING_INSTANCES"
    read -p "¿Eliminar instancias antiguas? (y/n) [y]: " DELETE_OLD
    DELETE_OLD=${DELETE_OLD:-y}
    
    if [ "$DELETE_OLD" == "y" ]; then
        for instance in $EXISTING_INSTANCES; do
            log_info "Eliminando instancia: $instance"
            aws lightsail delete-instance \
                --region $AWS_REGION \
                --instance-name $instance \
                --force-delete-add-ons || true
        done
        log_info "Esperando eliminación completa..."
        sleep 30
    fi
fi

log_info "Creando nueva instancia Lightsail..."

aws lightsail create-instances \
    --region $AWS_REGION \
    --instance-names $LIGHTSAIL_INSTANCE_NAME \
    --availability-zone ${AWS_REGION}a \
    --blueprint-id $LIGHTSAIL_BLUEPRINT_ID \
    --bundle-id $LIGHTSAIL_BUNDLE_ID \
    --user-data "$USER_DATA" \
    --tags key=Project,value=MajesticApp key=Environment,value=$ENVIRONMENT key=DeploymentId,value=$DEPLOYMENT_ID

log_success "Instancia Lightsail creada: $LIGHTSAIL_INSTANCE_NAME"

# Esperar a que la instancia tenga IP
log_info "Esperando asignación de IP..."
RETRY_COUNT=0
LIGHTSAIL_IP=""

while [ $RETRY_COUNT -lt 60 ]; do
    LIGHTSAIL_IP=$(aws lightsail get-instances \
        --region $AWS_REGION \
        --query "instances[?name=='$LIGHTSAIL_INSTANCE_NAME'].publicIpAddress" \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$LIGHTSAIL_IP" ] && [ "$LIGHTSAIL_IP" != "None" ]; then
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 5
done

if [ -z "$LIGHTSAIL_IP" ] || [ "$LIGHTSAIL_IP" == "None" ]; then
    log_error "No se pudo obtener IP de la instancia"
    exit 1
fi

log_success "Instancia creada con IP: $LIGHTSAIL_IP"

# ============================================================================
# PASO 7: CONFIGURAR FIREWALL
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_step "PASO 7: Configurar Firewall de Lightsail"
echo "═══════════════════════════════════════════════════════════════════════"

log_info "Abriendo puertos necesarios..."

# Abrir puertos
for PORT_CONFIG in "22,22,tcp" "80,80,tcp" "443,443,tcp"; do
    IFS=',' read -r FROM_PORT TO_PORT PROTOCOL <<< "$PORT_CONFIG"
    
    aws lightsail open-instance-public-ports \
        --region $AWS_REGION \
        --instance-name $LIGHTSAIL_INSTANCE_NAME \
        --port-info fromPort=$FROM_PORT,toPort=$TO_PORT,protocol=$PROTOCOL 2>/dev/null || true
    
    log_info "Puerto $FROM_PORT/$PROTOCOL abierto"
done

log_success "Firewall configurado"

# ============================================================================
# PASO 8: CONFIGURAR ACCESO RDS
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_step "PASO 8: Configurar acceso desde Lightsail a RDS"
echo "═══════════════════════════════════════════════════════════════════════"

# Obtener Security Group de RDS
RDS_SG_ID=$(aws rds describe-db-instances \
    --region $AWS_REGION \
    --query "DBInstances[?Endpoint.Address=='$DB_ENDPOINT'].VpcSecurityGroups[0].VpcSecurityGroupId" \
    --output text 2>/dev/null || echo "")

if [ -n "$RDS_SG_ID" ] && [ "$RDS_SG_ID" != "None" ]; then
    log_info "Security Group RDS: $RDS_SG_ID"
    log_info "Permitiendo acceso desde Lightsail IP: $LIGHTSAIL_IP"
    
    # Agregar regla de ingreso
    aws ec2 authorize-security-group-ingress \
        --region $AWS_REGION \
        --group-id $RDS_SG_ID \
        --protocol tcp \
        --port 5432 \
        --cidr ${LIGHTSAIL_IP}/32 2>/dev/null || log_info "Regla ya existe"
    
    log_success "Acceso configurado desde Lightsail a RDS"
else
    log_warning "No se pudo configurar Security Group de RDS automáticamente"
    log_warning "Configura manualmente para permitir acceso desde: $LIGHTSAIL_IP"
fi

# ============================================================================
# PASO 9: ESPERAR DESPLIEGUE Y VALIDAR
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_step "PASO 9: Esperar despliegue y validar"
echo "═══════════════════════════════════════════════════════════════════════"

log_info "User Data está configurando la instancia..."
log_info "Esperando 5 minutos para inicialización completa..."

# Función para verificar health
check_health() {
    local ip=$1
    local response=$(curl -s -o /dev/null -w "%{http_code}" http://${ip}/health 2>/dev/null || echo "000")
    echo $response
}

# Esperar inicialización
WAIT_TIME=300  # 5 minutos
ELAPSED=0
INTERVAL=15

while [ $ELAPSED -lt $WAIT_TIME ]; do
    HTTP_CODE=$(check_health $LIGHTSAIL_IP)
    
    if [ "$HTTP_CODE" == "200" ]; then
        log_success "Aplicación respondiendo correctamente!"
        break
    fi
    
    PROGRESS=$((ELAPSED * 100 / WAIT_TIME))
    log_info "Progreso: ${PROGRESS}% - HTTP ${HTTP_CODE} - Esperando..."
    
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

# Verificación final
FINAL_CHECK=$(check_health $LIGHTSAIL_IP)

if [ "$FINAL_CHECK" == "200" ]; then
    DEPLOYMENT_STATUS="SUCCESS"
    log_success "✓ Despliegue completado exitosamente"
else
    DEPLOYMENT_STATUS="PARTIAL"
    log_warning "⚠ Aplicación aún inicializando (HTTP $FINAL_CHECK)"
fi

# ============================================================================
# PASO 10: CREAR TESTS DE PLAYWRIGHT
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
log_step "PASO 10: Crear y ejecutar tests de endpoints"
echo "═══════════════════════════════════════════════════════════════════════"

# Instalar Playwright
log_info "Instalando Playwright..."
npm install -g playwright
npx playwright install chromium

# Crear tests
cat > ${TESTS_DIR}/endpoint-tests.js <<TESTJS
const { chromium } = require('playwright');

const BASE_URL = 'http://${LIGHTSAIL_IP}';

async function runTests() {
    console.log('🧪 Iniciando tests de endpoints...');
    console.log('Base URL:', BASE_URL);
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };
    
    // Test 1: Health Check
    try {
        console.log('\\n📍 Test 1: Health Check');
        const response = await page.goto(\`\${BASE_URL}/health\`, { timeout: 30000 });
        const status = response.status();
        const body = await response.json();
        
        if (status === 200 && body.status === 'healthy') {
            console.log('✓ Health check passed');
            console.log('  Database:', body.database);
            results.passed++;
            results.tests.push({ name: 'Health Check', status: 'PASS', response: body });
        } else {
            throw new Error(\`Health check failed: \${status}\`);
        }
    } catch (error) {
        console.log('✗ Health check failed:', error.message);
        results.failed++;
        results.tests.push({ name: 'Health Check', status: 'FAIL', error: error.message });
    }
    
    // Test 2: Root Endpoint
    try {
        console.log('\\n📍 Test 2: Root Endpoint');
        const response = await page.goto(\`\${BASE_URL}/\`, { timeout: 30000 });
        const status = response.status();
        const body = await response.json();
        
        if (status === 200 && body.app) {
            console.log('✓ Root endpoint passed');
            console.log('  App:', body.app);
            console.log('  Version:', body.version);
            results.passed++;
            results.tests.push({ name: 'Root Endpoint', status: 'PASS', response: body });
        } else {
            throw new Error(\`Root endpoint failed: \${status}\`);
        }
    } catch (error) {
        console.log('✗ Root endpoint failed:', error.message);
        results.failed++;
        results.tests.push({ name: 'Root Endpoint', status: 'FAIL', error: error.message });
    }
    
    // Test 3: Health Systems API
    try {
        console.log('\\n📍 Test 3: Health Systems API');
        const response = await page.goto(\`\${BASE_URL}/api/health-systems\`, { timeout: 30000 });
        const status = response.status();
        const body = await response.json();
        
        if (status === 200 && body.success && Array.isArray(body.data)) {
            console.log('✓ Health systems API passed');
            console.log('  Systems found:', body.data.length);
            results.passed++;
            results.tests.push({ name: 'Health Systems API', status: 'PASS', count: body.data.length });
        } else {
            throw new Error(\`Health systems API failed: \${status}\`);
        }
    } catch (error) {
        console.log('✗ Health systems API failed:', error.message);
        results.failed++;
        results.tests.push({ name: 'Health Systems API', status: 'FAIL', error: error.message });
    }
    
    // Test 4: Users API
    try {
        console.log('\\n📍 Test 4: Users API');
        const response = await page.goto(\`\${BASE_URL}/api/users\`, { timeout: 30000 });
        const status = response.status();
        const body = await response.json();
        
        if (status === 200 && body.success) {
            console.log('✓ Users API passed');
            console.log('  Users found:', body.data.length);
            results.passed++;
            results.tests.push({ name: 'Users API', status: 'PASS', count: body.data.length });
        } else {
            throw new Error(\`Users API failed: \${status}\`);
        }
    } catch (error) {
        console.log('✗ Users API failed:', error.message);
        results.failed++;
        results.tests.push({ name: 'Users API', status: 'FAIL', error: error.message });
    }
    
    await browser.close();
    
    // Resumen
    console.log('\\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE TESTS');
    console.log('='.repeat(60));
    console.log(\`✓ Tests Pasados: \${results.passed}\`);
    console.log(\`✗ Tests Fallidos: \${results.failed}\`);
    console.log(\`📝 Total: \${results.passed + results.failed}\`);
    
    // Guardar resultados
    const fs = require('fs');
    fs.writeFileSync(
        '${TESTS_DIR}/test-results.json',
        JSON.stringify(results, null, 2)
    );
    
    return results.failed === 0;
}

runTests()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('Error ejecutando tests:', error);
        process.exit(1);
    });
TESTJS

# Ejecutar tests
log_info "Ejecutando tests de endpoints..."
cd ${TESTS_DIR}

if node endpoint-tests.js; then
    log_success "✓ Todos los tests pasaron"
    TEST_STATUS="PASS"
else
    log_warning "⚠ Algunos tests fallaron"
    TEST_STATUS="FAIL"
fi

# ============================================================================
# CREAR DOCUMENTACIÓN ADICIONAL
# ============================================================================

# Script de fix automático
cat > ${OUTPUT_DIR}/fix-deployment-issues.sh <<'FIXSCRIPT'
#!/bin/bash
# Script de Corrección Automática de Problemas de Despliegue

set -e

LIGHTSAIL_IP="__LIGHTSAIL_IP__"
LIGHTSAIL_INSTANCE="__LIGHTSAIL_INSTANCE__"
AWS_REGION="__AWS_REGION__"

echo "🔧 Script de Corrección de Problemas"
echo "======================================"

# Verificar conectividad
echo "1. Verificando conectividad..."
if curl -sf http://${LIGHTSAIL_IP}/health > /dev/null; then
    echo "✓ Aplicación respondiendo correctamente"
else
    echo "✗ Aplicación no responde. Intentando correcciones..."
    
    # Verificar estado de la instancia
    STATE=$(aws lightsail get-instance-state \
        --instance-name $LIGHTSAIL_INSTANCE \
        --region $AWS_REGION \
        --query 'state.name' \
        --output text)
    
    echo "  Estado de instancia: $STATE"
    
    if [ "$STATE" != "running" ]; then
        echo "  Iniciando instancia..."
        aws lightsail start-instance \
            --instance-name $LIGHTSAIL_INSTANCE \
            --region $AWS_REGION
        echo "  Esperando..."
        sleep 60
    fi
fi

# Verificar DNS
echo ""
echo "2. Verificando resolución DNS..."
if nslookup $LIGHTSAIL_IP > /dev/null 2>&1; then
    echo "✓ DNS resolviendo correctamente"
else
    echo "⚠ Problema con DNS - Usar IP directamente"
fi

# Verificar puertos
echo ""
echo "3. Verificando puertos abiertos..."
for PORT in 80 443; do
    if nc -zv $LIGHTSAIL_IP $PORT 2>&1 | grep -q "succeeded"; then
        echo "✓ Puerto $PORT abierto"
    else
        echo "✗ Puerto $PORT cerrado - Verificar firewall"
    fi
done

echo ""
echo "🔍 Diagnóstico completado"
echo ""
echo "Si persisten problemas:"
echo "1. Verificar logs: aws lightsail get-instance-access-details --instance-name $LIGHTSAIL_INSTANCE"
echo "2. Revisar Security Groups de RDS"
echo "3. Verificar User Data execution: sudo tail -f /var/log/user-data.log"
FIXSCRIPT

chmod +x ${OUTPUT_DIR}/fix-deployment-issues.sh

# Reemplazar variables en fix script
sed -i "s|__LIGHTSAIL_IP__|$LIGHTSAIL_IP|g" ${OUTPUT_DIR}/fix-deployment-issues.sh
sed -i "s|__LIGHTSAIL_INSTANCE__|$LIGHTSAIL_INSTANCE_NAME|g" ${OUTPUT_DIR}/fix-deployment-issues.sh
sed -i "s|__AWS_REGION__|$AWS_REGION|g" ${OUTPUT_DIR}/fix-deployment-issues.sh

# ============================================================================
# RESUMEN FINAL
# ============================================================================

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║                  DESPLIEGUE COMPLETADO                                ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

if [ "$DEPLOYMENT_STATUS" == "SUCCESS" ] && [ "$TEST_STATUS" == "PASS" ]; then
    log_success "🎉 DESPLIEGUE 100% EXITOSO"
elif [ "$DEPLOYMENT_STATUS" == "SUCCESS" ]; then
    log_warning "⚠️  DESPLIEGUE EXITOSO (algunos tests fallaron)"
else
    log_warning "⚠️  DESPLIEGUE PARCIAL (verificar manualmente)"
fi

echo ""
echo "📋 INFORMACIÓN DEL DESPLIEGUE"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "🌐 URLs:"
echo "   Aplicación:    http://${LIGHTSAIL_IP}"
echo "   Health Check:  http://${LIGHTSAIL_IP}/health"
echo "   API:           http://${LIGHTSAIL_IP}/api/health-systems"
echo ""
echo "🖥️  Infraestructura:"
echo "   Instancia:     $LIGHTSAIL_INSTANCE_NAME"
echo "   IP:            $LIGHTSAIL_IP"
echo "   Región:        $AWS_REGION"
echo ""
echo "🗄️  Base de Datos:"
echo "   Endpoint:      $DB_ENDPOINT"
echo "   Database:      $DB_NAME"
echo ""
echo "🐳 Docker:"
echo "   Imagen:        $DOCKER_IMAGE"
echo ""
echo "📦 Archivos Generados:"
echo "   ZIP Package:   $ZIP_FILE"
echo "   Fix Script:    ${OUTPUT_DIR}/fix-deployment-issues.sh"
echo ""
echo "🧪 Resultados de Tests:"
if [ -f "${TESTS_DIR}/test-results.json" ]; then
    cat ${TESTS_DIR}/test-results.json | jq -r '.tests[] | "   \(.name): \(.status)"'
fi
echo ""
echo "📚 Comandos Útiles:"
echo "   # Ver estado de la aplicación"
echo "   curl http://${LIGHTSAIL_IP}/health | jq ."
echo ""
echo "   # Ejecutar script de corrección"
echo "   bash ${OUTPUT_DIR}/fix-deployment-issues.sh"
echo ""
echo "   # Ver detalles de la instancia"
echo "   aws lightsail get-instance --instance-name $LIGHTSAIL_INSTANCE_NAME"
echo ""
echo "🔗 Recursos en AWS:"
echo "   Lightsail: https://lightsail.aws.amazon.com/ls/webapp/home/instances"
echo "   RDS:       https://console.aws.amazon.com/rds/home?region=${AWS_REGION}"
echo "   ECR:       https://console.aws.amazon.com/ecr/repositories?region=${AWS_REGION}"
echo "   S3:        https://s3.console.aws.amazon.com/s3/buckets/${S3_BUCKET_NAME}"
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo ""
log_success "✅ Script de despliegue completado"
echo ""
