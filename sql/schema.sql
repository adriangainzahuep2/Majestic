-- ============================================================================
-- Majestic Health App - Database Schema
-- Generated from schema.js
-- PostgreSQL 17.6
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- DROP EXISTING TABLES (with CASCADE to remove dependencies)
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
-- TABLE: users
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
-- TABLE: health_systems
-- ============================================================================

CREATE TABLE health_systems (
    id INTEGER PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert health systems data
INSERT INTO health_systems (id, name, description) VALUES (1, 'Cardiovascular', 'Heart and blood vessel health');
INSERT INTO health_systems (id, name, description) VALUES (2, 'Respiratory', 'Lung and breathing function');
INSERT INTO health_systems (id, name, description) VALUES (3, 'Digestive', 'Gastrointestinal health');
INSERT INTO health_systems (id, name, description) VALUES (4, 'Nervous', 'Brain and nerve function');
INSERT INTO health_systems (id, name, description) VALUES (5, 'Musculoskeletal', 'Bones, muscles, and joints');
INSERT INTO health_systems (id, name, description) VALUES (6, 'Endocrine', 'Hormones and metabolism');
INSERT INTO health_systems (id, name, description) VALUES (7, 'Immune', 'Immune system and defense');
INSERT INTO health_systems (id, name, description) VALUES (8, 'Renal', 'Kidney and urinary function');
INSERT INTO health_systems (id, name, description) VALUES (9, 'Reproductive', 'Reproductive health');
INSERT INTO health_systems (id, name, description) VALUES (10, 'Integumentary', 'Skin, hair, and nails');

-- ============================================================================
-- TABLE: uploads
-- ============================================================================

CREATE TABLE uploads (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    upload_type VARCHAR(50) DEFAULT 'manual',
    storage_path TEXT,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_uploads_user_id ON uploads(user_id);
CREATE INDEX idx_uploads_processed ON uploads(processed);

-- ============================================================================
-- TABLE: metrics
-- ============================================================================

CREATE TABLE metrics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
    health_system_id INTEGER REFERENCES health_systems(id),
    
    metric_name VARCHAR(255) NOT NULL,
    value DECIMAL(10,4),
    unit VARCHAR(50),
    
    reference_range_low DECIMAL(10,4),
    reference_range_high DECIMAL(10,4),
    reference_range_text TEXT,
    
    interpretation VARCHAR(50),
    severity_score INTEGER,
    
    test_date DATE,
    lab_name VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_metrics_user_id ON metrics(user_id);
CREATE INDEX idx_metrics_upload_id ON metrics(upload_id);
CREATE INDEX idx_metrics_health_system_id ON metrics(health_system_id);
CREATE INDEX idx_metrics_test_date ON metrics(test_date);

-- ============================================================================
-- TABLE: questionnaire_responses
-- ============================================================================

CREATE TABLE questionnaire_responses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    question_id VARCHAR(100) NOT NULL,
    question_text TEXT,
    answer TEXT,
    answer_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_questionnaire_user_id ON questionnaire_responses(user_id);

-- ============================================================================
-- TABLE: user_chronic_conditions
-- ============================================================================

CREATE TABLE user_chronic_conditions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    condition_name VARCHAR(255) NOT NULL,
    diagnosed_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chronic_conditions_user_id ON user_chronic_conditions(user_id);

-- ============================================================================
-- TABLE: user_allergies
-- ============================================================================

CREATE TABLE user_allergies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    allergen VARCHAR(255) NOT NULL,
    reaction VARCHAR(255),
    severity VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_allergies_user_id ON user_allergies(user_id);

-- ============================================================================
-- TABLE: ai_outputs_log
-- ============================================================================

CREATE TABLE ai_outputs_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    output_type VARCHAR(100),
    prompt TEXT,
    response TEXT,
    model VARCHAR(100),
    tokens_used INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_outputs_user_id ON ai_outputs_log(user_id);
CREATE INDEX idx_ai_outputs_type ON ai_outputs_log(output_type);

-- ============================================================================
-- TABLE: user_custom_metrics
-- ============================================================================

CREATE TABLE user_custom_metrics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    metric_name VARCHAR(255) NOT NULL,
    value DECIMAL(10,4),
    unit VARCHAR(50),
    recorded_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_custom_metrics_user_id ON user_custom_metrics(user_id);

-- ============================================================================
-- TABLE: imaging_studies
-- ============================================================================

CREATE TABLE imaging_studies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
    study_type VARCHAR(100),
    study_date DATE,
    body_part VARCHAR(100),
    findings TEXT,
    impression TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_imaging_user_id ON imaging_studies(user_id);

-- ============================================================================
-- TABLE: pending_metric_suggestions
-- ============================================================================

CREATE TABLE pending_metric_suggestions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    original_name VARCHAR(255),
    suggested_master_id INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TABLE: custom_reference_ranges
-- ============================================================================

CREATE TABLE custom_reference_ranges (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    metric_name VARCHAR(255),
    custom_low DECIMAL(10,4),
    custom_high DECIMAL(10,4),
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TABLE: master_metrics
-- ============================================================================

CREATE TABLE master_metrics (
    id SERIAL PRIMARY KEY,
    canonical_name VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    category VARCHAR(100),
    health_system_id INTEGER REFERENCES health_systems(id),
    default_unit VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TABLE: master_metric_synonyms
-- ============================================================================

CREATE TABLE master_metric_synonyms (
    id SERIAL PRIMARY KEY,
    master_metric_id INTEGER REFERENCES master_metrics(id) ON DELETE CASCADE,
    synonym VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_synonyms_master_id ON master_metric_synonyms(master_metric_id);

-- ============================================================================
-- TABLE: master_conversion_groups
-- ============================================================================

CREATE TABLE master_conversion_groups (
    id SERIAL PRIMARY KEY,
    group_name VARCHAR(100) UNIQUE NOT NULL,
    base_unit VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TABLE: master_versions
-- ============================================================================

CREATE TABLE master_versions (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TABLE: master_snapshots
-- ============================================================================

CREATE TABLE master_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    metrics_count INTEGER,
    synonyms_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for metrics table
CREATE TRIGGER update_metrics_updated_at BEFORE UPDATE ON metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for master_metrics table
CREATE TRIGGER update_master_metrics_updated_at BEFORE UPDATE ON master_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert a version record
INSERT INTO master_versions (version, description) 
VALUES ('1.0.0', 'Initial schema deployment');

-- ============================================================================
-- GRANTS (Optional - adjust based on your setup)
-- ============================================================================

-- Grant permissions to application user (if needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO majestic;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO majestic;

-- ============================================================================
-- SCHEMA CREATION COMPLETE
-- ============================================================================

SELECT 'Schema created successfully!' as status;
