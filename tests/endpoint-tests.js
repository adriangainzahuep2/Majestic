#!/usr/bin/env node
// ============================================================================
// Endpoint Testing Suite - Majestic Health App
// ============================================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const TARGET_URL = process.env.TARGET_URL || 'http://localhost';
const MAX_RETRIES = 30;
const RETRY_DELAY = 10000; // 10 seconds

// Test results
const results = {
    passed: 0,
    failed: 0,
    tests: [],
    startTime: new Date(),
    endTime: null
};

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

// Logging functions
const log = {
    info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}[✓]${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}[✗]${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}[⚠]${colors.reset} ${msg}`),
    test: (msg) => console.log(`${colors.cyan}[TEST]${colors.reset} ${msg}`)
};

// HTTP request helper
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: 30000
        };

        const req = client.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = {
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data,
                        json: null
                    };
                    
                    if (res.headers['content-type']?.includes('application/json')) {
                        try {
                            response.json = JSON.parse(data);
                        } catch (e) {
                            // Not valid JSON
                        }
                    }
                    
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) {
            req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }

        req.end();
    });
}

// Wait for service to be ready
async function waitForService(url, maxRetries = MAX_RETRIES) {
    log.info(`Waiting for service at ${url}...`);
    
    for (let i = 1; i <= maxRetries; i++) {
        try {
            const response = await makeRequest(url + '/health');
            if (response.statusCode === 200) {
                log.success(`Service is ready after ${i} attempts`);
                return true;
            }
        } catch (error) {
            // Service not ready yet
        }
        
        if (i < maxRetries) {
            log.info(`Attempt ${i}/${maxRetries} - Waiting ${RETRY_DELAY/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }
    
    log.error('Service did not become ready in time');
    return false;
}

// Test suite
const tests = [
    {
        name: 'Health Check',
        endpoint: '/health',
        method: 'GET',
        expectedStatus: 200,
        validate: (response) => {
            if (!response.json) return 'Response is not JSON';
            if (response.json.status !== 'healthy') return 'Status is not healthy';
            if (!response.json.timestamp) return 'Missing timestamp';
            return null;
        }
    },
    {
        name: 'Root Endpoint',
        endpoint: '/',
        method: 'GET',
        expectedStatus: 200,
        validate: (response) => {
            if (!response.json) return 'Response is not JSON';
            if (!response.json.name) return 'Missing app name';
            return null;
        }
    },
    {
        name: 'Health Systems List',
        endpoint: '/api/health-systems',
        method: 'GET',
        expectedStatus: 200,
        validate: (response) => {
            if (!response.json) return 'Response is not JSON';
            if (!Array.isArray(response.json)) return 'Response is not an array';
            if (response.json.length === 0) return 'Health systems list is empty';
            
            const firstSystem = response.json[0];
            if (!firstSystem.id || !firstSystem.name) {
                return 'Health system missing required fields';
            }
            
            return null;
        }
    },
    {
        name: 'Users Endpoint',
        endpoint: '/api/users',
        method: 'GET',
        expectedStatus: 200,
        validate: (response) => {
            if (!response.json) return 'Response is not JSON';
            if (!Array.isArray(response.json)) return 'Response is not an array';
            // Empty array is acceptable for users
            return null;
        }
    },
    {
        name: 'Database Connection',
        endpoint: '/api/db-status',
        method: 'GET',
        expectedStatus: 200,
        validate: (response) => {
            // This endpoint might not exist, but we'll try
            return null;
        },
        optional: true
    }
];

// Run a single test
async function runTest(test) {
    log.test(`Running: ${test.name}`);
    
    const testResult = {
        name: test.name,
        endpoint: test.endpoint,
        status: 'FAIL',
        statusCode: null,
        responseTime: null,
        error: null,
        optional: test.optional || false
    };

    const startTime = Date.now();
    
    try {
        const url = TARGET_URL + test.endpoint;
        const response = await makeRequest(url, {
            method: test.method || 'GET',
            headers: test.headers || {}
        });
        
        testResult.responseTime = Date.now() - startTime;
        testResult.statusCode = response.statusCode;
        
        // Check status code
        if (response.statusCode !== test.expectedStatus) {
            testResult.error = `Expected status ${test.expectedStatus}, got ${response.statusCode}`;
        } else if (test.validate) {
            // Run custom validation
            const validationError = test.validate(response);
            if (validationError) {
                testResult.error = validationError;
            } else {
                testResult.status = 'PASS';
            }
        } else {
            testResult.status = 'PASS';
        }
        
    } catch (error) {
        testResult.responseTime = Date.now() - startTime;
        testResult.error = error.message;
    }
    
    // Log result
    if (testResult.status === 'PASS') {
        log.success(`${test.name}: PASS (${testResult.responseTime}ms)`);
        results.passed++;
    } else if (test.optional) {
        log.warning(`${test.name}: OPTIONAL FAIL - ${testResult.error}`);
    } else {
        log.error(`${test.name}: FAIL - ${testResult.error}`);
        results.failed++;
    }
    
    results.tests.push(testResult);
    return testResult;
}

// Run all tests
async function runAllTests() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('           MAJESTIC HEALTH APP - ENDPOINT TESTS            ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    
    log.info(`Target URL: ${TARGET_URL}`);
    log.info(`Total Tests: ${tests.length}`);
    console.log('');
    
    // Wait for service to be ready
    const isReady = await waitForService(TARGET_URL);
    if (!isReady) {
        log.error('Service is not ready. Aborting tests.');
        process.exit(1);
    }
    
    console.log('');
    log.info('Starting endpoint tests...');
    console.log('');
    
    // Run each test
    for (const test of tests) {
        await runTest(test);
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    results.endTime = new Date();
    
    // Print summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                      TEST SUMMARY                         ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    
    console.log(`Total Tests:    ${tests.length}`);
    console.log(`${colors.green}Passed:         ${results.passed}${colors.reset}`);
    console.log(`${colors.red}Failed:         ${results.failed}${colors.reset}`);
    console.log(`Success Rate:   ${((results.passed / tests.length) * 100).toFixed(1)}%`);
    
    const duration = (results.endTime - results.startTime) / 1000;
    console.log(`Duration:       ${duration.toFixed(2)}s`);
    console.log('');
    
    // Detailed results
    if (results.failed > 0) {
        console.log('Failed Tests:');
        results.tests.filter(t => t.status === 'FAIL' && !t.optional).forEach(t => {
            console.log(`  ${colors.red}✗${colors.reset} ${t.name}: ${t.error}`);
        });
        console.log('');
    }
    
    // Save results to file
    const resultsPath = path.join(__dirname, 'test-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    log.success(`Results saved to: ${resultsPath}`);
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    
    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
    log.error(`Unhandled error: ${error.message}`);
    process.exit(1);
});

// Run tests
runAllTests().catch(error => {
    log.error(`Fatal error: ${error.message}`);
    process.exit(1);
});
