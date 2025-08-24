-- Database Snapshot Created: 2025-08-24T09:06:48.584Z
-- Environment: development
-- Tables: 10

-- Table: __drizzle_migrations
-- Columns: 3
-- Rows: 0

-- Table: ai_outputs_log
-- Columns: 9
-- Rows: 1

-- Data for ai_outputs_log
INSERT INTO ai_outputs_log (id, user_id, output_type, prompt, response, model_version, processing_time_ms, created_at, system_id) VALUES (1, 1, 'daily_plan', 'Generate daily health plan', '{"plan_date":"2025-08-22","recommendations":[{"category":"nutrition","action":"Increase intake of soluble fiber-rich foods such as oats, beans, and fruits to help lower LDL cholesterol levels.","reason":"Soluble fiber can help reduce the absorption of cholesterol into your bloodstream and is beneficial for managing LDL cholesterol levels.","priority":"high"},{"category":"exercise","action":"Engage in at least 30 minutes of moderate-intensity exercise like brisk walking, cycling, or swimming, five times a week.","reason":"Regular physical activity can boost HDL cholesterol and lower LDL cholesterol, improving overall heart health.","priority":"high"},{"category":"lifestyle","action":"Incorporate stress-management techniques such as meditation or yoga into your daily routine.","reason":"Reducing stress can positively impact lipid profiles and overall cardiovascular health.","priority":"medium"},{"category":"nutrition","action":"Limit consumption of saturated fats found in red meat and full-fat dairy products and replace them with healthier unsaturated fats from sources like olive oil, nuts, and avocados.","reason":"Limiting saturated fats can help reduce LDL cholesterol levels, improving heart health.","priority":"high"},{"category":"exercise","action":"Incorporate two days a week of strength training activities.","reason":"Strength training can help improve metabolic health and regulate blood glucose levels, which can support healthy lipid profiles.","priority":"medium"}],"key_focus_areas":["Cardiovascular Health","Blood Glucose Control"],"estimated_compliance_time_minutes":90}', 'gpt-4o', 0, '2025-08-21T21:34:18.616Z', NULL);

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
-- Rows: 10

-- Data for metrics
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (72, 1, 6, 1, 'Cholesterol, Total', '178', 'mg/dL', '<200', false, false, '2025-08-24T00:00:00.000Z', '2025-08-24T08:06:33.351Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (73, 1, 6, 1, 'Triglycerides', '116', 'mg/dL', 'undefined-undefined', NULL, false, '2025-08-24T00:00:00.000Z', '2025-08-24T08:06:33.420Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (74, 1, 6, 1, 'HDL Cholesterol', '54', 'mg/dL', '>=40', false, false, '2025-08-24T00:00:00.000Z', '2025-08-24T08:06:33.476Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (75, 1, 6, 1, 'LDL Cholesterol Calc', '104', 'mg/dL', '<100', false, false, '2025-08-24T00:00:00.000Z', '2025-08-24T08:06:33.533Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (76, 1, 6, 1, 'Non-HDL Cholesterol', '124', 'mg/dL', '<130', false, false, '2025-08-24T00:00:00.000Z', '2025-08-24T08:06:33.589Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (77, 1, 6, 7, 'Glucose', '92', 'mg/dL', '65-99', false, false, '2025-08-24T00:00:00.000Z', '2025-08-24T08:06:33.646Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (78, 1, 6, 8, 'BUN', '14', 'mg/dL', '6-24', false, false, '2025-08-24T00:00:00.000Z', '2025-08-24T08:06:33.702Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (79, 1, 6, 8, 'Creatinine', '1.02', 'mg/dL', '0.76-1.27', false, false, '2025-08-24T00:00:00.000Z', '2025-08-24T08:06:33.758Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (80, 1, 6, 8, 'eGFR', '88', 'mL/min/1.73m2', '>=60', false, false, '2025-08-24T00:00:00.000Z', '2025-08-24T08:06:33.814Z');
INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) VALUES (81, 1, 6, 5, 'Calcium', '9.5', 'mg/dL', '8.6-10.3', false, false, '2025-08-24T00:00:00.000Z', '2025-08-24T08:06:33.871Z');

-- Table: questionnaire_responses
-- Columns: 7
-- Rows: 0

-- Table: uploads
-- Columns: 11
-- Rows: 1

-- Data for uploads
INSERT INTO uploads (id, user_id, filename, file_type, file_size, upload_type, storage_path, processing_status, processing_error, created_at, processed_at) VALUES (6, 1, 'Doc Dec 28, 2023, 11_10.pdf', 'application/pdf', 453441, 'manual', NULL, 'completed', NULL, '2025-08-24T08:06:33.234Z', NULL);

-- Table: user_custom_metrics
-- Columns: 12
-- Rows: 1

-- Data for user_custom_metrics
INSERT INTO user_custom_metrics (id, system_id, user_id, metric_name, value, units, normal_range_min, normal_range_max, range_applicable_to, source_type, review_status, created_at) VALUES (1, 1, 1, 'LDL, SMALL', '0', 'nmol/L', NULL, '527.000', 'All', 'user', 'pending', '2025-08-21T22:15:23.227Z');

-- Table: users
-- Columns: 7
-- Rows: 1

-- Data for users
INSERT INTO users (id, email, google_id, name, avatar_url, created_at, updated_at) VALUES (1, 'demo@healthapp.com', 'demo-123', 'Demo User', NULL, '2025-08-21T18:28:51.010Z', '2025-08-24T08:04:40.996Z');

