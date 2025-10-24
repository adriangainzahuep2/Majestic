const { Pool } = require('pg');
const { expect } = require('chai');
const sinon = require('sinon');

describe('Database Schema Tests', () => {
  let pool;
  let client;

  before(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    });
    client = await pool.connect();
  });

  after(async () => {
    if (client) client.release();
    if (pool) await pool.end();
  });

  describe('Master Metrics Table', () => {
    it('should have HDL Cholesterol with correct range 40-100', async () => {
      const result = await client.query(`
        SELECT metric_id, metric_name, normal_min, normal_max 
        FROM master_metrics 
        WHERE metric_name = 'HDL Cholesterol'
      `);

      expect(result.rows).to.have.lengthOf.at.least(1);
      const hdl = result.rows[0];
      expect(hdl.normal_min).to.equal(40);
      expect(hdl.normal_max).to.equal(100);
    });

    it('should have Non-HDL Cholesterol with range 0-130', async () => {
      const result = await client.query(`
        SELECT metric_id, metric_name, normal_min, normal_max 
        FROM master_metrics 
        WHERE metric_name = 'Non-HDL Cholesterol'
      `);

      expect(result.rows).to.have.lengthOf.at.least(1);
      const nonHdl = result.rows[0];
      expect(nonHdl.normal_min).to.equal(0);
      expect(nonHdl.normal_max).to.equal(130);
    });

    it('should have LDL Particle Size with non-null range', async () => {
      const result = await client.query(`
        SELECT metric_id, metric_name, normal_min, normal_max 
        FROM master_metrics 
        WHERE metric_name ILIKE '%LDL Particle Size%'
      `);

      expect(result.rows).to.have.lengthOf.at.least(1);
      const ldlSize = result.rows[0];
      expect(ldlSize.normal_min).to.not.be.null;
      expect(ldlSize.normal_max).to.not.be.null;
      expect(ldlSize.normal_min).to.be.a('number');
      expect(ldlSize.normal_max).to.be.a('number');
    });

    it('should have Medium LDL-P with non-null range', async () => {
      const result = await client.query(`
        SELECT metric_id, metric_name, normal_min, normal_max 
        FROM master_metrics 
        WHERE metric_name ILIKE '%Medium LDL%'
      `);

      expect(result.rows).to.have.lengthOf.at.least(1);
      const mediumLdl = result.rows[0];
      expect(mediumLdl.normal_min).to.not.be.null;
      expect(mediumLdl.normal_max).to.not.be.null;
    });

    it('should have Small LDL-P with non-null range', async () => {
      const result = await client.query(`
        SELECT metric_id, metric_name, normal_min, normal_max 
        FROM master_metrics 
        WHERE metric_name ILIKE '%Small LDL%'
      `);

      expect(result.rows).to.have.lengthOf.at.least(1);
      const smallLdl = result.rows[0];
      expect(smallLdl.normal_min).to.not.be.null;
      expect(smallLdl.normal_max).to.not.be.null;
    });

    it('should not have any metrics with min > max', async () => {
      const result = await client.query(`
        SELECT metric_id, metric_name, normal_min, normal_max 
        FROM master_metrics 
        WHERE normal_min > normal_max
      `);

      expect(result.rows).to.have.lengthOf(0);
    });

    it('should store numeric ranges as DECIMAL type', async () => {
      const result = await client.query(`
        SELECT column_name, data_type, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_name = 'master_metrics' 
        AND column_name IN ('normal_min', 'normal_max')
      `);

      result.rows.forEach(col => {
        expect(col.data_type).to.equal('numeric');
      });
    });
  });

  describe('Metric Synonyms', () => {
    it('should have Apolipoprotein B synonym mapping', async () => {
      const result = await client.query(`
        SELECT s.synonym_id, s.synonym_name, m.metric_name
        FROM master_metric_synonyms s
        JOIN master_metrics m ON s.metric_id = m.metric_id
        WHERE s.synonym_name ILIKE '%Apolipoprotein B%' 
        OR m.metric_name ILIKE '%ApoB%'
      `);

      expect(result.rows).to.have.lengthOf.at.least(1);
    });

    it('should have all common ApoB variations', async () => {
      const variations = ['Apolipoprotein B', 'Apo B', 'ApoB', 'Apo-B'];
      
      for (const variant of variations) {
        const result = await client.query(`
          SELECT * FROM master_metric_synonyms
          WHERE synonym_name = $1
        `, [variant]);
        
        expect(result.rows, `Missing synonym: ${variant}`).to.have.lengthOf.at.least(1);
      }
    });

    it('should not have orphaned synonyms', async () => {
      const result = await client.query(`
        SELECT s.synonym_id, s.synonym_name, s.metric_id
        FROM master_metric_synonyms s
        LEFT JOIN master_metrics m ON s.metric_id = m.metric_id
        WHERE m.metric_id IS NULL
      `);

      expect(result.rows).to.have.lengthOf(0);
    });
  });

  describe('Data Validation', () => {
    it('should coerce string values to numeric in metrics table', async () => {
      // Insert a test metric with string value
      const testUserId = 999999;
      await client.query(`
        INSERT INTO metrics (user_id, metric_name, metric_value, metric_unit, test_date)
        VALUES ($1, 'Test Metric', '123.45', 'mg/dL', CURRENT_DATE)
      `, [testUserId]);

      // Retrieve and check type
      const result = await client.query(`
        SELECT metric_value 
        FROM metrics 
        WHERE user_id = $1 AND metric_name = 'Test Metric'
      `, [testUserId]);

      expect(result.rows[0].metric_value).to.be.a('number');
      expect(parseFloat(result.rows[0].metric_value)).to.equal(123.45);

      // Cleanup
      await client.query('DELETE FROM metrics WHERE user_id = $1', [testUserId]);
    });

    it('should handle invalid numeric values gracefully', async () => {
      const testUserId = 999998;
      
      // Try to insert invalid value
      await client.query(`
        INSERT INTO metrics (user_id, metric_name, metric_value, metric_unit, test_date)
        VALUES ($1, 'Test Invalid', 'not-a-number', 'mg/dL', CURRENT_DATE)
      `, [testUserId]);

      // Should convert to NULL
      const result = await client.query(`
        SELECT metric_value 
        FROM metrics 
        WHERE user_id = $1 AND metric_name = 'Test Invalid'
      `, [testUserId]);

      expect(result.rows[0].metric_value).to.be.null;

      // Cleanup
      await client.query('DELETE FROM metrics WHERE user_id = $1', [testUserId]);
    });

    it('should enforce range constraints on custom_reference_ranges', async () => {
      const testUserId = 999997;
      
      try {
        // Try to insert invalid range (min > max)
        await client.query(`
          INSERT INTO custom_reference_ranges 
          (user_id, metric_name, min_value, max_value, units, medical_condition)
          VALUES ($1, 'Test Range', 100, 50, 'mg/dL', 'Test Condition')
        `, [testUserId]);
        
        // Should not reach here
        expect.fail('Should have thrown constraint violation');
      } catch (error) {
        expect(error.code).to.equal('23514'); // check_violation
      }
    });
  });

  describe('Metric Matching Function', () => {
    it('should calculate high confidence for exact matches', async () => {
      const result = await client.query(`
        SELECT calculate_metric_match_confidence('HDL Cholesterol', 'HDL Cholesterol') as confidence
      `);

      expect(result.rows[0].confidence).to.equal(1.0);
    });

    it('should calculate reasonable confidence for similar names', async () => {
      const result = await client.query(`
        SELECT calculate_metric_match_confidence('Glucose', 'Blood Glucose') as confidence
      `);

      const confidence = parseFloat(result.rows[0].confidence);
      expect(confidence).to.be.greaterThan(0.5);
      expect(confidence).to.be.lessThan(1.0);
    });

    it('should calculate low confidence for dissimilar names', async () => {
      const result = await client.query(`
        SELECT calculate_metric_match_confidence('HDL', 'Testosterone') as confidence
      `);

      const confidence = parseFloat(result.rows[0].confidence);
      expect(confidence).to.be.lessThan(0.3);
    });
  });

  describe('Data Integrity Check', () => {
    it('should identify metrics without ranges', async () => {
      const result = await client.query(`
        SELECT * FROM check_metric_data_integrity()
        WHERE issue_type = 'NULL_RANGE'
      `);

      // All key metrics should have ranges after fixes
      expect(result.rows).to.have.lengthOf(0);
    });

    it('should identify invalid ranges', async () => {
      const result = await client.query(`
        SELECT * FROM check_metric_data_integrity()
        WHERE issue_type = 'INVALID_RANGE'
      `);

      expect(result.rows).to.have.lengthOf(0);
    });

    it('should identify metrics without system assignment', async () => {
      const result = await client.query(`
        SELECT * FROM check_metric_data_integrity()
        WHERE issue_type = 'NO_SYSTEM'
      `);

      // Should be minimal or none
      expect(result.rows.length).to.be.lessThan(5);
    });
  });

  describe('View: v_metrics_with_synonyms', () => {
    it('should return metrics with their synonyms as JSON', async () => {
      const result = await client.query(`
        SELECT metric_id, metric_name, synonyms 
        FROM v_metrics_with_synonyms 
        WHERE metric_name = 'HDL Cholesterol'
      `);

      expect(result.rows).to.have.lengthOf(1);
      const metric = result.rows[0];
      expect(metric.synonyms).to.be.an('array');
    });

    it('should include all key metrics in view', async () => {
      const result = await client.query(`
        SELECT COUNT(*) as count 
        FROM v_metrics_with_synonyms 
        WHERE is_key_metric = true
      `);

      expect(parseInt(result.rows[0].count)).to.be.greaterThan(10);
    });
  });

  describe('Audit Logging', () => {
    it('should log updates to master_metrics', async () => {
      // Update a metric
      await client.query(`
        UPDATE master_metrics 
        SET explanation = 'Updated for testing'
        WHERE metric_name = 'HDL Cholesterol'
      `);

      // Check audit log
      const result = await client.query(`
        SELECT * FROM metric_audit_log 
        WHERE table_name = 'master_metrics' 
        AND action = 'UPDATE'
        ORDER BY changed_at DESC 
        LIMIT 1
      `);

      expect(result.rows).to.have.lengthOf(1);
      expect(result.rows[0].old_values).to.exist;
      expect(result.rows[0].new_values).to.exist;
    });
  });

  describe('Performance Indexes', () => {
    it('should have trigram index on metric names', async () => {
      const result = await client.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'master_metrics' 
        AND indexname ILIKE '%trgm%'
      `);

      expect(result.rows).to.have.lengthOf.at.least(1);
    });

    it('should have trigram index on synonym names', async () => {
      const result = await client.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'master_metric_synonyms' 
        AND indexname ILIKE '%trgm%'
      `);

      expect(result.rows).to.have.lengthOf.at.least(1);
    });

    it('should have composite index on user metrics', async () => {
      const result = await client.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'metrics' 
        AND indexname ILIKE '%user_system%'
      `);

      expect(result.rows).to.have.lengthOf.at.least(1);
    });
  });
});

// ============================================================================
// SERVICE LAYER TESTS
// ============================================================================

describe('Metric Service Tests', () => {
  let metricService;
  let pool;

  before(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    });
    
    // Import the actual service (to be created)
    metricService = require('../services/metricService');
    metricService.setPool(pool);
  });

  after(async () => {
    if (pool) await pool.end();
  });

  describe('getNormalRange', () => {
    it('should return correct range for HDL Cholesterol', async () => {
      const range = await metricService.getNormalRange('HDL Cholesterol');
      
      expect(range).to.deep.equal({
        min: 40,
        max: 100,
        unit: 'mg/dL'
      });
    });

    it('should return custom range if defined for user', async () => {
      const testUserId = 999996;
      
      // Insert custom range
      await pool.query(`
        INSERT INTO custom_reference_ranges 
        (user_id, metric_name, min_value, max_value, units, medical_condition, is_active)
        VALUES ($1, 'HDL Cholesterol', 50, 90, 'mg/dL', 'Diabetes', true)
      `, [testUserId]);

      const range = await metricService.getNormalRange('HDL Cholesterol', testUserId);
      
      expect(range).to.deep.equal({
        min: 50,
        max: 90,
        unit: 'mg/dL'
      });

      // Cleanup
      await pool.query('DELETE FROM custom_reference_ranges WHERE user_id = $1', [testUserId]);
    });
  });

  describe('matchMetricByName', () => {
    it('should match exact names with 100% confidence', async () => {
      const match = await metricService.matchMetricByName('HDL Cholesterol');
      
      expect(match).to.exist;
      expect(match.confidence).to.equal(1.0);
      expect(match.metric_name).to.equal('HDL Cholesterol');
    });

    it('should match synonyms with high confidence', async () => {
      const match = await metricService.matchMetricByName('Apolipoprotein B');
      
      expect(match).to.exist;
      expect(match.confidence).to.be.greaterThan(0.9);
      expect(match.metric_name).to.include('ApoB');
    });

    it('should return null for unmatched names below threshold', async () => {
      const match = await metricService.matchMetricByName('Completely Unknown Biomarker XYZ123', 0.5);
      
      expect(match).to.be.null;
    });
  });

  describe('autoMapMetrics', () => {
    it('should auto-map metrics above 95% confidence', async () => {
      const unmatchedMetrics = [
        { name: 'HDL Cholesterol', value: 55, unit: 'mg/dL' },
        { name: 'Apolipoprotein B', value: 90, unit: 'mg/dL' },
        { name: 'Some Random Test', value: 10, unit: 'U/L' }
      ];

      const result = await metricService.autoMapMetrics(unmatchedMetrics, 999995);
      
      expect(result.autoMapped).to.have.lengthOf(2);
      expect(result.requiresReview).to.have.lengthOf(1);
      
      const autoMappedNames = result.autoMapped.map(m => m.name);
      expect(autoMappedNames).to.include('HDL Cholesterol');
      expect(autoMappedNames).to.include('Apolipoprotein B');
    });
  });

  describe('exportSynonymsToJSON', () => {
    it('should export synonyms in correct JSON format', async () => {
      const jsonData = await metricService.exportSynonymsToJSON();
      
      expect(jsonData).to.be.an('array');
      expect(jsonData.length).to.be.greaterThan(0);
      
      const firstItem = jsonData[0];
      expect(firstItem).to.have.property('synonym_id');
      expect(firstItem).to.have.property('synonym_name');
      expect(firstItem).to.have.property('metric_id');
      expect(firstItem).to.have.property('metric_name');
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('End-to-End Metric Processing', () => {
  let pool;
  const testUserId = 888888;

  before(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    });
    
    // Create test user
    await pool.query(`
      INSERT INTO users (id, email, name) 
      VALUES ($1, 'test@test.com', 'Test User')
      ON CONFLICT (id) DO NOTHING
    `, [testUserId]);
  });

  after(async () => {
    // Cleanup
    await pool.query('DELETE FROM metrics WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  it('should process complete lab result with mapping', async () => {
    const labResults = [
      { name: 'HDL Cholesterol', value: 55, unit: 'mg/dL', date: '2025-01-15' },
      { name: 'LDL Cholesterol', value: 100, unit: 'mg/dL', date: '2025-01-15' },
      { name: 'Glucose', value: 95, unit: 'mg/dL', date: '2025-01-15' }
    ];

    for (const result of labResults) {
      await pool.query(`
        INSERT INTO metrics (user_id, metric_name, metric_value, metric_unit, test_date)
        VALUES ($1, $2, $3, $4, $5)
      `, [testUserId, result.name, result.value, result.unit, result.date]);
    }

    // Verify insertion
    const inserted = await pool.query(`
      SELECT * FROM metrics WHERE user_id = $1 ORDER BY metric_name
    `, [testUserId]);

    expect(inserted.rows).to.have.lengthOf(3);
    
    // Verify values are numeric
    inserted.rows.forEach(row => {
      expect(row.metric_value).to.be.a('number');
    });
  });

  it('should correctly identify outliers using normal ranges', async () => {
    // Insert out-of-range value
    await pool.query(`
      INSERT INTO metrics (user_id, metric_name, metric_value, metric_unit, test_date)
      VALUES ($1, 'HDL Cholesterol', 25, 'mg/dL', CURRENT_DATE)
    `, [testUserId]);

    const result = await pool.query(`
      SELECT m.metric_name, m.metric_value, 
             mm.normal_min, mm.normal_max,
             CASE 
               WHEN m.metric_value < mm.normal_min OR m.metric_value > mm.normal_max 
               THEN true 
               ELSE false 
             END as is_outlier
      FROM metrics m
      JOIN master_metrics mm ON lower(m.metric_name) = lower(mm.metric_name)
      WHERE m.user_id = $1 AND m.metric_name = 'HDL Cholesterol'
      ORDER BY m.created_at DESC
      LIMIT 1
    `, [testUserId]);

    expect(result.rows[0].is_outlier).to.be.true;
  });
});

module.exports = {
  // Export for use in other test files
};
