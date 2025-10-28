#!/usr/bin/env python3
"""
Majestic Health App - Database Schema Manager
Gestión avanzada de schema PostgreSQL usando S3 y boto3
"""

import boto3
import hashlib
import json
import sys
from datetime import datetime
from botocore.exceptions import ClientError
from typing import Dict, Optional

class MajesticDBManager:
    def __init__(self, region: str = 'us-east-1'):
        """
        Inicializa el gestor de base de datos
        
        Args:
            region: Región de AWS a utilizar
        """
        self.s3_client = boto3.client('s3', region_name=region)
        self.rds_client = boto3.client('rds', region_name=region)
        self.sts_client = boto3.client('sts', region_name=region)
        self.region = region
        
        # Configuración
        self.bucket_name = "majestic-health-db-scripts"
        self.db_endpoint = "health-app.c4vuie06a0wt.us-east-1.rds.amazonaws.com"
        self.db_name = "health_app"
        self.db_user = "majestic"
        
    def check_bucket_exists(self) -> bool:
        """
        Verifica si el bucket S3 existe
        
        Returns:
            True si existe, False en caso contrario
        """
        try:
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            print(f"✓ Bucket encontrado: {self.bucket_name}")
            return True
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == '404':
                print(f"✗ Bucket no encontrado: {self.bucket_name}")
                return False
            else:
                print(f"✗ Error verificando bucket: {e}")
                return False
    
    def create_secure_bucket(self) -> Dict:
        """
        Crea un bucket S3 seguro para scripts de base de datos
        
        Returns:
            Diccionario con información del bucket creado
        """
        print(f"\n🔐 Creando bucket seguro: {self.bucket_name}")
        
        try:
            # Crear bucket
            if self.region == 'us-east-1':
                self.s3_client.create_bucket(Bucket=self.bucket_name)
            else:
                self.s3_client.create_bucket(
                    Bucket=self.bucket_name,
                    CreateBucketConfiguration={'LocationConstraint': self.region}
                )
            print(f"  ✓ Bucket creado")
            
            # Habilitar versionado
            self.s3_client.put_bucket_versioning(
                Bucket=self.bucket_name,
                VersioningConfiguration={'Status': 'Enabled'}
            )
            print(f"  ✓ Versionado habilitado")
            
            # Habilitar encriptación AES-256
            self.s3_client.put_bucket_encryption(
                Bucket=self.bucket_name,
                ServerSideEncryptionConfiguration={
                    'Rules': [{
                        'ApplyServerSideEncryptionByDefault': {
                            'SSEAlgorithm': 'AES256'
                        },
                        'BucketKeyEnabled': True
                    }]
                }
            )
            print(f"  ✓ Encriptación configurada")
            
            # Bloquear acceso público
            self.s3_client.put_public_access_block(
                Bucket=self.bucket_name,
                PublicAccessBlockConfiguration={
                    'BlockPublicAcls': True,
                    'IgnorePublicAcls': True,
                    'BlockPublicPolicy': True,
                    'RestrictPublicBuckets': True
                }
            )
            print(f"  ✓ Acceso público bloqueado")
            
            # Configurar ciclo de vida
            self.s3_client.put_bucket_lifecycle_configuration(
                Bucket=self.bucket_name,
                LifecycleConfiguration={
                    'Rules': [{
                        'Id': 'DeleteOldVersions',
                        'Status': 'Enabled',
                        'Prefix': 'database/',
                        'NoncurrentVersionExpiration': {
                            'NoncurrentDays': 30
                        }
                    }]
                }
            )
            print(f"  ✓ Ciclo de vida configurado (30 días)")
            
            print(f"✅ Bucket {self.bucket_name} creado exitosamente\n")
            
            return {
                'bucket_name': self.bucket_name,
                'region': self.region,
                'encryption': 'AES256',
                'versioning': 'Enabled',
                'public_access': 'Blocked'
            }
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'BucketAlreadyOwnedByYou':
                print(f"  ⚠️ Bucket {self.bucket_name} ya existe\n")
                return {'bucket_name': self.bucket_name, 'status': 'exists'}
            else:
                print(f"❌ Error creando bucket: {e}\n")
                raise
    
    def upload_init_script(self, script_path: str = 'init_db.sql') -> Dict:
        """
        Sube el script de inicialización a S3 con versionado
        
        Args:
            script_path: Ruta al archivo init_db.sql
            
        Returns:
            Diccionario con información del archivo subido
        """
        print(f"\n📤 Subiendo script de inicialización: {script_path}")
        
        try:
            # Leer y hashear el contenido
            with open(script_path, 'rb') as f:
                content = f.read()
            
            sha256_hash = hashlib.sha256(content).hexdigest()
            md5_hash = hashlib.md5(content).hexdigest()
            
            print(f"  SHA256: {sha256_hash}")
            print(f"  Tamaño: {len(content)} bytes")
            
            # Key con timestamp para versionado
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            s3_key = f"database/init_db_{timestamp}.sql"
            s3_key_latest = "database/init_db_latest.sql"
            
            # Metadatos
            metadata = {
                'sha256': sha256_hash,
                'md5': md5_hash,
                'uploaded-by': self.sts_client.get_caller_identity()['Arn'],
                'upload-timestamp': datetime.utcnow().isoformat(),
                'content-type': 'application/sql'
            }
            
            # Subir versión con timestamp
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=content,
                ServerSideEncryption='AES256',
                Metadata=metadata,
                ContentType='application/sql',
                StorageClass='STANDARD_IA'
            )
            print(f"  ✓ Subido: s3://{self.bucket_name}/{s3_key}")
            
            # Copiar como "latest"
            self.s3_client.copy_object(
                Bucket=self.bucket_name,
                CopySource={'Bucket': self.bucket_name, 'Key': s3_key},
                Key=s3_key_latest,
                ServerSideEncryption='AES256',
                Metadata=metadata,
                MetadataDirective='REPLACE'
            )
            print(f"  ✓ Actualizado: s3://{self.bucket_name}/{s3_key_latest}")
            
            # Obtener version ID
            version_id = self.s3_client.head_object(
                Bucket=self.bucket_name,
                Key=s3_key
            ).get('VersionId')
            
            print(f"✅ Script subido exitosamente\n")
            
            return {
                'bucket': self.bucket_name,
                'key': s3_key,
                'latest_key': s3_key_latest,
                'sha256': sha256_hash,
                'md5': md5_hash,
                'version_id': version_id,
                's3_uri': f"s3://{self.bucket_name}/{s3_key}",
                's3_uri_latest': f"s3://{self.bucket_name}/{s3_key_latest}"
            }
            
        except FileNotFoundError:
            print(f"❌ Archivo no encontrado: {script_path}\n")
            sys.exit(1)
        except Exception as e:
            print(f"❌ Error subiendo script: {e}\n")
            raise
    
    def list_script_versions(self) -> list:
        """
        Lista todas las versiones del script en S3
        
        Returns:
            Lista de versiones con metadatos
        """
        print(f"\n📋 Listando versiones de scripts en S3:")
        
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix='database/'
            )
            
            if 'Contents' not in response:
                print("  No se encontraron scripts")
                return []
            
            versions = []
            for obj in response['Contents']:
                key = obj['Key']
                
                # Obtener metadatos
                metadata = self.s3_client.head_object(
                    Bucket=self.bucket_name,
                    Key=key
                )
                
                version_info = {
                    'key': key,
                    'size': obj['Size'],
                    'last_modified': obj['LastModified'].isoformat(),
                    'sha256': metadata.get('Metadata', {}).get('sha256', 'N/A'),
                    'storage_class': obj.get('StorageClass', 'STANDARD')
                }
                
                versions.append(version_info)
                
                print(f"\n  📄 {key}")
                print(f"     Tamaño: {obj['Size']} bytes")
                print(f"     Última modificación: {obj['LastModified']}")
                print(f"     SHA256: {version_info['sha256'][:16]}...")
            
            print(f"\n✅ Total de versiones encontradas: {len(versions)}\n")
            return versions
            
        except ClientError as e:
            print(f"❌ Error listando versiones: {e}\n")
            return []
    
    def verify_rds_connectivity(self) -> bool:
        """
        Verifica la conectividad con RDS PostgreSQL
        
        Returns:
            True si RDS está disponible, False en caso contrario
        """
        print(f"\n🔍 Verificando conectividad con RDS PostgreSQL")
        print(f"  Endpoint: {self.db_endpoint}")
        print(f"  Database: {self.db_name}")
        print(f"  User: {self.db_user}")
        
        try:
            response = self.rds_client.describe_db_instances()
            
            for instance in response['DBInstances']:
                endpoint = instance.get('Endpoint', {})
                if endpoint.get('Address') == self.db_endpoint:
                    status = instance['DBInstanceStatus']
                    engine = instance['Engine']
                    engine_version = instance['EngineVersion']
                    
                    print(f"\n  ✓ Instancia encontrada")
                    print(f"    Estado: {status}")
                    print(f"    Motor: {engine} {engine_version}")
                    print(f"    Clase: {instance['DBInstanceClass']}")
                    print(f"    Almacenamiento: {instance['AllocatedStorage']} GB")
                    
                    if status == 'available':
                        print(f"\n✅ RDS disponible y listo\n")
                        return True
                    else:
                        print(f"\n⚠️ RDS no disponible (estado: {status})\n")
                        return False
            
            print(f"\n❌ No se encontró la instancia RDS\n")
            return False
            
        except ClientError as e:
            print(f"\n❌ Error verificando RDS: {e}\n")
            return False
    
    def generate_download_script(self, sha256_hash: str) -> str:
        """
        Genera script bash para descargar y ejecutar init_db.sql
        
        Args:
            sha256_hash: Hash SHA256 del archivo para verificación
            
        Returns:
            Script bash como string
        """
        script = f'''#!/bin/bash
set -euo pipefail

# ============================================================================
# Script de Descarga y Ejecución de init_db.sql desde S3
# Generado automáticamente por MajesticDBManager
# ============================================================================

BUCKET_NAME="{self.bucket_name}"
S3_KEY="database/init_db_latest.sql"
LOCAL_PATH="/opt/majestic-app/init_db.sql"
EXPECTED_SHA256="{sha256_hash}"

DB_ENDPOINT="{self.db_endpoint}"
DB_PORT="5432"
DB_NAME="{self.db_name}"
DB_USER="{self.db_user}"

LOG_FILE="/var/log/init_db.log"
SUCCESS_FLAG="/opt/majestic-app/.db-initialized"

echo "════════════════════════════════════════════════════════════"
echo "Descarga y Ejecución de init_db.sql"
echo "════════════════════════════════════════════════════════════"
echo ""

# Verificar si ya se inicializó
if [ -f "$SUCCESS_FLAG" ]; then
    echo "⚠️  Base de datos ya fue inicializada"
    echo "   Fecha: $(cat $SUCCESS_FLAG)"
    echo ""
    echo "Para reinicializar, elimina: $SUCCESS_FLAG"
    exit 0
fi

# Descargar desde S3
echo "📥 Descargando init_db.sql desde S3..."
aws s3 cp "s3://${{BUCKET_NAME}}/${{S3_KEY}}" "$LOCAL_PATH" --region {self.region}

if [ $? -ne 0 ]; then
    echo "❌ Error al descargar desde S3"
    exit 1
fi

echo "✓ Archivo descargado"

# Verificar SHA256
echo "🔍 Verificando integridad..."
DOWNLOADED_SHA256=$(sha256sum "$LOCAL_PATH" | awk '{{print $1}}')

if [ "$DOWNLOADED_SHA256" != "$EXPECTED_SHA256" ]; then
    echo "❌ Error: Hash SHA256 no coincide"
    echo "   Esperado: $EXPECTED_SHA256"
    echo "   Obtenido: $DOWNLOADED_SHA256"
    rm -f "$LOCAL_PATH"
    exit 1
fi

echo "✓ Verificación exitosa"

# Esperar disponibilidad de RDS
echo ""
echo "⏳ Esperando disponibilidad de RDS..."
for i in {{1..30}}; do
    if pg_isready -h "$DB_ENDPOINT" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1; then
        echo "✓ RDS disponible"
        break
    fi
    echo "   Esperando... intento $i/30"
    sleep 10
done

# Ejecutar script SQL
echo ""
echo "⚙️  Ejecutando init_db.sql..."
PGPASSWORD="${{DB_PASSWORD}}" psql \\
    -h "$DB_ENDPOINT" \\
    -p "$DB_PORT" \\
    -U "$DB_USER" \\
    -d "$DB_NAME" \\
    -f "$LOCAL_PATH" \\
    -v ON_ERROR_STOP=1 \\
    --echo-all | tee -a "$LOG_FILE"

if [ ${{PIPESTATUS[0]}} -eq 0 ]; then
    echo ""
    echo "✅ Schema de base de datos inicializado correctamente"
    echo "$(date -Iseconds)" > "$SUCCESS_FLAG"
    echo ""
    echo "════════════════════════════════════════════════════════════"
else
    echo ""
    echo "❌ Error al ejecutar init_db.sql"
    echo "   Ver logs en: $LOG_FILE"
    echo ""
    exit 1
fi
'''
        return script
    
    def save_download_script(self, sha256_hash: str, output_path: str = 'download_and_init_db.sh'):
        """
        Guarda el script de descarga en un archivo
        
        Args:
            sha256_hash: Hash SHA256 del archivo
            output_path: Ruta donde guardar el script
        """
        script = self.generate_download_script(sha256_hash)
        
        with open(output_path, 'w') as f:
            f.write(script)
        
        import os
        os.chmod(output_path, 0o755)
        
        print(f"✅ Script de descarga guardado: {output_path}\n")
    
    def display_summary(self, upload_info: Dict):
        """
        Muestra un resumen del proceso
        
        Args:
            upload_info: Información del archivo subido
        """
        print("╔═══════════════════════════════════════════════════════════════╗")
        print("║                    RESUMEN DEL PROCESO                        ║")
        print("╚═══════════════════════════════════════════════════════════════╝")
        print()
        print("📦 Bucket S3:")
        print(f"   {self.bucket_name}")
        print()
        print("📄 Script subido:")
        print(f"   URI: {upload_info['s3_uri']}")
        print(f"   Latest: {upload_info['s3_uri_latest']}")
        print(f"   SHA256: {upload_info['sha256']}")
        print(f"   Version ID: {upload_info.get('version_id', 'N/A')}")
        print()
        print("🗄️ Base de Datos:")
        print(f"   Endpoint: {self.db_endpoint}")
        print(f"   Database: {self.db_name}")
        print(f"   User: {self.db_user}")
        print()
        print("🔐 Características de Seguridad:")
        print("   ✓ Encriptación AES-256")
        print("   ✓ Versionado habilitado")
        print("   ✓ Acceso público bloqueado")
        print("   ✓ Verificación de integridad SHA256")
        print("   ✓ Ciclo de vida (30 días)")
        print()
        print("📋 Próximos pasos:")
        print("   1. Ejecutar el script de despliegue de Lightsail")
        print("   2. El User Data descargará y ejecutará init_db.sql automáticamente")
        print("   3. Verificar logs en /var/log/init_db.log")
        print()


def main():
    """
    Función principal
    """
    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║         MAJESTIC HEALTH - Database Schema Manager            ║")
    print("╚═══════════════════════════════════════════════════════════════╝")
    print()
    
    # Inicializar gestor
    manager = MajesticDBManager(region='us-east-1')
    
    # Verificar/crear bucket
    if not manager.check_bucket_exists():
        manager.create_secure_bucket()
    
    # Verificar RDS
    manager.verify_rds_connectivity()
    
    # Subir script
    upload_info = manager.upload_init_script('init_db.sql')
    
    # Generar script de descarga
    manager.save_download_script(
        sha256_hash=upload_info['sha256'],
        output_path='download_and_init_db.sh'
    )
    
    # Listar versiones
    manager.list_script_versions()
    
    # Mostrar resumen
    manager.display_summary(upload_info)
    
    print("✅ Proceso completado exitosamente")
    print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️ Proceso interrumpido por el usuario")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error fatal: {e}")
        sys.exit(1)
