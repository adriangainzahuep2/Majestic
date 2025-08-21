-- Database Snapshot Created: 2025-08-21T20:42:57.418Z
-- Environment: development
-- Tables: 10

-- Table: __drizzle_migrations
-- Columns: 3
-- Rows: 0

-- Table: ai_outputs_log
-- Columns: 9
-- Rows: 0

-- Table: daily_plans
-- Columns: 6
-- Rows: 0

-- Table: health_systems
-- Columns: 4
-- Rows: 13

-- Data for health_systems
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
INSERT INTO health_systems (id, name, description, created_at) VALUES (12, 'Sensory', 'Vision, hearing, and sensory function', '2025-08-21T18:25:26.248Z');
INSERT INTO health_systems (id, name, description, created_at) VALUES (13, 'Genetics & Biological Age', 'Cellular aging and longevity markers', '2025-08-21T18:25:26.304Z');

-- Table: imaging_studies
-- Columns: 14
-- Rows: 0

-- Table: metrics
-- Columns: 12
-- Rows: 71

-- Data for metrics
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (1, 1, 1, 1, 'Cholesterol', '222', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:31:11.993Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (2, 1, 1, 1, 'HDL', '48', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:31:12.065Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (3, 1, 1, 1, 'Triglycerides', '109', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:31:12.122Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (4, 1, 1, 1, 'LDL Calculated', '151', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:31:12.180Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (5, 1, 1, 1, 'Chol/HDL Ratio', '4.6', 'calc', NULL, false, false, NULL, '2025-08-21T18:31:12.237Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (6, 1, 1, 1, 'NON-HDL CHOLESTEROL', '174', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:31:12.294Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (7, 1, 1, 1, 'LDL PARTICLES, TOTAL', '2144', 'nmol/L', NULL, false, false, NULL, '2025-08-21T18:31:12.351Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (8, 1, 1, 1, 'LDL, SMALL', '333', 'nmol/L', NULL, false, false, NULL, '2025-08-21T18:31:12.408Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (9, 1, 1, 1, 'LDL, MEDIUM', '419', 'nmol/L', NULL, false, false, NULL, '2025-08-21T18:31:12.466Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (10, 1, 1, 1, 'HDL, LARGE', '4764', 'nmol/L', NULL, false, false, NULL, '2025-08-21T18:31:12.523Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (11, 1, 1, 1, 'LDL PARTICLE SIZE', '224.2', 'Angstrom', NULL, false, false, NULL, '2025-08-21T18:31:12.580Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (12, 1, 1, 1, 'Apolipoprotein B', '130', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:31:12.637Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (13, 1, 1, 8, 'LIPOPROTEIN (a)', '19', 'nmol/L', NULL, false, false, NULL, '2025-08-21T18:31:12.694Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (14, 1, 1, 11, 'CARDIO CRP(R)', '0.8', 'mg/L', NULL, false, false, NULL, '2025-08-21T18:31:12.752Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (15, 1, 1, 2, 'LA PLA2 ACTIVITY', '93', 'nmol/min/mL', NULL, false, false, NULL, '2025-08-21T18:31:12.809Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (16, 1, 2, 11, 'Cholesterol, Total', '178', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:59:31.448Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (17, 1, 2, 1, 'Triglycerides', '116', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:59:31.516Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (18, 1, 2, 1, 'HDL Cholesterol', '34', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:59:31.574Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (19, 1, 2, 1, 'LDL Cholesterol', '122', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:59:31.632Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (20, 1, 2, 1, 'VLDL Cholesterol Cal', '23', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:59:31.690Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (21, 1, 2, 8, 'Urea Nitrogen (BUN)', '14', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:59:31.748Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (22, 1, 2, 8, 'Creatinine', '1.16', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:59:31.805Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (23, 1, 2, 7, 'Glucose', '102', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:59:31.863Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (24, 1, 2, 5, 'Calcium', '9.2', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:59:31.921Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (25, 1, 2, 8, 'Protein, Total', '7.2', 'g/dL', NULL, false, false, NULL, '2025-08-21T18:59:31.979Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (26, 1, 2, 6, 'Albumin', '4.3', 'g/dL', NULL, false, false, NULL, '2025-08-21T18:59:32.037Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (27, 1, 2, 11, 'Globulin', '2.9', 'g/dL', NULL, false, false, NULL, '2025-08-21T18:59:32.095Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (28, 1, 2, 6, 'Albumin/Globulin Ratio', '1.5', '', NULL, false, false, NULL, '2025-08-21T18:59:32.152Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (29, 1, 2, 6, 'Bilirubin, Total', '0.4', 'mg/dL', NULL, false, false, NULL, '2025-08-21T18:59:32.210Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (30, 1, 2, 11, 'Alkaline Phosphatase', '62', 'U/L', NULL, false, false, NULL, '2025-08-21T18:59:32.268Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (31, 1, 2, 6, 'AST (SGOT)', '20', 'U/L', NULL, false, false, NULL, '2025-08-21T18:59:32.326Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (32, 1, 2, 6, 'ALT (SGPT)', '18', 'U/L', NULL, false, false, NULL, '2025-08-21T18:59:32.384Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (33, 1, 3, 11, 'Cholesterol, Total', '178', 'mg/dL', NULL, false, false, NULL, '2025-08-21T19:11:11.341Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (34, 1, 3, 1, 'Triglycerides', '116', 'mg/dL', NULL, false, false, NULL, '2025-08-21T19:11:11.402Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (35, 1, 3, 1, 'HDL Cholesterol', '34', 'mg/dL', NULL, false, false, NULL, '2025-08-21T19:11:11.459Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (36, 1, 3, 1, 'LDL Cholesterol (calculated)', '122', 'mg/dL', NULL, false, false, NULL, '2025-08-21T19:11:11.515Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (37, 1, 3, 1, 'VLDL Cholesterol (calculated)', '23', 'mg/dL', NULL, false, false, NULL, '2025-08-21T19:11:11.571Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (38, 1, 3, 8, 'Urea Nitrogen (BUN)', '14', 'mg/dL', NULL, false, false, NULL, '2025-08-21T19:11:11.628Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (39, 1, 3, 8, 'Creatinine', '1.16', 'mg/dL', NULL, false, false, NULL, '2025-08-21T19:11:11.684Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (40, 1, 3, 7, 'Glucose', '92', 'mg/dL', NULL, false, false, NULL, '2025-08-21T19:11:11.740Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (41, 1, 3, 5, 'Calcium', '9.2', 'mg/dL', NULL, false, false, NULL, '2025-08-21T19:11:11.797Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (42, 1, 3, 8, 'Protein, Total', '6.9', 'g/dL', NULL, false, false, NULL, '2025-08-21T19:11:11.853Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (43, 1, 3, 6, 'Albumin', '4.4', 'g/dL', NULL, false, false, NULL, '2025-08-21T19:11:11.909Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (44, 1, 3, 11, 'Globulin', '2.5', 'g/dL', NULL, false, false, NULL, '2025-08-21T19:11:11.966Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (45, 1, 3, 6, 'Albumin/Globulin Ratio', '1.8', '', NULL, false, false, NULL, '2025-08-21T19:11:12.022Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (46, 1, 3, 6, 'Bilirubin, Total', '0.4', 'mg/dL', NULL, false, false, NULL, '2025-08-21T19:11:12.079Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (47, 1, 3, 11, 'Alkaline Phosphatase', '62', 'U/L', NULL, false, false, NULL, '2025-08-21T19:11:12.135Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (48, 1, 3, 6, 'AST (SGOT)', '20', 'U/L', NULL, false, false, NULL, '2025-08-21T19:11:12.192Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (49, 1, 3, 6, 'ALT (SGPT)', '22', 'U/L', NULL, false, false, NULL, '2025-08-21T19:11:12.248Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (50, 1, 4, 11, 'Anterior Axial Curvature', '1.3375', 'n', NULL, false, false, NULL, '2025-08-21T19:17:17.835Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (51, 1, 4, 11, 'Coma FitZone', '1.32', 'D', NULL, false, false, NULL, '2025-08-21T19:17:17.907Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (52, 1, 4, 11, 'SimK', '46.62', 'D', NULL, false, false, NULL, '2025-08-21T19:17:17.964Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (53, 1, 4, 11, 'Flat SimK (K1)', '44.88', 'D', NULL, false, false, NULL, '2025-08-21T19:17:18.020Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (54, 1, 4, 11, 'Steep SimK (K2)', '48.37', 'D', NULL, false, false, NULL, '2025-08-21T19:17:18.077Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (55, 1, 4, 6, 'Astigmatism', '3.49', 'D', NULL, false, false, NULL, '2025-08-21T19:17:18.133Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (56, 1, 4, 11, 'Mean K', '-7', 'D', NULL, false, false, NULL, '2025-08-21T19:17:18.190Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (57, 1, 4, 11, 'Flat K', '-6.5', 'D', NULL, false, false, NULL, '2025-08-21T19:17:18.247Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (58, 1, 4, 11, 'Steep K', '-7.51', 'D', NULL, false, false, NULL, '2025-08-21T19:17:18.303Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (59, 1, 4, 11, 'Total Corneal Power IOL', '45.23', 'D', NULL, false, false, NULL, '2025-08-21T19:17:18.360Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (60, 1, 4, 11, 'Pachymetry Thinnest', '475', 'µm', NULL, false, false, NULL, '2025-08-21T19:17:18.416Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (61, 1, 4, 11, 'Central Pachymetry', '502', 'µm', NULL, false, false, NULL, '2025-08-21T19:17:18.473Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (62, 1, 4, 11, 'ACV', '124', 'mm³', NULL, false, false, NULL, '2025-08-21T19:17:18.530Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (63, 1, 4, 11, 'ACD', '3.74', 'mm', NULL, false, false, NULL, '2025-08-21T19:17:18.586Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (64, 1, 4, 1, 'AL', '24.82', 'mm', NULL, false, false, NULL, '2025-08-21T19:17:18.645Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (65, 1, 4, 11, 'Keratoconus Probability KPI', '88.2', '%', NULL, false, false, NULL, '2025-08-21T19:17:18.701Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (66, 1, 4, 11, 'Defocus', '-0.3', 'D', NULL, false, false, NULL, '2025-08-21T19:17:18.758Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (67, 1, 4, 6, 'Astigmatism', '1.75', 'D', NULL, false, false, NULL, '2025-08-21T19:17:18.815Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (68, 1, 4, 11, 'Coma', '1.32', 'D', NULL, false, false, NULL, '2025-08-21T19:17:18.871Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (69, 1, 4, 11, 'Trefoil', '0.65', 'D', NULL, false, false, NULL, '2025-08-21T19:17:18.928Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (70, 1, 4, 11, 'Spherical', '0.01', 'D', NULL, false, false, NULL, '2025-08-21T19:17:18.985Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (71, 1, 4, 11, 'RMS Total', '2.3', 'D', NULL, false, false, NULL, '2025-08-21T19:17:19.041Z');

-- Table: questionnaire_responses
-- Columns: 7
-- Rows: 0

-- Table: uploads
-- Columns: 11
-- Rows: 4

-- Data for uploads
INSERT INTO uploads (id, user_id, filename, file_type, file_size, upload_type, storage_path, processing_status, processing_error, created_at, processed_at) VALUES (1, 1, 'lipid panel feb 2025.pdf', 'application/pdf', 55224, 'manual', NULL, 'completed', NULL, '2025-08-21T18:31:11.840Z', NULL);
INSERT INTO uploads (id, user_id, filename, file_type, file_size, upload_type, storage_path, processing_status, processing_error, created_at, processed_at) VALUES (2, 1, 'Doc Dec 28, 2023, 11_10.pdf', 'application/pdf', 453441, 'manual', NULL, 'completed', NULL, '2025-08-21T18:59:31.336Z', NULL);
INSERT INTO uploads (id, user_id, filename, file_type, file_size, upload_type, storage_path, processing_status, processing_error, created_at, processed_at) VALUES (3, 1, 'Doc Dec 28, 2023, 11_10.pdf', 'application/pdf', 453441, 'manual', NULL, 'completed', NULL, '2025-08-21T19:11:11.272Z', NULL);
INSERT INTO uploads (id, user_id, filename, file_type, file_size, upload_type, storage_path, processing_status, processing_error, created_at, processed_at) VALUES (4, 1, 'keramotery 8-5-2022 HUSSAIN.ADIL.OS.visit_2022_08_05.16_41.export_2022_08_05.16_55_29.pdf', 'application/pdf', 215410, 'manual', NULL, 'completed', NULL, '2025-08-21T19:17:17.720Z', NULL);

-- Table: user_custom_metrics
-- Columns: 12
-- Rows: 0

-- Table: users
-- Columns: 7
-- Rows: 1

-- Data for users
INSERT INTO users (id, email, google_id, name, avatar_url, created_at, updated_at) VALUES (1, 'demo@healthapp.com', 'demo-123', 'Demo User', NULL, '2025-08-21T18:28:51.010Z', '2025-08-21T20:40:17.840Z');

