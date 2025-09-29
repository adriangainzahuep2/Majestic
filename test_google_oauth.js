const fetch = require('node-fetch');

async function testGoogleOAuth() {
  console.log('🔍 Testing Google OAuth Integration...\n');

  try {
    // 1. Test auth config endpoint
    console.log('1️⃣ Testing auth config endpoint...');
    const configResponse = await fetch('http://localhost:5000/api/auth/config');
    const config = await configResponse.json();

    console.log(`   Status: ${configResponse.status}`);
    console.log(`   hasGoogleAuth: ${config.hasGoogleAuth}`);
    console.log(`   googleClientId: ${config.googleClientId ? '✅ Set' : '❌ Not set'}`);

    if (!config.hasGoogleAuth) {
      console.log('\n❌ Google Auth not configured on server');
      return;
    }

    // 2. Test auth check endpoint
    console.log('\n2️⃣ Testing auth check endpoint...');
    const healthResponse = await fetch('http://localhost:5000/api/auth/check');
    const health = await healthResponse.json();

    console.log(`   Status: ${health.status}`);
    console.log(`   googleClientId: ${health.googleClientId}`);
    console.log(`   Environment: ${health.environment}`);

    // 3. Check CORS headers
    console.log('\n3️⃣ Checking CORS headers...');
    const corsResponse = await fetch('http://localhost:5000/api/auth/config', {
      method: 'OPTIONS'
    });

    console.log(`   Status: ${corsResponse.status}`);
    console.log(`   Access-Control-Allow-Origin: ${corsResponse.headers.get('access-control-allow-origin') || 'Not set'}`);
    console.log(`   Access-Control-Allow-Credentials: ${corsResponse.headers.get('access-control-allow-credentials') || 'Not set'}`);

    console.log('\n✅ Google OAuth tests completed');
    console.log('\n📝 Frontend should now be able to:');
    console.log('   - Load Google Sign-In script');
    console.log('   - Initialize with correct Client ID');
    console.log('   - Handle authentication callbacks');
    console.log('   - Send tokens to /api/auth/google');

  } catch (error) {
    console.error('\n❌ Error testing Google OAuth:', error.message);
    console.log('\n💡 Make sure the server is running: npm run start');
  }
}

testGoogleOAuth();
