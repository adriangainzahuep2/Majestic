const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://majestic:simple123@localhost:5432/health_app',
  ssl: false
});

async function addCustomRanges() {
  try {
    console.log('🎯 Adding custom reference ranges...');
    
    const userId = 2; // Demo user
    
    // Clear existing custom ranges for demo user
    await pool.query('DELETE FROM custom_reference_ranges WHERE user_id = $1', [userId]);
    
    // Insert custom ranges
    const ranges = [
      {
        metric_name: 'Hemoglobin A1c (HbA1c)',
        min_value: 4.0,
        max_value: 6.0,
        units: '%',
        condition: 'pregnancy',
        notes: 'Adjusted range for gestational diabetes monitoring',
        valid_from: '2024-01-01',
        valid_until: '2024-10-01'
      },
      {
        metric_name: 'Fasting Glucose',
        min_value: 70,
        max_value: 95,
        units: 'mg/dL',
        condition: 'pregnancy',
        notes: 'Stricter glucose control during pregnancy',
        valid_from: '2024-01-01',
        valid_until: '2024-10-01'
      },
      {
        metric_name: 'Hemoglobin',
        min_value: 11.0,
        max_value: 13.0,
        units: 'g/dL',
        condition: 'pregnancy',
        notes: 'Adjusted for pregnancy physiological changes',
        valid_from: '2024-01-01',
        valid_until: '2024-10-01'
      },
      {
        metric_name: 'Serum Creatinine',
        min_value: 0.8,
        max_value: 1.4,
        units: 'mg/dL',
        condition: 'age_related',
        notes: 'Adjusted for patients over 65 years',
        valid_from: '2024-01-01',
        valid_until: null
      }
    ];
    
    for (const range of ranges) {
      await pool.query(`
        INSERT INTO custom_reference_ranges (
          user_id, metric_name, min_value, max_value, units,
          medical_condition, notes, valid_from, valid_until
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        userId,
        range.metric_name,
        range.min_value,
        range.max_value,
        range.units,
        range.condition,
        range.notes,
        range.valid_from,
        range.valid_until
      ]);
      
      console.log(`✅ Added: ${range.metric_name} (${range.condition})`);
    }
    
    console.log(`\n🎉 Successfully added ${ranges.length} custom reference ranges!`);
    
  } catch (error) {
    console.error('❌ Error adding custom ranges:', error.message);
  } finally {
    await pool.end();
  }
}

addCustomRanges();
