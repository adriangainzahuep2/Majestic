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
