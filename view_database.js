/**
 * Database Viewer Script
 * View all data in the Majestic database
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://majestic:simple123@localhost:5432/health_app',
  ssl: false
});

async function viewDatabase() {
  try {
    console.log('🔍 MAJESTIC DATABASE VIEWER');
    console.log('============================\n');
    
    // 1. Users
    console.log('👥 USERS:');
    console.log('----------');
    const users = await pool.query(`
      SELECT id, email, name, created_at 
      FROM users 
      ORDER BY created_at DESC
    `);
    
    if (users.rows.length === 0) {
      console.log('   ❌ No users found');
    } else {
      users.rows.forEach(user => {
        console.log(`   ID: ${user.id} | Email: ${user.email} | Name: ${user.name}`);
        console.log(`       Created: ${user.created_at}`);
      });
    }
    
    // Get demo user ID for detailed view
    const demoUser = users.rows.find(u => u.email.includes('demo'));
    if (!demoUser) {
      console.log('\n❌ No demo user found. Cannot show detailed data.');
      return;
    }
    
    const userId = demoUser.id;
    console.log(`\n🎯 Detailed view for Demo User (ID: ${userId}):\n`);
    
    // 2. Uploads
    console.log('📁 UPLOADS:');
    console.log('------------');
    const uploads = await pool.query(`
      SELECT id, filename, file_type, processing_status, created_at
      FROM uploads 
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    
    if (uploads.rows.length === 0) {
      console.log('   ❌ No uploads found');
    } else {
      uploads.rows.forEach(upload => {
        console.log(`   ID: ${upload.id} | File: ${upload.filename}`);
        console.log(`       Type: ${upload.file_type} | Status: ${upload.processing_status}`);
        console.log(`       Date: ${upload.created_at}`);
        console.log('');
      });
    }
    
    // 3. Metrics
    console.log('📊 METRICS:');
    console.log('------------');
    const metrics = await pool.query(`
      SELECT metric_name, metric_value, units, test_date, status, system_id
      FROM metrics 
      WHERE user_id = $1
      ORDER BY test_date DESC, metric_name
    `, [userId]);
    
    if (metrics.rows.length === 0) {
      console.log('   ❌ No metrics found');
    } else {
      // Group by test date
      const metricsByDate = {};
      metrics.rows.forEach(metric => {
        const date = metric.test_date.toISOString().split('T')[0];
        if (!metricsByDate[date]) {
          metricsByDate[date] = [];
        }
        metricsByDate[date].push(metric);
      });
      
      Object.entries(metricsByDate).forEach(([date, dateMetrics]) => {
        console.log(`\n   📅 ${date} (${dateMetrics.length} metrics):`);
        dateMetrics.forEach(metric => {
          const statusIcon = metric.status === 'High' ? '🔴' : 
                            metric.status === 'Low' ? '🟡' : '🟢';
          console.log(`      ${statusIcon} ${metric.metric_name}: ${metric.metric_value} ${metric.units} [${metric.status}]`);
        });
      });
    }
    
    // 4. Custom Reference Ranges
    console.log('\n\n🎯 CUSTOM REFERENCE RANGES:');
    console.log('-----------------------------');
    const ranges = await pool.query(`
      SELECT metric_name, min_value, max_value, units, medical_condition, 
             notes, valid_from, valid_until, is_active
      FROM custom_reference_ranges 
      WHERE user_id = $1
      ORDER BY metric_name
    `, [userId]);
    
    if (ranges.rows.length === 0) {
      console.log('   ❌ No custom ranges found');
    } else {
      ranges.rows.forEach(range => {
        const status = range.is_active ? '✅ Active' : '❌ Inactive';
        console.log(`   ${range.metric_name}: ${range.min_value}-${range.max_value} ${range.units}`);
        console.log(`      Condition: ${range.medical_condition} | ${status}`);
        console.log(`      Period: ${range.valid_from} to ${range.valid_until || 'ongoing'}`);
        if (range.notes) {
          console.log(`      Notes: ${range.notes}`);
        }
        console.log('');
      });
    }
    
    // 5. Pending Metric Suggestions
    console.log('💡 PENDING METRIC SUGGESTIONS:');
    console.log('--------------------------------');
    const suggestions = await pool.query(`
      SELECT id, test_date, status, unmatched_metrics, ai_suggestions
      FROM pending_metric_suggestions 
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    
    if (suggestions.rows.length === 0) {
      console.log('   ❌ No pending suggestions found');
    } else {
      suggestions.rows.forEach(suggestion => {
        console.log(`   📋 Suggestion ID: ${suggestion.id} | Date: ${suggestion.test_date} | Status: ${suggestion.status}`);
        
        const unmatched = JSON.parse(suggestion.unmatched_metrics || '[]');
        console.log(`      Unmatched metrics (${unmatched.length}):`);
        unmatched.forEach(metric => {
          console.log(`         - ${metric.name}: ${metric.value} ${metric.unit}`);
        });
        
        const aiSuggestions = JSON.parse(suggestion.ai_suggestions || '{}');
        if (aiSuggestions.suggestions) {
          console.log(`      AI suggestions (${aiSuggestions.suggestions.length}):`);
          aiSuggestions.suggestions.forEach(suggestion => {
            if (suggestion.suggested_matches && suggestion.suggested_matches.length > 0) {
              const match = suggestion.suggested_matches[0];
              console.log(`         - "${suggestion.original_name}" → "${match.standard_name}" (${Math.round(match.confidence * 100)}%)`);
            }
          });
        }
        console.log('');
      });
    }
    
    // 6. Summary
    console.log('📈 SUMMARY:');
    console.log('------------');
    console.log(`   👥 Users: ${users.rows.length}`);
    console.log(`   📁 Uploads: ${uploads.rows.length}`);
    console.log(`   📊 Metrics: ${metrics.rows.length}`);
    console.log(`   🎯 Custom Ranges: ${ranges.rows.length}`);
    console.log(`   💡 Pending Suggestions: ${suggestions.rows.length}`);
    
    console.log('\n🎉 Database view completed!');
    
  } catch (error) {
    console.error('❌ Error viewing database:', error.message);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  viewDatabase().catch(console.error);
}

module.exports = { viewDatabase };
