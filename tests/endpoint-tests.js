const { chromium } = require('playwright');

const BASE_URL = 'http://${LIGHTSAIL_IP}';

async function runTests() {
  console.log('🧪 Iniciando tests de endpoints...');
  console.log('Base URL:', BASE_URL);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // Test 1: Health Check
  try {
    console.log('\n📍 Test 1: Health Check');
    const response = await page.goto(`${BASE_URL}/health`, { timeout: 30000 });
    const status = response.status();
    const body = await response.json();

    if (status === 200 && body.status === 'healthy') {
      console.log('✓ Health check passed');
      console.log('  Database:', body.database);
      results.passed++;
      results.tests.push({ name: 'Health Check', status: 'PASS', response: body });
    } else {
      throw new Error(`Health check failed: ${status}`);
    }
  } catch (error) {
    console.log('✗ Health check failed:', error.message);
    results.failed++;
    results.tests.push({ name: 'Health Check', status: 'FAIL', error: error.message });
  }

  // Test 2: Root Endpoint
  try {
    console.log('\n📍 Test 2: Root Endpoint');
    const response = await page.goto(`${BASE_URL}/`, { timeout: 30000 });
    const status = response.status();
    const body = await response.json();

    if (status === 200 && body.app) {
      console.log('✓ Root endpoint passed');
      console.log('  App:', body.app);
      console.log('  Version:', body.version);
      results.passed++;
      results.tests.push({ name: 'Root Endpoint', status: 'PASS', response: body });
    } else {
      throw new Error(`Root endpoint failed: ${status}`);
    }
  } catch (error) {
    console.log('✗ Root endpoint failed:', error.message);
    results.failed++;
    results.tests.push({ name: 'Root Endpoint', status: 'FAIL', error: error.message });
  }

  // Test 3: Health Systems API
  try {
    console.log('\n📍 Test 3: Health Systems API');
    const response = await page.goto(`${BASE_URL}/api/health-systems`, { timeout: 30000 });
    const status = response.status();
    const body = await response.json();

    if (status === 200 && body.success && Array.isArray(body.data)) {
      console.log('✓ Health systems API passed');
      console.log('  Systems found:', body.data.length);
      results.passed++;
      results.tests.push({ name: 'Health Systems API', status: 'PASS', count: body.data.length });
    } else {
      throw new Error(`Health systems API failed: ${status}`);
    }
  } catch (error) {
    console.log('✗ Health systems API failed:', error.message);
    results.failed++;
    results.tests.push({ name: 'Health Systems API', status: 'FAIL', error: error.message });
  }

  // Test 4: Users API
  try {
    console.log('\n📍 Test 4: Users API');
    const response = await page.goto(`${BASE_URL}/api/users`, { timeout: 30000 });
    const status = response.status();
    const body = await response.json();

    if (status === 200 && body.success) {
      console.log('✓ Users API passed');
      console.log('  Users found:', body.data.length);
      results.passed++;
      results.tests.push({ name: 'Users API', status: 'PASS', count: body.data.length });
    } else {
      throw new Error(`Users API failed: ${status}`);
    }
  } catch (error) {
    console.log('✗ Users API failed:', error.message);
    results.failed++;
    results.tests.push({ name: 'Users API', status: 'FAIL', error: error.message });
  }

  await browser.close();

  // Resumen
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN DE TESTS');
  console.log('='.repeat(60));
  console.log(`✓ Tests Pasados: ${results.passed}`);
  console.log(`✗ Tests Fallidos: ${results.failed}`);
  console.log(`📝 Total: ${results.passed + results.failed}`);

  // Guardar resultados
  const fs = require('fs');
  fs.writeFileSync(
    '${TESTS_DIR}/test-results.json',
    JSON.stringify(results, null, 2)
  );

  return results.failed === 0;
}

runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Error ejecutando tests:', error);
    process.exit(1);
  });
