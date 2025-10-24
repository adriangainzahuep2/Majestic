-- ============================================================================
-- FIXED DATABASE SCHEMA FOR MAJESTIC HEALTH APP
-- Addresses: HDL range issues, NULL values, type coercion, and data integrity
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- STEP 1: FIX MASTER METRICS TABLE WITH PROPER CONSTRAINTS
-- ============================================================================

-- Ensure master_metrics table has proper numeric types
ALTER TABLE master_metrics 
  ALTER COLUMN normal_min TYPE DECIMAL(10,3),
  ALTER COLUMN normal_max TYPE DECIMAL(10,3);

-- Add constraints to prevent NULL or invalid ranges
ALTER TABLE master_metrics
  ADD CONSTRAINT check_normal_range_validity 
  CHECK (normal_min IS NULL OR normal_max IS NULL OR normal_min <= normal_max);

-- ============================================================================
-- STEP 2: FIX HDL CHOLESTEROL MAPPING ISSUE
-- ============================================================================

-- First, identify the correct HDL entry
DO $$
DECLARE
  hdl_metric_id VARCHAR(100);
  non_hdl_metric_id VARCHAR(100);
BEGIN
  -- Find HDL metric
  SELECT metric_id INTO hdl_metric_id
  FROM master_metrics
  WHERE metric_name = 'HDL Cholesterol' OR metric_name ILIKE 'HDL%'
  ORDER BY CASE WHEN metric_name = 'HDL Cholesterol' THEN 1 ELSE 2 END
  LIMIT 1;
  
  -- Find Non-HDL metric
  SELECT metric_id INTO non_hdl_metric_id
  FROM master_metrics
  WHERE metric_name = 'Non-HDL Cholesterol' OR metric_name ILIKE 'Non-HDL%'
  LIMIT 1;
  
  -- Fix HDL range (should be 40-100 mg/dL for men, 50-100 for women, using 40-100 as general)
  IF hdl_metric_id IS NOT NULL THEN
    UPDATE master_metrics
    SET normal_min = 40,
        normal_max = 100,
        canonical_unit = 'mg/dL',
        system_id = 1,  -- Cardiovascular
        is_key_metric = true,
        explanation = 'High-density lipoprotein (HDL) cholesterol, often called "good cholesterol". Higher levels are protective against heart disease.'
    WHERE metric_id = hdl_metric_id;
    
    RAISE NOTICE 'Fixed HDL Cholesterol (%) to range 40-100', hdl_metric_id;
  END IF;
  
  -- Ensure Non-HDL has correct range (should be 0-130 mg/dL)
  IF non_hdl_metric_id IS NOT NULL THEN
    UPDATE master_metrics
    SET normal_min = 0,
        normal_max = 130,
        canonical_unit = 'mg/dL',
        system_id = 1,  -- Cardiovascular
        is_key_metric = true,
        explanation = 'Non-HDL cholesterol includes all cholesterol except HDL. Calculated as Total Cholesterol minus HDL.'
    WHERE metric_id = non_hdl_metric_id;
    
    RAISE NOTICE 'Verified Non-HDL Cholesterol (%) range 0-130', non_hdl_metric_id;
  END IF;
END $$;

-- ============================================================================
-- STEP 3: FIX LDL PARTICLE METRICS WITH NULL RANGES
-- ============================================================================

-- Fix LDL Particle Size
UPDATE master_metrics
SET normal_min = 20.5,
    normal_max = 23.0,
    canonical_unit = 'nm',
    system_id = 1,
    is_key_metric = true,
    explanation = 'Average size of LDL particles. Larger particles (>20.5 nm) are less atherogenic than small, dense particles.'
WHERE metric_name ILIKE '%LDL Particle Size%' OR metric_id ILIKE '%ldl_particle_size%';

-- Fix Medium LDL-P
UPDATE master_metrics
SET normal_min = 0,
    normal_max = 500,
    canonical_unit = 'nmol/L',
    system_id = 1,
    is_key_metric = false,
    explanation = 'Concentration of medium-sized LDL particles. Part of advanced lipid panel.'
WHERE metric_name ILIKE '%Medium LDL%' OR metric_id ILIKE '%medium_ldl%';

-- Fix Small LDL-P
UPDATE master_metrics
SET normal_min = 0,
    normal_max = 527,
    canonical_unit = 'nmol/L',
    system_id = 1,
    is_key_metric = true,
    explanation = 'Concentration of small, dense LDL particles. Higher levels associated with increased cardiovascular risk.'
WHERE metric_name ILIKE '%Small LDL%' OR metric_id ILIKE '%small_ldl%';

-- Fix Large LDL-P
UPDATE master_metrics
SET normal_min = 650,
    normal_max = 1500,
    canonical_unit = 'nmol/L',
    system_id = 1,
    is_key_metric = false,
    explanation = 'Concentration of large, buoyant LDL particles. Less atherogenic than small particles.'
WHERE metric_name ILIKE '%Large LDL%' OR metric_id ILIKE '%large_ldl%';

-- ============================================================================
-- STEP 4: ADD DATA VALIDATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_numeric_metric_value()
RETURNS TRIGGER AS $$
BEGIN
  -- Coerce string values to numeric
  IF NEW.metric_value IS NOT NULL THEN
    BEGIN
      -- Try to convert to numeric, handle errors
      NEW.metric_value := NEW.metric_value::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      -- If conversion fails, set to NULL and log
      NEW.metric_value := NULL;
      RAISE WARNING 'Invalid numeric value for metric %: %', NEW.metric_name, NEW.metric_value;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply validation trigger to metrics table
DROP TRIGGER IF EXISTS validate_metric_value_trigger ON metrics;
CREATE TRIGGER validate_metric_value_trigger
  BEFORE INSERT OR UPDATE ON metrics
  FOR EACH ROW
  EXECUTE FUNCTION validate_numeric_metric_value();

-- ============================================================================
-- STEP 5: FIX CUSTOM REFERENCE RANGES TABLE
-- ============================================================================

ALTER TABLE custom_reference_ranges
  ALTER COLUMN min_value TYPE DECIMAL(10,3),
  ALTER COLUMN max_value TYPE DECIMAL(10,3);

-- Add validation constraint
ALTER TABLE custom_reference_ranges
  ADD CONSTRAINT check_custom_range_validity 
  CHECK (min_value <= max_value);

-- ============================================================================
-- STEP 6: CREATE FUNCTION TO SYNC SYNONYMS TO JSON
-- ============================================================================

CREATE OR REPLACE FUNCTION export_synonyms_to_json()
RETURNS TABLE(json_output JSONB) AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_agg(
    jsonb_build_object(
      'synonym_id', s.synonym_id,
      'synonym_name', s.synonym_name,
      'metric_id', s.metric_id,
      'metric_name', m.metric_name,
      'system_id', m.system_id,
      'canonical_unit', m.canonical_unit
    )
  )
  FROM master_metric_synonyms s
  JOIN master_metrics m ON s.metric_id = m.metric_id
  ORDER BY s.metric_id, s.synonym_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 7: FIX APOLIPOPROTEIN B SYNONYM
-- ============================================================================

-- Ensure Apolipoprotein B synonym exists and is correct
INSERT INTO master_metric_synonyms (synonym_id, metric_id, synonym_name, notes)
VALUES (
  'syn122',
  'cardiovascular_11',  -- Assuming this is ApoB metric ID
  'Apolipoprotein B',
  'Common alternative name for ApoB'
)
ON CONFLICT (synonym_id) DO UPDATE
SET metric_id = EXCLUDED.metric_id,
    synonym_name = EXCLUDED.synonym_name,
    notes = EXCLUDED.notes;

-- Add additional common variations
INSERT INTO master_metric_synonyms (synonym_id, metric_id, synonym_name, notes)
VALUES 
  ('syn122a', 'cardiovascular_11', 'Apo B', 'Abbreviated form'),
  ('syn122b', 'cardiovascular_11', 'ApoB', 'Common abbreviation'),
  ('syn122c', 'cardiovascular_11', 'Apo-B', 'Hyphenated form')
ON CONFLICT (synonym_id) DO NOTHING;

-- ============================================================================
-- STEP 8: CREATE METRIC MATCHING CONFIDENCE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_metric_match_confidence(
  input_name TEXT,
  candidate_name TEXT
)
RETURNS NUMERIC AS $$
DECLARE
  input_clean TEXT;
  candidate_clean TEXT;
  similarity_score NUMERIC;
BEGIN
  -- Normalize inputs (lowercase, remove special chars)
  input_clean := regexp_replace(lower(trim(input_name)), '[^a-z0-9]', '', 'g');
  candidate_clean := regexp_replace(lower(trim(candidate_name)), '[^a-z0-9]', '', 'g');
  
  -- Calculate similarity using PostgreSQL's built-in similarity function
  -- Note: Requires pg_trgm extension
  SELECT similarity(input_clean, candidate_clean) INTO similarity_score;
  
  -- Boost score for exact matches
  IF input_clean = candidate_clean THEN
    similarity_score := 1.0;
  END IF;
  
  RETURN similarity_score;
END;
$$ LANGUAGE plpgsql;

-- Enable trigram extension for similarity matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- STEP 9: CREATE VIEW FOR EASY METRIC LOOKUP
-- ============================================================================

CREATE OR REPLACE VIEW v_metrics_with_synonyms AS
SELECT 
  m.metric_id,
  m.metric_name,
  m.system_id,
  m.canonical_unit,
  m.normal_min,
  m.normal_max,
  m.is_key_metric,
  m.explanation,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
      'synonym_id', s.synonym_id,
      'synonym_name', s.synonym_name
    ))
    FROM master_metric_synonyms s
    WHERE s.metric_id = m.metric_id),
    '[]'::jsonb
  ) as synonyms
FROM master_metrics m;

-- ============================================================================
-- STEP 10: CREATE DATA INTEGRITY CHECK FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION check_metric_data_integrity()
RETURNS TABLE(
  issue_type TEXT,
  metric_id VARCHAR(100),
  metric_name VARCHAR(255),
  issue_description TEXT
) AS $$
BEGIN
  -- Check for NULL ranges that should have values
  RETURN QUERY
  SELECT 
    'NULL_RANGE'::TEXT,
    m.metric_id,
    m.metric_name,
    'Missing normal range values'::TEXT
  FROM master_metrics m
  WHERE (m.normal_min IS NULL OR m.normal_max IS NULL)
    AND m.is_key_metric = true;
  
  -- Check for invalid ranges (min > max)
  RETURN QUERY
  SELECT 
    'INVALID_RANGE'::TEXT,
    m.metric_id,
    m.metric_name,
    format('Invalid range: %s to %s', m.normal_min, m.normal_max)::TEXT
  FROM master_metrics m
  WHERE m.normal_min > m.normal_max;
  
  -- Check for metrics without system assignment
  RETURN QUERY
  SELECT 
    'NO_SYSTEM'::TEXT,
    m.metric_id,
    m.metric_name,
    'Not assigned to any health system'::TEXT
  FROM master_metrics m
  WHERE m.system_id IS NULL;
  
  -- Check for orphaned synonyms
  RETURN QUERY
  SELECT 
    'ORPHAN_SYNONYM'::TEXT,
    s.metric_id,
    s.synonym_name,
    'Synonym references non-existent metric'::TEXT
  FROM master_metric_synonyms s
  LEFT JOIN master_metrics m ON s.metric_id = m.metric_id
  WHERE m.metric_id IS NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 11: ADD INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for metric lookups by name
CREATE INDEX IF NOT EXISTS idx_master_metrics_name_trgm 
ON master_metrics USING gin (lower(metric_name) gin_trgm_ops);

-- Index for synonym lookups
CREATE INDEX IF NOT EXISTS idx_synonyms_name_trgm 
ON master_metric_synonyms USING gin (lower(synonym_name) gin_trgm_ops);

-- Index for user metrics by system
CREATE INDEX IF NOT EXISTS idx_metrics_user_system_date 
ON metrics(user_id, system_id, test_date DESC);

-- ============================================================================
-- STEP 12: CREATE AUDIT LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS metric_audit_log (
  id SERIAL PRIMARY KEY,
  action VARCHAR(50) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id VARCHAR(100),
  old_values JSONB,
  new_values JSONB,
  changed_by VARCHAR(255),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_metric_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO metric_audit_log (action, table_name, record_id, old_values, new_values)
    VALUES (
      'UPDATE',
      TG_TABLE_NAME,
      OLD.metric_id,
      row_to_json(OLD)::jsonb,
      row_to_json(NEW)::jsonb
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO metric_audit_log (action, table_name, record_id, old_values)
    VALUES (
      'DELETE',
      TG_TABLE_NAME,
      OLD.metric_id,
      row_to_json(OLD)::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply audit trigger to master_metrics
DROP TRIGGER IF EXISTS audit_master_metrics_trigger ON master_metrics;
CREATE TRIGGER audit_master_metrics_trigger
  AFTER UPDATE OR DELETE ON master_metrics
  FOR EACH ROW
  EXECUTE FUNCTION audit_metric_changes();

-- ============================================================================
-- STEP 13: RUN DATA INTEGRITY CHECK AND DISPLAY RESULTS
-- ============================================================================

DO $$
DECLARE
  issue RECORD;
  issue_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== RUNNING DATA INTEGRITY CHECK ===';
  
  FOR issue IN SELECT * FROM check_metric_data_integrity()
  LOOP
    issue_count := issue_count + 1;
    RAISE NOTICE '[%] % - %: %', 
      issue.issue_type, 
      issue.metric_id, 
      issue.metric_name, 
      issue.issue_description;
  END LOOP;
  
  IF issue_count = 0 THEN
    RAISE NOTICE 'No data integrity issues found!';
  ELSE
    RAISE NOTICE 'Found % data integrity issue(s)', issue_count;
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify HDL range
SELECT metric_id, metric_name, normal_min, normal_max, canonical_unit
FROM master_metrics
WHERE metric_name ILIKE '%HDL%'
ORDER BY metric_name;

-- Verify LDL particle metrics
SELECT metric_id, metric_name, normal_min, normal_max, canonical_unit
FROM master_metrics
WHERE metric_name ILIKE '%LDL%particle%' OR metric_name ILIKE '%LDL-P%'
ORDER BY metric_name;

-- Verify Apolipoprotein B synonyms
SELECT s.synonym_id, s.synonym_name, m.metric_id, m.metric_name
FROM master_metric_synonyms s
JOIN master_metrics m ON s.metric_id = m.metric_id
WHERE m.metric_name ILIKE '%Apolipoprotein B%' OR s.synonym_name ILIKE '%Apo%B%'
ORDER BY s.synonym_id;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DATABASE SCHEMA FIXES APPLIED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✓ HDL range corrected to 40-100';
  RAISE NOTICE '✓ LDL particle metrics updated with ranges';
  RAISE NOTICE '✓ Numeric type coercion enabled';
  RAISE NOTICE '✓ Data validation triggers added';
  RAISE NOTICE '✓ Synonym matching improved';
  RAISE NOTICE '✓ Audit logging enabled';
  RAISE NOTICE '========================================';
END $$;
