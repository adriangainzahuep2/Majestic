-- Database Snapshot Created: 2025-08-21T18:48:51.323Z
-- Environment: development
-- Tables: 10

-- Table: __drizzle_migrations
-- Columns: 3
-- Rows: 0

-- Table: ai_outputs_log
-- Columns: 8
-- Rows: 0

-- Table: daily_plans
-- Columns: 6
-- Rows: 0

-- Table: health_systems
-- Columns: 4
-- Rows: 13

-- Data for health_systems
INSERT INTO health_systems (id, name, description, created_at) VALUES (12, 'Sensory', 'Vision, hearing, and sensory function', '2025-08-21T18:25:26.248Z');
INSERT INTO health_systems (id, name, description, created_at) VALUES (13, 'Biological Age', 'Cellular aging and longevity markers', '2025-08-21T18:25:26.304Z');
INSERT INTO health_systems (id, name, description, created_at) VALUES (1, 'Cardiovascular', 'Heart and blood vessel health', '2025-08-21T18:25:25.618Z');
INSERT INTO health_systems (id, name, description, created_at) VALUES (2, 'Nervous/Brain', 'Cognitive and neurological function', '2025-08-21T18:25:25.676Z');
INSERT INTO health_systems (id, name, description, created_at) VALUES (3, 'Respiratory', 'Lung and breathing function', '2025-08-21T18:25:25.733Z');
INSERT INTO health_systems (id, name, description, created_at) VALUES (4, 'Muscular', 'Muscle mass and strength', '2025-08-21T18:25:25.789Z');
INSERT INTO health_systems (id, name, description, created_at) VALUES (5, 'Skeletal', 'Bone health and density', '2025-08-21T18:25:25.846Z');
INSERT INTO health_systems (id, name, description, created_at) VALUES (6, 'Digestive', 'Gut health and liver function', '2025-08-21T18:25:25.903Z');
INSERT INTO health_systems (id, name, description, created_at) VALUES (7, 'Endocrine', 'Hormone regulation and metabolism', '2025-08-21T18:25:25.960Z');
INSERT INTO health_systems (id, name, description, created_at) VALUES (8, 'Urinary', 'Kidney and urinary function', '2025-08-21T18:25:26.017Z');
INSERT INTO health_systems (id, name, description, created_at) VALUES (9, 'Reproductive', 'Reproductive hormone health', '2025-08-21T18:25:26.076Z');
INSERT INTO health_systems (id, name, description, created_at) VALUES (10, 'Integumentary', 'Skin, hair, and nail health', '2025-08-21T18:25:26.132Z');
INSERT INTO health_systems (id, name, description, created_at) VALUES (11, 'Immune/Inflammation', 'Immune system and inflammation markers', '2025-08-21T18:25:26.189Z');

-- Table: imaging_studies
-- Columns: 14
-- Rows: 0

-- Table: metrics
-- Columns: 12
-- Rows: 15

-- Data for metrics
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (2, 1, 1, NULL, 'HDL', '48', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:31:12.065Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (3, 1, 1, NULL, 'Triglycerides', '109', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:31:12.122Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (4, 1, 1, NULL, 'LDL Calculated', '151', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:31:12.180Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (5, 1, 1, NULL, 'Chol/HDL Ratio', '4.6', 'calc', NULL, false, false, NULL, '2025-08-21T18:31:12.237Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (6, 1, 1, NULL, 'NON-HDL CHOLESTEROL', '174', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:31:12.294Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (7, 1, 1, NULL, 'LDL PARTICLES, TOTAL', '2144', 'nmol/L', NULL, false, false, NULL, '2025-08-21T18:31:12.351Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (8, 1, 1, NULL, 'LDL, SMALL', '333', 'nmol/L', NULL, false, false, NULL, '2025-08-21T18:31:12.408Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (9, 1, 1, NULL, 'LDL, MEDIUM', '419', 'nmol/L', NULL, false, false, NULL, '2025-08-21T18:31:12.466Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (10, 1, 1, NULL, 'HDL, LARGE', '4764', 'nmol/L', NULL, false, false, NULL, '2025-08-21T18:31:12.523Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (11, 1, 1, NULL, 'LDL PARTICLE SIZE', '224.2', 'Angstrom', NULL, false, false, NULL, '2025-08-21T18:31:12.580Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (12, 1, 1, NULL, 'Apolipoprotein B', '130', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:31:12.637Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (13, 1, 1, NULL, 'LIPOPROTEIN (a)', '19', 'nmol/L', NULL, false, false, NULL, '2025-08-21T18:31:12.694Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (14, 1, 1, NULL, 'CARDIO CRP(R)', '0.8', 'mg/L', NULL, false, false, NULL, '2025-08-21T18:31:12.752Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (15, 1, 1, NULL, 'LA PLA2 ACTIVITY', '93', 'nmol/min/mL', NULL, false, false, NULL, '2025-08-21T18:31:12.809Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (1, 1, 1, 1, 'Cholesterol', '222', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:31:11.993Z');

-- Table: questionnaire_responses
-- Columns: 7
-- Rows: 0

-- Table: uploads
-- Columns: 11
-- Rows: 1

-- Data for uploads
INSERT INTO uploads (id, user_id, filename, file_type, file_size, upload_type, storage_path, processing_status, processing_error, created_at, processed_at) VALUES (1, 1, 'lipid panel feb 2025.pdf', 'application/pdf', 55224, 'manual', NULL, 'completed', NULL, '2025-08-21T18:31:11.840Z', NULL);

-- Table: user_custom_metrics
-- Columns: 12
-- Rows: 0

-- Table: users
-- Columns: 7
-- Rows: 1

-- Data for users
INSERT INTO users (id, email, google_id, name, avatar_url, created_at, updated_at) VALUES (1, 'demo@healthapp.com', 'demo-123', 'Demo User', NULL, '2025-08-21T18:28:51.010Z', '2025-08-21T18:28:51.010Z');

