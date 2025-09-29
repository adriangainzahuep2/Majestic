console.log('🔍 Checking Environment Variables...\n');

// Check required variables
const required = ['GOOGLE_CLIENT_ID', 'JWT_SECRET'];
const optional = ['GOOGLE_CLIENT_SECRET', 'ADMIN_EMAILS', 'DATABASE_URL', 'DEMO_USER_ID', 'DEMO_EMAIL'];

console.log('📋 Required Variables:');
required.forEach(varName => {
  const value = process.env[varName];
  const status = value ? '✅ Set' : '❌ Not set';
  console.log(`   ${varName}: ${status}`);
});

console.log('\n📋 Optional Variables:');
optional.forEach(varName => {
  const value = process.env[varName];
  const status = value ? '✅ Set' : '⚠️  Not set (optional)';
  console.log(`   ${varName}: ${status}`);
});

console.log('\n💡 Next Steps:');
console.log('1. Create .env file with required variables');
console.log('2. Set GOOGLE_CLIENT_ID from Google Cloud Console');
console.log('3. Generate secure JWT_SECRET: openssl rand -hex 32');
console.log('4. Restart server: npm run start');
console.log('5. Test: curl http://localhost:5000/api/auth/config');

if (!process.env.GOOGLE_CLIENT_ID || !process.env.JWT_SECRET) {
  console.log('\n❌ Missing required variables. Google OAuth will not work.');
  process.exit(1);
} else {
  console.log('\n✅ All required variables are set!');
}
