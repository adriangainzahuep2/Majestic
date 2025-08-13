-- =====================================================
-- Majestic Health Dashboard - Development Database Schema
-- PostgreSQL Schema Generation
-- Generated: August 13, 2025
-- =====================================================

-- Drop existing tables if they exist (in dependency order)
DROP TABLE IF EXISTS ai_outputs_log CASCADE;
DROP TABLE IF EXISTS imaging_studies CASCADE;
DROP TABLE IF EXISTS metrics CASCADE;
DROP TABLE IF EXISTS questionnaire_responses CASCADE;
DROP TABLE IF EXISTS uploads CASCADE;
DROP TABLE IF EXISTS user_custom_metrics CASCADE;
DROP TABLE IF EXISTS health_systems CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- 1. USERS TABLE - Authentication & User Profiles
-- =====================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    google_id VARCHAR(255) UNIQUE,
    name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. HEALTH_SYSTEMS TABLE - Body Systems Reference (13 systems)
-- =====================================================
CREATE TABLE health_systems (
    id INTEGER PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 3. UPLOADS TABLE - File Processing Pipeline
-- =====================================================
CREATE TABLE uploads (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    upload_type VARCHAR(50) DEFAULT 'manual',
    storage_path TEXT,
    processing_status VARCHAR(50) DEFAULT 'pending',
    processing_error TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITHOUT TIME ZONE
);

-- =====================================================
-- 4. METRICS TABLE - Core Health Measurements
-- =====================================================
CREATE TABLE metrics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    upload_id INTEGER REFERENCES uploads(id),
    system_id INTEGER REFERENCES health_systems(id),
    metric_name VARCHAR(255) NOT NULL,
    metric_value NUMERIC,
    metric_unit VARCHAR(50),
    reference_range TEXT,
    is_key_metric BOOLEAN DEFAULT false,
    is_outlier BOOLEAN DEFAULT false,
    test_date DATE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint to prevent duplicate metrics
    UNIQUE(user_id, metric_name, test_date, upload_id)
);

-- =====================================================
-- 5. AI_OUTPUTS_LOG TABLE - AI Processing Audit Trail
-- =====================================================
CREATE TABLE ai_outputs_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    system_id INTEGER REFERENCES health_systems(id),
    output_type VARCHAR(100) NOT NULL,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    model_version VARCHAR(50) DEFAULT 'gpt-4o',
    processing_time_ms INTEGER,
    is_current BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 6. IMAGING_STUDIES TABLE - Visual Studies (Phase 1)
-- =====================================================
CREATE TABLE imaging_studies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
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
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 7. USER_CUSTOM_METRICS TABLE - Custom Metric Management
-- =====================================================
CREATE TABLE user_custom_metrics (
    id SERIAL PRIMARY KEY,
    system_id INTEGER NOT NULL REFERENCES health_systems(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    metric_name TEXT NOT NULL,
    value TEXT NOT NULL,
    units VARCHAR(50) NOT NULL,
    normal_range_min NUMERIC,
    normal_range_max NUMERIC,
    range_applicable_to VARCHAR(10) NOT NULL DEFAULT 'All',
    source_type VARCHAR(20) NOT NULL DEFAULT 'user',
    review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Check constraints
    CONSTRAINT user_custom_metrics_source_type_check 
        CHECK (source_type IN ('user', 'official')),
    CONSTRAINT user_custom_metrics_review_status_check 
        CHECK (review_status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT user_custom_metrics_range_applicable_to_check 
        CHECK (range_applicable_to IN ('F', 'M', 'Other', 'All')),
    CONSTRAINT user_custom_metrics_units_check 
        CHECK (units IN (
            'g', 'mg', 'µg', 'ng', 'pg', 'mol/L', 'mmol/L', 'µmol/L', 'nmol/L',
            'mg/dL', 'g/dL', 'µg/dL', 'ng/dL', 'mg/L', 'µg/L', 'ng/mL',
            'L', 'mL', 'µL', 'mmHg', 'bpm', 'breaths/min', '°C', '°F',
            '×10⁹/L', '×10¹²/L', '#/µL', '%', 'ratio', 'sec', 'min', 'hr',
            'IU/L', 'mEq/L', 'U/L', 'g/24h', 'Osm/kg', 'Osm/L', 'kg', 'cm',
            'mmol/mol', 'Angstrom', 'Other'
        ))
);

-- =====================================================
-- 8. QUESTIONNAIRE_RESPONSES TABLE - User Input Data
-- =====================================================
CREATE TABLE questionnaire_responses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    question_type VARCHAR(255) NOT NULL,
    question TEXT NOT NULL,
    response TEXT NOT NULL,
    response_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PERFORMANCE INDEXES
-- =====================================================

-- AI Outputs Log Indexes
CREATE INDEX idx_ai_outputs_log_system_id ON ai_outputs_log(system_id);
CREATE INDEX idx_ai_outputs_user_system ON ai_outputs_log(user_id, system_id, output_type);
CREATE INDEX idx_ai_outputs_user_type ON ai_outputs_log(user_id, output_type);

-- Imaging Studies Indexes
CREATE INDEX idx_imaging_studies_type_date ON imaging_studies(study_type, test_date);
CREATE INDEX idx_imaging_studies_user_system ON imaging_studies(user_id, linked_system_id);

-- Metrics Indexes (Critical for Dashboard Performance)
CREATE INDEX idx_metrics_test_date ON metrics(test_date);
CREATE INDEX idx_metrics_user_system ON metrics(user_id, system_id);

-- Uploads Indexes
CREATE INDEX idx_uploads_user_status ON uploads(user_id, processing_status);

-- User Custom Metrics Indexes
CREATE INDEX idx_user_custom_metrics_review ON user_custom_metrics(source_type, review_status);
CREATE INDEX idx_user_custom_metrics_source_status ON user_custom_metrics(source_type, review_status);
CREATE INDEX idx_user_custom_metrics_system_user ON user_custom_metrics(system_id, user_id);
CREATE INDEX idx_user_custom_metrics_user_system ON user_custom_metrics(user_id, system_id);

-- =====================================================
-- INITIAL DATA - Health Systems (13 Body Systems)
-- =====================================================
INSERT INTO health_systems (id, name, description) VALUES 
(1, 'Cardiovascular', 'Heart, blood vessels, and circulation'),
(2, 'Nervous/Brain', 'Brain, spinal cord, and nervous system'),
(3, 'Respiratory', 'Lungs and breathing system'),
(4, 'Muscular', 'Muscles and movement'),
(5, 'Skeletal', 'Bones, joints, and skeletal structure'),
(6, 'Digestive', 'Stomach, intestines, and digestion'),
(7, 'Endocrine', 'Hormones and endocrine glands'),
(8, 'Urinary', 'Kidneys, bladder, and urinary system'),
(9, 'Reproductive', 'Reproductive organs and hormones'),
(10, 'Integumentary', 'Skin, hair, and nails'),
(11, 'Immune/Inflammation', 'Immune system and inflammation markers'),
(12, 'Sensory', 'Eyes, ears, and sensory organs'),
(13, 'Biological Age', 'Age-related biomarkers and longevity');

-- =====================================================
-- GRANT PERMISSIONS (if needed for specific users)
-- =====================================================
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- =====================================================
-- SCHEMA VERIFICATION
-- =====================================================
-- Verify table creation
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Verify relationships
SELECT 
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- =====================================================
-- END OF SCHEMA
-- =====================================================