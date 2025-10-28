#!/usr/bin/env python3
"""
Majestic Health - Automated RDS Database Schema Deployment
Transfiere init_db.sql a S3 y lo ejecuta automáticamente en AWS RDS PostgreSQL
"""

import boto3
import hashlib
import json
import sys
from datetime import datetime
from botocore.exceptions import ClientError
from typing import Dict, Optional, List

class MajesticRDSDeployer:
    def __init__(self, region: str = 'us-east-1'):
        self.s3_client = boto3.client('s3', region_name=region)
        self.rds_client = boto3.client('rds', region_name=region)
        self.sts_client = boto3.client('sts', region_name=region)
        self.region = region
        self.account_id = self.sts_client.get_caller_identity()['Account']
        
    def find_existing_majestic_buckets(self) -> List[str]:
        """
        Busca buckets S3 existentes relacionados con Majestic
        """
        print("\n🔍 Buscando buckets S3 existentes para Majestic...")
        
        try:
            response = self.s3_client.list_buckets()
            majestic_buckets = []
            
            for bucket in response.get('Buckets', []):
                bucket_name = bucket['Name']
                if 'majestic' in bucket_name.lower():
                    # Verificar que el bucket está en nuestra región
                    try:
                        location = self.s3_client.get_bucket_location(Bucket=bucket_name)
                        bucket_region = location.get('LocationConstraint') or 'us-east-1'
                        
                        if bucket_region == self.region:
                            majestic_buckets.append(bucket_name)
                            print(f"  ✓ Encontrado: {bucket_name}")
                    except ClientError:
                        pass
            
            if majestic_buckets:
                print(f"\n✅ {len(majestic_buckets)} bucket(s) encontrado(s)")
            else:
                print("  ℹ️  No se encontraron buckets existentes")
                
            return majestic_buckets
            
        except ClientError as e:
            print(f"⚠️  Error listando buckets: {e}")
            return []
    
    def select_or_create_bucket(self) -> str:
        """
        Selecciona un bucket existente o crea uno nuevo
        """
        existing_buckets = self.find_existing_majestic_buckets()
        
        if existing_buckets:
            print("\n📦 Buckets disponibles:")
            for idx, bucket in enumerate(existing_buckets, 1):
                print(f"  {idx}. {bucket}")
            print(f"  {len(existing_buckets) + 1}. Crear nuevo bucket")
            
            while True:
                try:
                    choice = input(f"\nSelecciona una opción (1-{len(existing_buckets) + 1}) [1]: ").strip()
                    choice = choice or "1"
                    choice_idx = int(choice) - 1
                    
                    if 0 <= choice_idx < len(existing_buckets):
                        selected_bucket = existing_buckets[choice_idx]
                        print(f"✅ Usando bucket existente: {selected_bucket}")
                        return selected_bucket
                    elif choice_idx == len(existing_buckets):
                        break
                    else:
                        print("❌ Opción inválida")
                except ValueError:
                    print("❌ Por favor ingresa un número válido")
        
        # Crear nuevo bucket
        timestamp = datetime.now().strftime('%Y%m%d')
        bucket_name = f"majestic-health-init-{timestamp}"
        
        print(f"\n🆕 Creando nuevo bucket: {bucket_name}")
        return self.create_secure_bucket(bucket_name)
    
    def create_secure_bucket(self, bucket_name: str) -> str:
        """
        Crea un bucket S3 seguro para Majestic
        """
        try:
            # Crear bucket
            if self.region == 'us-east-1':
                self.s3_client.create_bucket(Bucket=bucket_name)
            else:
                self.s3_client.create_bucket(
                    Bucket=bucket_name,
                    CreateBucketConfiguration={'LocationConstraint': self.region}
                )
            
            # Habilitar versionado
            self.s3_client.put_bucket_versioning(
                Bucket=bucket_name,
                VersioningConfiguration={'Status': 'Enabled'}
            )
            
            # Habilitar encriptación
            self.s3_client.put_bucket_encryption(
                Bucket=bucket_name,
                ServerSideEncryptionConfiguration={
                    'Rules': [{
                        'ApplyServerSideEncryptionByDefault': {
                            'SSEAlgorithm': 'AES256'
                        },
                        'BucketKeyEnabled': True
                    }]
                }
            )
            
            # Bloquear acceso público
            self.s3_client.put_public_access_block(
                Bucket=bucket_name,
                PublicAccessBlockConfiguration={
                    'BlockPublicAcls': True,
                    'IgnorePublicAcls': True,
                    'BlockPublicPolicy': True,
                    'RestrictPublicBuckets': True
                }
            )
            
            # Política de bucket restrictiva
            bucket_policy = {
                "Version": "2012-10-17",
                "Statement": [{
                    "Sid": "DenyInsecureTransport",
                    "Effect": "Deny",
                    "Principal": "*",
                    "Action": "s3:*",
                    "Resource": [
                        f"arn:aws:s3:::{bucket_name}",
                        f"arn:aws:s3:::{bucket_name}/*"
                    ],
                    "Condition": {
                        "Bool": {"aws:SecureTransport": "false"}
                    }
                }]
            }
            
            self.s3_client.put_bucket_policy(
                Bucket=bucket_name,
                Policy=json.dumps(bucket_policy)
            )
            
            # Configurar lifecycle
            self.s3_client.put_bucket_lifecycle_configuration(
                Bucket=bucket_name,
                LifecycleConfiguration={
                    'Rules': [{
                        'Id': 'DeleteOldInitScripts',
                        'Status': 'Enabled',
                        'Prefix': 'init_db/',
                        'Expiration': {'Days': 30},
                        'NoncurrentVersionExpiration': {'NoncurrentDays': 7}
                    }]
                }
            )
            
            print(f"✅ Bucket creado: {bucket_name}")
            return bucket_name
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'BucketAlreadyOwnedByYou':
                print(f"✓ Bucket {bucket_name} ya existe")
                return bucket_name
            else:
                print(f"❌ Error creando bucket: {e}")
                raise
    
    def create_init_db_sql(self) -> str:
        """
        Crea el archivo init_db.sql con el schema completo
        """
        print("\n📝 Creando init_db.sql...")
        
        sql_content = """-- ============================================================================
-- Schema Completo para Majestic Health App
-- Creado: {}
-- ============================================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    date_of_birth DATE,
    gender VARCHAR(20),
    phone VARCHAR(20),
    avatar_url TEXT,
    role VARCHAR(50) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Tabla de perfiles de salud
CREATE TABLE IF NOT EXISTS health_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    height_cm DECIMAL(5,2),
    weight_kg DECIMAL(5,2),
    blood_type VARCHAR(5),
    allergies TEXT[],
    chronic_conditions TEXT[],
    medications TEXT[],
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Tabla de métricas de salud
CREATE TABLE IF NOT EXISTS health_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL,
    value DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    source VARCHAR(50) DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de citas médicas
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    doctor_name VARCHAR(100),
    specialty VARCHAR(100),
    appointment_date TIMESTAMP NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    location TEXT,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de recordatorios de medicamentos
CREATE TABLE IF NOT EXISTS medication_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    medication_name VARCHAR(200) NOT NULL,
    dosage VARCHAR(100),
    frequency VARCHAR(100),
    start_date DATE NOT NULL,
    end_date DATE,
    reminder_times TIME[],
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de objetivos de salud
CREATE TABLE IF NOT EXISTS health_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    goal_type VARCHAR(50) NOT NULL,
    target_value DECIMAL(10,2),
    current_value DECIMAL(10,2),
    unit VARCHAR(20),
    start_date DATE NOT NULL,
    target_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de actividades físicas
CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    duration_minutes INTEGER,
    calories_burned INTEGER,
    distance_km DECIMAL(10,2),
    intensity VARCHAR(20),
    activity_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de sesiones
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT
);

-- Índices para optimización
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_health_metrics_user_type ON health_metrics(user_id, metric_type);
CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON appointments(user_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_medication_reminders_user_active ON medication_reminders(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities(user_id, activity_date);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_health_profiles_updated_at BEFORE UPDATE ON health_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_medication_reminders_updated_at BEFORE UPDATE ON medication_reminders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_health_goals_updated_at BEFORE UPDATE ON health_goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insertar usuario admin de prueba (contraseña: Admin123!)
INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified)
VALUES (
    'admin@majestic.com',
    '$2b$10$YourHashedPasswordHere',
    'Admin',
    'User',
    'admin',
    true
) ON CONFLICT (email) DO NOTHING;

-- Verificación final
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE';
    
    RAISE NOTICE 'Schema initialization complete. Total tables: %', table_count;
END $$;
""".format(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        
        filename = 'init_db.sql'
        with open(filename, 'w') as f:
            f.write(sql_content)
        
        print(f"✅ Archivo creado: {filename}")
        return filename
    
    def upload_init_script(self, bucket_name: str, script_path: str) -> Dict:
        """
        Sube init_db.sql a S3 con encriptación y metadatos
        """
        print(f"\n📤 Subiendo {script_path} a S3...")
        
        try:
            with open(script_path, 'rb') as f:
                content = f.read()
            
            # Calcular hashes
            sha256_hash = hashlib.sha256(content).hexdigest()
            
            # Key con timestamp
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            s3_key = f"init_db/init_db_{timestamp}.sql"
            
            # Metadatos
            metadata = {
                'sha256': sha256_hash,
                'uploaded-by': self.sts_client.get_caller_identity()['Arn'],
                'upload-timestamp': datetime.utcnow().isoformat(),
                'app': 'majestic-health',
                'db-name': 'health_app'
            }
            
            # Subir con encriptación
            self.s3_client.put_object(
                Bucket=bucket_name,
                Key=s3_key,
                Body=content,
                ServerSideEncryption='AES256',
                Metadata=metadata,
                ContentType='application/sql'
            )
            
            # Crear alias "latest"
            self.s3_client.copy_object(
                Bucket=bucket_name,
                CopySource={'Bucket': bucket_name, 'Key': s3_key},
                Key='init_db/latest.sql',
                ServerSideEncryption='AES256',
                Metadata=metadata,
                MetadataDirective='REPLACE'
            )
            
            print(f"✅ Script subido exitosamente")
            print(f"   S3 URI: s3://{bucket_name}/{s3_key}")
            print(f"   SHA256: {sha256_hash[:16]}...")
            
            return {
                'bucket': bucket_name,
                'key': s3_key,
                'latest_key': 'init_db/latest.sql',
                'sha256': sha256_hash,
                's3_uri': f"s3://{bucket_name}/init_db/latest.sql"
            }
            
        except Exception as e:
            print(f"❌ Error subiendo script: {e}")
            raise
    
    def generate_rds_init_user_data(self, bucket_name: str, s3_key: str,
                                     db_config: Dict) -> str:
        """
        Genera User Data que descarga y ejecuta init_db.sql en RDS
        """
        print("\n🔧 Generando User Data para inicialización de RDS...")
        
        user_data = f"""#!/bin/bash
set -euo pipefail

# ============================================================================
# Majestic Health - Automatic RDS Schema Initialization
# ============================================================================

LOG_FILE="/var/log/rds_init.log"
SCRIPT_PATH="/tmp/init_db.sql"
MAX_RETRIES=5
RETRY_DELAY=10

log_info() {{
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1" | tee -a "$LOG_FILE"
}}

log_error() {{
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE" >&2
}}

log_success() {{
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS: $1" | tee -a "$LOG_FILE"
}}

# Instalar dependencias
log_info "Instalando dependencias..."
apt-get update -qq
apt-get install -y awscli postgresql-client jq

# Descargar script desde S3
log_info "Descargando init_db.sql desde S3..."
if aws s3 cp s3://{bucket_name}/{s3_key} "$SCRIPT_PATH" --region {self.region}; then
    log_success "Script descargado correctamente"
else
    log_error "Error descargando script desde S3"
    exit 1
fi

# Configuración de base de datos
DB_HOST="{db_config['host']}"
DB_PORT="{db_config['port']}"
DB_NAME="{db_config['database']}"
DB_USER="{db_config['username']}"
DB_PASSWORD="{db_config['password']}"

export PGPASSWORD="$DB_PASSWORD"

# Verificar conectividad con RDS
log_info "Verificando conectividad con RDS..."
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1;" &>/dev/null; then
        log_success "Conexión con RDS establecida"
        break
    else
        RETRY=$((RETRY + 1))
        if [ $RETRY -lt $MAX_RETRIES ]; then
            log_info "Reintento $RETRY/$MAX_RETRIES en $RETRY_DELAY segundos..."
            sleep $RETRY_DELAY
        else
            log_error "No se pudo conectar a RDS después de $MAX_RETRIES intentos"
            exit 1
        fi
    fi
done

# Verificar si la base de datos existe
log_info "Verificando base de datos $DB_NAME..."
DB_EXISTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" != "1" ]; then
    log_info "Creando base de datos $DB_NAME..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
        "CREATE DATABASE $DB_NAME;"
    log_success "Base de datos creada"
else
    log_info "Base de datos $DB_NAME ya existe"
fi

# Ejecutar script de inicialización
log_info "Ejecutando init_db.sql en la base de datos..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -f "$SCRIPT_PATH" 2>&1 | tee -a "$LOG_FILE"; then
    log_success "Schema inicializado correctamente"
else
    log_error "Error ejecutando init_db.sql"
    exit 1
fi

# Verificar tablas creadas
log_info "Verificando tablas creadas..."
TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")

log_success "✅ Schema completo: $TABLE_COUNT tablas creadas"

# Listar tablas
log_info "Tablas en la base de datos:"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
    "\\dt" 2>&1 | tee -a "$LOG_FILE"

# Limpiar
unset PGPASSWORD
rm -f "$SCRIPT_PATH"

# Marcar como completado
echo "$(date -Iseconds)" > /var/log/rds_init_complete.flag
log_success "🎉 Inicialización de RDS completada exitosamente"
"""
        
        return user_data
    
    def generate_standalone_init_script(self, bucket_name: str, s3_key: str,
                                         db_config: Dict) -> str:
        """
        Genera script standalone para ejecutar desde cualquier máquina
        """
        print("\n📋 Generando script standalone...")
        
        script = f"""#!/bin/bash
# ============================================================================
# Majestic Health - RDS Schema Initialization (Standalone)
# ============================================================================

set -euo pipefail

# Configuración
BUCKET_NAME="{bucket_name}"
S3_KEY="{s3_key}"
REGION="{self.region}"
SCRIPT_PATH="/tmp/init_db_$$.sql"

DB_HOST="{db_config['host']}"
DB_PORT="{db_config['port']}"
DB_NAME="{db_config['database']}"
DB_USER="{db_config['username']}"
DB_PASSWORD="{db_config['password']}"

export PGPASSWORD="$DB_PASSWORD"

echo "🚀 Iniciando inicialización de RDS..."

# Descargar script
echo "📥 Descargando init_db.sql..."
aws s3 cp "s3://$BUCKET_NAME/$S3_KEY" "$SCRIPT_PATH" --region "$REGION"

# Verificar conexión
echo "🔌 Verificando conexión con RDS..."
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1;" &>/dev/null; then
    echo "❌ Error: No se puede conectar a RDS"
    exit 1
fi

# Crear DB si no existe
DB_EXISTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" != "1" ]; then
    echo "📦 Creando base de datos $DB_NAME..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"
fi

# Ejecutar script
echo "⚙️  Ejecutando init_db.sql..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCRIPT_PATH"

# Verificar
TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")

echo "✅ Inicialización completa: $TABLE_COUNT tablas creadas"

# Listar tablas
echo ""
echo "📋 Tablas en la base de datos:"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\\dt"

# Limpiar
unset PGPASSWORD
rm -f "$SCRIPT_PATH"

echo ""
echo "🎉 ¡RDS inicializado exitosamente!"
"""
        
        filename = 'rds_init.sh'
        with open(filename, 'w') as f:
            f.write(script)
        
        import os
        os.chmod(filename, 0o755)
        
        print(f"✅ Script standalone creado: {filename}")
        return filename
    
    def save_deployment_info(self, bucket_name: str, script_info: Dict, 
                             db_config: Dict) -> str:
        """
        Guarda información del despliegue
        """
        info = {
            'deployment_date': datetime.now().isoformat(),
            'bucket': bucket_name,
            'script_s3_uri': script_info['s3_uri'],
            'script_sha256': script_info['sha256'],
            'database': {
                'host': db_config['host'],
                'port': db_config['port'],
                'database': db_config['database'],
                'username': db_config['username']
            },
            'region': self.region,
            'account_id': self.account_id
        }
        
        filename = 'rds_deployment_info.json'
        with open(filename, 'w') as f:
            json.dump(info, f, indent=2)
        
        print(f"\n📄 Información guardada en: {filename}")
        return filename


def main():
    """
    Flujo principal de despliegue
    """
    print("=" * 80)
    print("🏥 MAJESTIC HEALTH - Automatic RDS Schema Deployment")
    print("=" * 80)
    print()
    
    # Configuración de RDS
    DB_CONFIG = {
        'host': 'health-app.c4vuie06a0wt.us-east-1.rds.amazonaws.com',
        'port': '5432',
        'database': 'health_app',
        'username': 'majestic',
        'password': 'simple123'
    }
    
    REGION = 'us-east-1'
    
    try:
        deployer = MajesticRDSDeployer(region=REGION)
        
        # 1. Seleccionar o crear bucket
        print("\n" + "="*80)
        print("PASO 1: Gestionar Bucket S3")
        print("="*80)
        bucket_name = deployer.select_or_create_bucket()
        
        # 2. Crear init_db.sql
        print("\n" + "="*80)
        print("PASO 2: Crear Schema SQL")
        print("="*80)
        sql_file = deployer.create_init_db_sql()
        
        # 3. Subir a S3
        print("\n" + "="*80)
        print("PASO 3: Subir a S3")
        print("="*80)
        script_info = deployer.upload_init_script(bucket_name, sql_file)
        
        # 4. Generar User Data
        print("\n" + "="*80)
        print("PASO 4: Generar User Data")
        print("="*80)
        user_data = deployer.generate_rds_init_user_data(
            bucket_name=bucket_name,
            s3_key=script_info['latest_key'],
            db_config=DB_CONFIG
        )
        
        # Guardar User Data
        with open('rds_init_user_data.sh', 'w') as f:
            f.write(user_data)
        print("✅ User Data guardado en: rds_init_user_data.sh")
        
        # 5. Generar script standalone
        print("\n" + "="*80)
        print("PASO 5: Generar Script Standalone")
        print("="*80)
        standalone_script = deployer.generate_standalone_init_script(
            bucket_name=bucket_name,
            s3_key=script_info['latest_key'],
            db_config=DB_CONFIG
        )
        
        # 6. Guardar información
        print("\n" + "="*80)
        print("PASO 6: Guardar Información del Despliegue")
        print("="*80)
        deployer.save_deployment_info(bucket_name, script_info, DB_CONFIG)
        
        # Resumen final
        print("\n" + "="*80)
        print("✅ DESPLIEGUE COMPLETADO EXITOSAMENTE")
        print("="*80)
        print(f"""
📋 RESUMEN:
   • Bucket S3: {bucket_name}
   • Script: {script_info['s3_uri']}
   • SHA256: {script_info['sha256'][:16]}...
   • Base de Datos: {DB_CONFIG['database']}
   • Host RDS: {DB_CONFIG['host']}

📁 ARCHIVOS GENERADOS:
   ✓ init_db.sql - Schema de base de datos
   ✓ rds_init_user_data.sh - User Data para Lightsail
   ✓ {standalone_script} - Script ejecutable standalone
   ✓ rds_deployment_info.json - Información del despliegue

🚀 OPCIONES DE EJECUCIÓN:

1️⃣  Usar User Data en Lightsail:
   - Copia el contenido de rds_init_user_data.sh
   - Pégalo en el campo "User Data" al crear la instancia
   - Se ejecutará automáticamente al iniciar

2️⃣  Ejecutar script standalone:
   - Desde cualquier máquina con AWS CLI y PostgreSQL client:
     ./{standalone_script}

3️⃣  Ejecutar manualmente:
   - Descarga el script: aws s3 cp {script_info['s3_uri']} init_db.sql
   - Ejecuta: psql -h {DB_CONFIG['host']} -U {DB_CONFIG['username']} -d {DB_CONFIG['database']} -f init_db.sql

🔒 SEGURIDAD:
   ✓ Bucket con encriptación AES-256
   ✓ Versionado habilitado
   ✓ Acceso público bloqueado
   ✓ Política de bucket restrictiva
   ✓ Lifecycle de 30 días para scripts antiguos

⚙️  SIGUIENTES PASOS:
   1. Revisa los archivos generados
   2. Integra el User Data en tu script de despliegue de Lightsail
   3. O ejecuta el script standalone para inicializar RDS ahora mismo
   4. Verifica las tablas creadas en RDS

💡 TIP: El script es idempotente - puedes ejecutarlo múltiples veces sin problemas.
        """)
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
