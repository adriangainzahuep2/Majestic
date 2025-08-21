-- Database Snapshot Created: 2025-08-21T18:28:23.295Z
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
INSERT INTO health_systems (id, name, description, created_at) VALUES (13, 'Biological Age', 'Cellular aging and longevity markers', '2025-08-21T18:25:26.304Z');

-- Table: imaging_studies
-- Columns: 14
-- Rows: 0

-- Table: metrics
-- Columns: 12
-- Rows: 0

-- Table: questionnaire_responses
-- Columns: 7
-- Rows: 0

-- Table: uploads
-- Columns: 11
-- Rows: 0

-- Table: user_custom_metrics
-- Columns: 12
-- Rows: 0

-- Table: users
-- Columns: 7
-- Rows: 0

