-- Insert test data for Majestic application

-- Create/update demo user
INSERT INTO users (email, name, google_id, created_at) 
VALUES ('demo@majestic.com', 'Demo User', 'demo-123', CURRENT_TIMESTAMP)
ON CONFLICT (email) DO UPDATE SET 
  name = EXCLUDED.name,
  updated_at = CURRENT_TIMESTAMP;

-- Get user ID (assuming it's 2, but you can check)
-- DELETE existing data for clean start
DELETE FROM metrics WHERE user_id = 2;
DELETE FROM uploads WHERE user_id = 2;
DELETE FROM custom_reference_ranges WHERE user_id = 2;

-- Insert upload record
INSERT INTO uploads (user_id, filename, file_type, processing_status, created_at)
VALUES (2, 'comprehensive_labs_2024-01-15.pdf', 'lab_report', 'completed', '2024-01-15 10:00:00');

-- Insert comprehensive lab metrics (using upload_id = 1, adjust if needed)
INSERT INTO metrics (user_id, upload_id, metric_name, metric_value, units, test_date, system_id, status, reference_range_min, reference_range_max, source_type) VALUES
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'HDL Cholesterol', 58, 'mg/dL', '2024-01-15', 1, 'Normal', 40, 60, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'LDL Cholesterol', 135, 'mg/dL', '2024-01-15', 1, 'High', 0, 100, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Total Cholesterol', 210, 'mg/dL', '2024-01-15', 1, 'High', 0, 200, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Triglycerides', 165, 'mg/dL', '2024-01-15', 1, 'High', 0, 150, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Hemoglobin A1c (HbA1c)', 5.8, '%', '2024-01-15', 2, 'High', 4.0, 5.6, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Fasting Glucose', 108, 'mg/dL', '2024-01-15', 2, 'High', 70, 100, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Serum Creatinine', 0.9, 'mg/dL', '2024-01-15', 3, 'Normal', 0.6, 1.2, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Blood Urea Nitrogen (BUN)', 18, 'mg/dL', '2024-01-15', 3, 'Normal', 7, 25, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Alanine Aminotransferase (ALT)', 28, 'U/L', '2024-01-15', 4, 'Normal', 7, 35, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Aspartate Aminotransferase (AST)', 22, 'U/L', '2024-01-15', 4, 'Normal', 8, 35, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Thyroid Stimulating Hormone (TSH)', 2.1, 'μIU/mL', '2024-01-15', 2, 'Normal', 0.4, 4.0, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'C-Reactive Protein (CRP)', 1.8, 'mg/L', '2024-01-15', 8, 'Normal', 0, 3.0, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'White Blood Cell Count (WBC)', 6.2, '10³/μL', '2024-01-15', 5, 'Normal', 4.0, 10.0, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Red Blood Cell Count (RBC)', 4.5, '10⁶/μL', '2024-01-15', 5, 'Normal', 4.2, 5.4, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Hemoglobin', 13.8, 'g/dL', '2024-01-15', 5, 'Normal', 12.0, 15.5, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Hematocrit', 41.2, '%', '2024-01-15', 5, 'Normal', 36.0, 46.0, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Platelet Count', 285, '10³/μL', '2024-01-15', 5, 'Normal', 150, 450, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Vitamin D, 25-OH', 32, 'ng/mL', '2024-01-15', 8, 'Normal', 30, 100, 'upload');

-- Insert second upload for follow-up data
INSERT INTO uploads (user_id, filename, file_type, processing_status, created_at)
VALUES (2, 'follow_up_labs_2024-01-28.pdf', 'lab_report', 'completed', '2024-01-28 11:00:00');

-- Insert follow-up metrics (improved values)
INSERT INTO metrics (user_id, upload_id, metric_name, metric_value, units, test_date, system_id, status, reference_range_min, reference_range_max, source_type) VALUES
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'HDL Cholesterol', 62, 'mg/dL', '2024-01-28', 1, 'High', 40, 60, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'LDL Cholesterol', 125, 'mg/dL', '2024-01-28', 1, 'High', 0, 100, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Total Cholesterol', 198, 'mg/dL', '2024-01-28', 1, 'Normal', 0, 200, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Hemoglobin A1c (HbA1c)', 5.6, '%', '2024-01-28', 2, 'Normal', 4.0, 5.6, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Fasting Glucose', 95, 'mg/dL', '2024-01-28', 2, 'Normal', 70, 100, 'upload'),
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 'Serum Creatinine', 0.8, 'mg/dL', '2024-01-28', 3, 'Normal', 0.6, 1.2, 'upload');

-- Insert custom reference ranges
INSERT INTO custom_reference_ranges (user_id, metric_name, min_value, max_value, units, medical_condition, notes, valid_from, valid_until, created_at) VALUES
(2, 'Hemoglobin A1c (HbA1c)', 4.0, 6.0, '%', 'pregnancy', 'Adjusted range for gestational diabetes monitoring', '2024-01-01', '2024-10-01', CURRENT_TIMESTAMP),
(2, 'Fasting Glucose', 70, 95, 'mg/dL', 'pregnancy', 'Stricter glucose control during pregnancy', '2024-01-01', '2024-10-01', CURRENT_TIMESTAMP),
(2, 'Hemoglobin', 11.0, 13.0, 'g/dL', 'pregnancy', 'Adjusted for pregnancy physiological changes', '2024-01-01', '2024-10-01', CURRENT_TIMESTAMP),
(2, 'Serum Creatinine', 0.8, 1.4, 'mg/dL', 'age_related', 'Adjusted for patients over 65 years', '2024-01-01', NULL, CURRENT_TIMESTAMP)
ON CONFLICT (user_id, metric_name, medical_condition, valid_from) DO NOTHING;

-- Insert some pending metric suggestions for testing the suggestion system
INSERT INTO uploads (user_id, filename, file_type, processing_status, created_at)
VALUES (2, 'lab_with_synonyms_2024-01-22.pdf', 'lab_report', 'completed', '2024-01-22 09:00:00');

INSERT INTO pending_metric_suggestions (user_id, upload_id, unmatched_metrics, ai_suggestions, test_date, status, created_at) VALUES
(2, (SELECT MAX(id) FROM uploads WHERE user_id = 2), 
 '[{"name": "Chol HDL", "value": 55, "unit": "mg/dL"}, {"name": "Glucosa en ayunas", "value": 115, "unit": "mg/dL"}, {"name": "Creat", "value": 1.1, "unit": "mg/dL"}]',
 '{"suggestions": [{"original_name": "Chol HDL", "suggested_matches": [{"standard_name": "HDL Cholesterol", "confidence": 0.95, "reason": "Common abbreviation for HDL Cholesterol"}]}, {"original_name": "Glucosa en ayunas", "suggested_matches": [{"standard_name": "Fasting Glucose", "confidence": 0.92, "reason": "Spanish term for Fasting Glucose"}]}, {"original_name": "Creat", "suggested_matches": [{"standard_name": "Serum Creatinine", "confidence": 0.88, "reason": "Common abbreviation for Serum Creatinine"}]}]}',
 '2024-01-22', 'pending', CURRENT_TIMESTAMP);

-- Display summary
SELECT 
    'SUMMARY' as info,
    (SELECT COUNT(*) FROM users WHERE email = 'demo@majestic.com') as demo_users,
    (SELECT COUNT(*) FROM uploads WHERE user_id = 2) as uploads,
    (SELECT COUNT(*) FROM metrics WHERE user_id = 2) as metrics,
    (SELECT COUNT(*) FROM custom_reference_ranges WHERE user_id = 2) as custom_ranges,
    (SELECT COUNT(*) FROM pending_metric_suggestions WHERE user_id = 2) as pending_suggestions;
