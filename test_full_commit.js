const fs = require('fs');
const path = require('path');
// AdminMasterService is exported as an instance
const adminService = require('./services/adminMasterService.js');

async function testFullCommit() {
  try {
    console.log('🔍 Testing full commit process...');

    // Read the uploaded file
    const filePath = path.join(__dirname, '../master_template (14).xlsx');
    if (!fs.existsSync(filePath)) {
      console.log('❌ File not found:', filePath);
      return;
    }

    const buffer = fs.readFileSync(filePath);
    console.log('✅ File loaded successfully');

    // First, let's do a dry-run to see what would change
    console.log('\n📊 Running dry-run...');
    const dryRunResult = await adminService.diffDetailed(adminService.parseWorkbook(buffer));
    console.log('Dry-run result:', dryRunResult.totals);

    // Now let's try to commit
    console.log('\n💾 Attempting commit...');
    const commitResult = await adminService.commit(buffer, 'Test commit from debug script - FORCED', 'system');

    if (commitResult.success) {
      console.log('✅ Commit successful!');
      console.log('Version ID:', commitResult.version_id);
      console.log('Changes:', commitResult.added, 'added,', commitResult.changed, 'changed,', commitResult.removed, 'removed');

      // Verify the data was actually saved
      const client = require('./database/schema.js').pool;
      const dbClient = await client.connect();

      const countResult = await dbClient.query('SELECT COUNT(*) as count FROM master_conversion_groups');
      console.log(`📊 Database conversion_groups count after commit: ${countResult.rows[0].count}`);

      dbClient.release();

    } else {
      console.log('❌ Commit failed:', commitResult.errors);
    }

  } catch (error) {
    console.error('❌ Error during test:', error);
  }
}

testFullCommit();
