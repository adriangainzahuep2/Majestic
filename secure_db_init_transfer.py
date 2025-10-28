#!/usr/bin/env python3
"""
Secure Database Initialization Script Transfer System
Utiliza S3 con encriptación, versionado y User Data para transferencia segura
"""

import boto3
import hashlib
import json
import base64
from datetime import datetime, timedelta
from botocore.exceptions import ClientError
from typing import Dict, Optional
import sys

class SecureScriptTransfer:
    def __init__(self, region: str = 'us-east-1'):
        self.s3_client = boto3.client('s3', region_name=region)
        self.lightsail_client = boto3.client('lightsail', region_name=region)
        self.sts_client = boto3.client('sts', region_name=region)
        self.region = region
        
    def create_secure_bucket(self, bucket_name: str) -> Dict:
        """
        Crea bucket S3 con encriptación, versionado y políticas de seguridad
        """
        try:
            print(f"🔒 Creando bucket seguro: {bucket_name}")
            
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
            
            # Habilitar encriptación por defecto (AES-256)
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
            account_id = self.sts_client.get_caller_identity()['Account']
            bucket_policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
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
                    }
                ]
            }
            
            self.s3_client.put_bucket_policy(
                Bucket=bucket_name,
                Policy=json.dumps(bucket_policy)
            )
            
            # Configurar ciclo de vida (eliminar después de 7 días)
            self.s3_client.put_bucket_lifecycle_configuration(
                Bucket=bucket_name,
                LifecycleConfiguration={
                    'Rules': [{
                        'Id': 'DeleteOldInitScripts',
                        'Status': 'Enabled',
                        'Prefix': 'init_db/',
                        'Expiration': {'Days': 7},
                        'NoncurrentVersionExpiration': {'NoncurrentDays': 1}
                    }]
                }
            )
            
            print(f"✅ Bucket {bucket_name} creado con éxito")
            return {
                'bucket_name': bucket_name,
                'region': self.region,
                'encryption': 'AES256',
                'versioning': 'Enabled'
            }
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'BucketAlreadyOwnedByYou':
                print(f"⚠️  Bucket {bucket_name} ya existe, verificando configuración...")
                return {'bucket_name': bucket_name, 'status': 'exists'}
            else:
                print(f"❌ Error creando bucket: {e}")
                raise
    
    def upload_init_script(self, bucket_name: str, script_path: str) -> Dict:
        """
        Sube el script de inicialización con encriptación y metadatos
        """
        try:
            print(f"📤 Subiendo script: {script_path}")
            
            # Leer y hashear el contenido
            with open(script_path, 'rb') as f:
                content = f.read()
            
            sha256_hash = hashlib.sha256(content).hexdigest()
            md5_hash = hashlib.md5(content).hexdigest()
            
            # Key con timestamp para versionado adicional
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            s3_key = f"init_db/init_db_{timestamp}.sql"
            
            # Metadatos de seguridad
            metadata = {
                'sha256': sha256_hash,
                'uploaded-by': self.sts_client.get_caller_identity()['Arn'],
                'upload-timestamp': datetime.utcnow().isoformat(),
                'content-type': 'application/sql'
            }
            
            # Subir con encriptación
            self.s3_client.put_object(
                Bucket=bucket_name,
                Key=s3_key,
                Body=content,
                ServerSideEncryption='AES256',
                Metadata=metadata,
                ContentType='application/sql',
                StorageClass='STANDARD_IA'  # Infrequent Access para costos optimizados
            )
            
            # Crear alias "latest" apuntando a esta versión
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
            print(f"   SHA256: {sha256_hash}")
            
            return {
                'bucket': bucket_name,
                'key': s3_key,
                'latest_key': 'init_db/latest.sql',
                'sha256': sha256_hash,
                'md5': md5_hash,
                'version_id': self.s3_client.head_object(
                    Bucket=bucket_name,
                    Key=s3_key
                ).get('VersionId')
            }
            
        except Exception as e:
            print(f"❌ Error subiendo script: {e}")
            raise
    
    def create_iam_role_for_lightsail(self, role_name: str, bucket_name: str) -> str:
        """
        Crea rol IAM con permisos mínimos para Lightsail
        """
        iam_client = boto3.client('iam')
        
        try:
            print(f"🔐 Creando rol IAM: {role_name}")
            
            # Política de confianza
            assume_role_policy = {
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"Service": "lightsail.amazonaws.com"},
                    "Action": "sts:AssumeRole"
                }]
            }
            
            # Crear rol
            iam_client.create_role(
                RoleName=role_name,
                AssumeRolePolicyDocument=json.dumps(assume_role_policy),
                Description='Rol para Lightsail - Acceso limitado a init_db.sql',
                MaxSessionDuration=3600  # 1 hora
            )
            
            # Política inline restrictiva
            policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Sid": "ReadInitScriptOnly",
                        "Effect": "Allow",
                        "Action": [
                            "s3:GetObject",
                            "s3:GetObjectVersion"
                        ],
                        "Resource": f"arn:aws:s3:::{bucket_name}/init_db/*"
                    },
                    {
                        "Sid": "ListBucketForVerification",
                        "Effect": "Allow",
                        "Action": "s3:ListBucket",
                        "Resource": f"arn:aws:s3:::{bucket_name}",
                        "Condition": {
                            "StringLike": {
                                "s3:prefix": "init_db/*"
                            }
                        }
                    }
                ]
            }
            
            iam_client.put_role_policy(
                RoleName=role_name,
                PolicyName='LightsailInitDBAccess',
                PolicyDocument=json.dumps(policy)
            )
            
            # Esperar a que el rol se propague
            import time
            print("⏳ Esperando propagación del rol IAM (30s)...")
            time.sleep(30)
            
            role_arn = f"arn:aws:iam::{self.sts_client.get_caller_identity()['Account']}:role/{role_name}"
            print(f"✅ Rol IAM creado: {role_arn}")
            
            return role_arn
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'EntityAlreadyExists':
                print(f"⚠️  Rol {role_name} ya existe")
                account_id = self.sts_client.get_caller_identity()['Account']
                return f"arn:aws:iam::{account_id}:role/{role_name}"
            else:
                print(f"❌ Error creando rol IAM: {e}")
                raise
    
    def generate_user_data_script(self, bucket_name: str, s3_key: str, 
                                  sha256_hash: str) -> str:
        """
        Genera script User Data con verificación de integridad y reintentos
        """
        user_data = f"""#!/bin/bash
set -euo pipefail

# ============================================================================
# Secure Init DB Script Download from S3
# ============================================================================

LOG_FILE="/var/log/init_db_download.log"
SCRIPT_PATH="/home/ubuntu/init_db.sql"
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

# Instalar AWS CLI si no está disponible
if ! command -v aws &> /dev/null; then
    log_info "Instalando AWS CLI..."
    apt-get update -qq
    apt-get install -y awscli unzip
fi

# Verificar conexión a S3
log_info "Verificando conectividad con S3..."
if ! aws s3 ls s3://{bucket_name}/ --region {self.region} &>/dev/null; then
    log_error "No se puede conectar a S3. Verificar IAM role y permisos."
    exit 1
fi

# Descargar con reintentos y verificación
download_with_retry() {{
    local retry=0
    local wait_time=$RETRY_DELAY
    
    while [ $retry -lt $MAX_RETRIES ]; do
        log_info "Descargando init_db.sql... (intento $((retry + 1))/$MAX_RETRIES)"
        
        if aws s3 cp \
            s3://{bucket_name}/{s3_key} \
            "$SCRIPT_PATH" \
            --region {self.region} \
            --no-progress \
            --only-show-errors 2>&1 | tee -a "$LOG_FILE"; then
            
            # Verificar integridad SHA256
            log_info "Verificando integridad del archivo..."
            DOWNLOADED_HASH=$(sha256sum "$SCRIPT_PATH" | awk '{{print $1}}')
            EXPECTED_HASH="{sha256_hash}"
            
            if [ "$DOWNLOADED_HASH" = "$EXPECTED_HASH" ]; then
                log_success "✅ Archivo descargado y verificado correctamente"
                log_info "SHA256: $DOWNLOADED_HASH"
                
                # Establecer permisos seguros
                chown ubuntu:ubuntu "$SCRIPT_PATH"
                chmod 600 "$SCRIPT_PATH"
                
                # Crear marca de éxito
                echo "$(date -Iseconds)" > /var/log/init_db_downloaded.flag
                
                return 0
            else
                log_error "Hash no coincide. Esperado: $EXPECTED_HASH, Obtenido: $DOWNLOADED_HASH"
                rm -f "$SCRIPT_PATH"
            fi
        fi
        
        retry=$((retry + 1))
        if [ $retry -lt $MAX_RETRIES ]; then
            log_info "Reintentando en $wait_time segundos..."
            sleep $wait_time
            wait_time=$((wait_time + 5))
        else
            log_error "Fallo después de $MAX_RETRIES intentos"
            return 1
        fi
    done
}}

# Ejecutar descarga
if download_with_retry; then
    log_success "🎉 Script init_db.sql listo en $SCRIPT_PATH"
    
    # Opcional: Ejecutar el script automáticamente
    # if [ -f /var/run/postgresql/.s.PGSQL.5432 ]; then
    #     log_info "Ejecutando init_db.sql..."
    #     sudo -u postgres psql -f "$SCRIPT_PATH" 2>&1 | tee -a "$LOG_FILE"
    # fi
else
    log_error "❌ No se pudo descargar el script"
    exit 1
fi
"""
        return user_data
    
    def deploy_to_lightsail(self, instance_name: str, bucket_name: str, 
                           script_info: Dict, role_arn: Optional[str] = None):
        """
        Despliega la instancia Lightsail con User Data configurado
        """
        try:
            print(f"🚀 Desplegando instancia Lightsail: {instance_name}")
            
            # Generar User Data
            user_data = self.generate_user_data_script(
                bucket_name=bucket_name,
                s3_key=script_info['latest_key'],
                sha256_hash=script_info['sha256']
            )
            
            # Codificar User Data
            user_data_b64 = base64.b64encode(user_data.encode()).decode()
            
            print(f"📝 User Data generado ({len(user_data)} bytes)")
            print(f"🔑 SHA256 esperado: {script_info['sha256']}")
            
            # Nota: Lightsail no soporta IAM roles directamente en User Data
            # Se debe configurar manualmente o usar AWS Systems Manager
            
            print("\n" + "="*70)
            print("INSTRUCCIONES DE DESPLIEGUE:")
            print("="*70)
            print(f"1. Bucket S3: {bucket_name}")
            print(f"2. Script Key: {script_info['latest_key']}")
            print(f"3. SHA256: {script_info['sha256']}")
            
            if role_arn:
                print(f"4. IAM Role ARN: {role_arn}")
                print("\n⚠️  IMPORTANTE: Asociar el rol IAM a la instancia después de crearla:")
                print("   - Lightsail Console → Instance → Manage → IAM role")
            
            print("\n5. User Data Script:")
            print("-" * 70)
            print(user_data[:500] + "..." if len(user_data) > 500 else user_data)
            print("-" * 70)
            
            # Guardar User Data en archivo
            with open('lightsail_user_data.sh', 'w') as f:
                f.write(user_data)
            print("\n✅ User Data guardado en: lightsail_user_data.sh")
            
            # Comando CLI de ejemplo
            print("\n📋 Comando para crear instancia:")
            print(f"""
aws lightsail create-instances \\
    --instance-names {instance_name} \\
    --availability-zone {self.region}a \\
    --blueprint-id ubuntu_22_04 \\
    --bundle-id nano_3_0 \\
    --user-data file://lightsail_user_data.sh \\
    --region {self.region}
            """)
            
            return {
                'instance_name': instance_name,
                'user_data_file': 'lightsail_user_data.sh',
                'bucket': bucket_name,
                'script_key': script_info['latest_key']
            }
            
        except Exception as e:
            print(f"❌ Error en despliegue: {e}")
            raise


def main():
    """
    Flujo completo de transferencia segura
    """
    print("=" * 70)
    print("🏥 MAJESTIC HEALTH - Secure DB Init Script Transfer")
    print("=" * 70)
    print()
    
    # Configuración
    BUCKET_NAME = "majestic-health-init-scripts"
    ROLE_NAME = "LightsailInitDBRole"
    INSTANCE_NAME = "majestic-health-db"
    SCRIPT_PATH = "init_db.sql"
    REGION = "us-east-1"
    
    try:
        transfer = SecureScriptTransfer(region=REGION)
        
        # 1. Crear bucket seguro
        print("\n📦 PASO 1: Crear bucket S3 seguro")
        print("-" * 70)
        bucket_info = transfer.create_secure_bucket(BUCKET_NAME)
        
        # 2. Subir script
        print("\n📤 PASO 2: Subir script de inicialización")
        print("-" * 70)
        script_info = transfer.upload_init_script(BUCKET_NAME, SCRIPT_PATH)
        
        # 3. Crear rol IAM
        print("\n🔐 PASO 3: Crear rol IAM")
        print("-" * 70)
        role_arn = transfer.create_iam_role_for_lightsail(ROLE_NAME, BUCKET_NAME)
        
        # 4. Generar configuración de despliegue
        print("\n🚀 PASO 4: Generar configuración de despliegue")
        print("-" * 70)
        deployment = transfer.deploy_to_lightsail(
            instance_name=INSTANCE_NAME,
            bucket_name=BUCKET_NAME,
            script_info=script_info,
            role_arn=role_arn
        )
        
        print("\n" + "=" * 70)
        print("✅ PROCESO COMPLETADO EXITOSAMENTE")
        print("=" * 70)
        print(f"""
📋 Resumen:
   • Bucket S3: {BUCKET_NAME}
   • Script: {script_info['latest_key']}
   • SHA256: {script_info['sha256'][:16]}...
   • IAM Role: {ROLE_NAME}
   • User Data: lightsail_user_data.sh

🔒 Características de seguridad implementadas:
   ✓ Encriptación S3 (AES-256)
   ✓ Versionado de bucket
   ✓ Acceso público bloqueado
   ✓ Política de bucket restrictiva
   ✓ Verificación de integridad SHA256
   ✓ Reintentos automáticos con backoff
   ✓ Permisos IAM mínimos
   ✓ Logs detallados
   ✓ Ciclo de vida (eliminación automática en 7 días)

🎯 Próximos pasos:
   1. Revisar lightsail_user_data.sh
   2. Crear instancia Lightsail con el User Data
   3. Asociar IAM role a la instancia
   4. Verificar logs en /var/log/init_db_download.log
        """)
        
    except Exception as e:
        print(f"\n❌ ERROR FATAL: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
