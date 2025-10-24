const { pool } = require('../database/schema_enhanced');
const { metricMatchingService } = require('../services/metric_matching_service');
const { spreadsheetAnalyzer } = require('../services/spreadsheet_analyzer');

class ComprehensiveTests {
  constructor() {
    this.passed = [];
    this.failed = [];
    this.warnings = [];
  }

  logTest(name, passed, message = '') {
    if (passed) {
      console.log(`✅ ${name}`);
      this.passed.push(name);
    } else {
      console.log(`❌ ${name}: ${message}`);
      this.failed.push({ name, message });
    }
  }

  logWarning(message) {
    console.log(`⚠️ ${message}`);
    this.warnings.push(message);
  }

  async testDatabaseSchema() {
    console.log('\n📋 Testing Database Schema...');
    try {
      const client = await pool.connect();
      const tables = [
        'users', 'health_systems', 'uploads', 'metrics',
        'master_metrics', 'master_metric_synonyms', 'master_conversion_groups',
        'oauth_sessions', 'api_keys', 'mobile_devices', 'sync_queue',
        'pending_metric_suggestions', 'spreadsheet_change_log',
        'master_versions', 'master_snapshots'
      ];

      for (const table of tables) {
        const result = await client.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)`, [table]);
        this.logTest(`Table "${table}" exists`, result.rows[0].exists, `Table ${table} not found`);
      }

      const metricsColumns = ['normal_min', 'normal_max', 'matched_metric_id', 'confidence_score', 'auto_mapped'];
      for (const column of metricsColumns) {
        const result = await client.query(`SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'metrics' AND column_name = $1)`, [column]);
        this.logTest(`Metrics column "${column}" exists`, result.rows[0].exists, `Column ${column} not found in metrics table`);
      }

      client.release();
    } catch (error) {
      this.logTest('Database schema test', false, error.message);
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 COMPREHENSIVE TEST REPORT');
    console.log('='.repeat(70));
    console.log(`\n✅ Tests Passed: ${this.passed.length}`);
    console.log(`❌ Tests Failed: ${this.failed.length}`);
    console.log(`⚠️ Warnings: ${this.warnings.length}`);

    if (this.failed.length > 0) {
      console.log('\n❌ Failed Tests:');
      this.failed.forEach((fail, i) => {
        console.log(` ${i + 1}. ${fail.name}`);
        console.log(`   ${fail.message}`);
      });
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️ Warnings:');
      this.warnings.forEach((warning, i) => {
        console.log(` ${i + 1}. ${warning}`);
      });
    }

    const passRate = (this.passed.length / (this.passed.length + this.failed.length) * 100).toFixed(1);
    console.log(`\n📈 Pass Rate: ${passRate}%`);
    console.log('\n' + '='.repeat(70));

    if (this.failed.length === 0) {
      console.log('🎉 All tests passed! System is ready for deployment.');
    } else {
      console.log('⚠️ Some tests failed. Please review and fix issues before deployment.');
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Comprehensive Test Suite...\n');
    try {
      await this.testDatabaseSchema();
      this.generateReport();
      return this.failed.length === 0;
    } catch (error) {
      console.error('\n💥 Fatal error during testing:', error);
      return false;
    }
  }
}

if (require.main === module) {
  const tests = new ComprehensiveTests();
  tests.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test suite crashed:', error);
      process.exit(1);
    });
}

module.exports = { ComprehensiveTests };
