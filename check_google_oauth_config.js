const fetch = require('node-fetch');

async function checkGoogleOAuthConfig() {
  console.log('🔍 Checking Google OAuth Configuration...\n');

  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log(`   GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Not set'}`);
  console.log(`   GOOGLE_CLIENT_SECRET: ${process.env.GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Not set'}`);
  console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? '✅ Set' : '❌ Not set'}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

  try {
    // Test auth config endpoint
    const response = await fetch('http://localhost:5000/api/auth/config');
    const config = await response.json();

    console.log('\n🌐 Auth Config Endpoint:');
    console.log(`   Status: ${response.status}`);
    console.log(`   googleClientId: ${config.googleClientId ? '✅ Set' : '❌ Not set'}`);
    console.log(`   hasGoogleAuth: ${config.hasGoogleAuth}`);

    // Test auth check endpoint
    const healthResponse = await fetch('http://localhost:5000/api/auth/check');
    const health = await healthResponse.json();

    console.log('\n💚 Health Check:');
    console.log(`   Status: ${health.status}`);
    console.log(`   googleClientId: ${health.googleClientId}`);
    console.log(`   Environment: ${health.environment}`);

  } catch (error) {
    console.error('\n❌ Error testing endpoints:', error.message);
    console.log('\n💡 Make sure the server is running: npm run start');
  }

  console.log('\n📝 Next Steps:');
  console.log('1. Set GOOGLE_CLIENT_ID in .env file');
  console.log('2. Set GOOGLE_CLIENT_SECRET in .env file');
  console.log('3. Restart the server: npm run start');
  console.log('4. Test the auth config: curl http://localhost:5000/api/auth/config');
}

checkGoogleOAuthConfig();
