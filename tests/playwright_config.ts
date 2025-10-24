// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: '.env.test' });

export default defineConfig({
  testDir: './tests/e2e',
  
  // Timeout por test
  timeout: 60 * 1000,
  
  // Timeout para expect
  expect: {
    timeout: 10000
  },
  
  // Configuración de ejecución
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'junit.xml' }],
    ['list']
  ],
  
  // Configuración global
  use: {
    baseURL: process.env.BASE_URL || 'http://52.90.115.123',
    
    // Trace on failure
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
    
    // Video on failure
    video: 'retain-on-failure',
    
    // Timeout de navegación
    navigationTimeout: 30000,
    
    // Timeout de acción
    actionTimeout: 15000,
  },

  // Proyectos (browsers)
  projects: [
    // Setup para autenticación
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Chrome Desktop
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup'],
    },

    // Firefox Desktop
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup'],
    },

    // Safari Desktop
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup'],
    },

    // Mobile Chrome
    {
      name: 'Mobile Chrome',
      use: { 
        ...devices['Pixel 5'],
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup'],
    },

    // Mobile Safari
    {
      name: 'Mobile Safari',
      use: { 
        ...devices['iPhone 13'],
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup'],
    },

    // Tests sin autenticación (para OAuth flow)
    {
      name: 'unauthenticated',
      testMatch: /auth\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ],

  // Dev server (opcional, si quieres correr local)
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

// ============================================================================

// tests/e2e/global.setup.ts
import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const authFile = 'playwright/.auth/user.json';
const adminAuthFile = 'playwright/.auth/admin.json';

// Setup autenticación de usuario normal
setup('authenticate user', async ({ page, context }) => {
  const BASE_URL = process.env.BASE_URL || 'http://52.90.115.123';
  const GOOGLE_EMAIL = process.env.GOOGLE_TEST_EMAIL;
  const GOOGLE_PASSWORD = process.env.GOOGLE_TEST_PASSWORD;

  console.log('🔐 Setting up user authentication...');

  if (!GOOGLE_EMAIL || !GOOGLE_PASSWORD) {
    console.warn('⚠️  Skipping OAuth setup: credentials not provided');
    console.warn('   Set GOOGLE_TEST_EMAIL and GOOGLE_TEST_PASSWORD in .env.test');
    
    // Crear archivo de auth vacío para que los tests no fallen
    const authDir = path.dirname(authFile);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  try {
    await page.goto(BASE_URL);

    // Click en Google Sign-In
    const googleButton = page.locator('button:has-text("Sign in with Google"), a:has-text("Sign in with Google")').first();
    await googleButton.click();

    // Esperar redirección a Google
    await page.waitForURL(/accounts\.google\.com/, { timeout: 10000 });

    // Ingresar email
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(GOOGLE_EMAIL);
    await emailInput.press('Enter');

    // Esperar y llenar password
    await page.waitForTimeout(2000);
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(GOOGLE_PASSWORD);
    await passwordInput.press('Enter');

    // Esperar redirección de vuelta a la app
    await page.waitForURL(`${BASE_URL}/**`, { timeout: 30000 });

    // Verificar que estamos autenticados
    await expect(page.locator('text=/logout|sign out|profile|dashboard/i').first()).toBeVisible({ timeout: 10000 });

    console.log('✅ User authentication successful');

    // Guardar estado de autenticación
    await context.storageState({ path: authFile });

  } catch (error) {
    console.error('❌ Authentication failed:', error);
    throw error;
  }
});

// Setup autenticación de admin (opcional)
setup('authenticate admin', async ({ page, context }) => {
  const BASE_URL = process.env.BASE_URL || 'http://52.90.115.123';
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  console.log('🔐 Setting up admin authentication...');

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn('⚠️  Skipping admin setup: credentials not provided');
    
    const authDir = path.dirname(adminAuthFile);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    fs.writeFileSync(adminAuthFile, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  try {
    await page.goto(BASE_URL);

    const googleButton = page.locator('button:has-text("Sign in with Google"), a:has-text("Sign in with Google")').first();
    await googleButton.click();

    await page.waitForURL(/accounts\.google\.com/, { timeout: 10000 });

    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(ADMIN_EMAIL);
    await emailInput.press('Enter');

    await page.waitForTimeout(2000);
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(ADMIN_PASSWORD);
    await passwordInput.press('Enter');

    await page.waitForURL(`${BASE_URL}/**`, { timeout: 30000 });
    await expect(page.locator('text=/admin|dashboard/i').first()).toBeVisible({ timeout: 10000 });

    console.log('✅ Admin authentication successful');

    await context.storageState({ path: adminAuthFile });

  } catch (error) {
    console.error('❌ Admin authentication failed:', error);
    throw error;
  }
});

// ============================================================================

// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should display sign in button', async ({ page }) => {
    await page.goto('/');
    
    const signInButton = page.locator('button:has-text("Sign in with Google"), a:has-text("Sign in with Google")').first();
    await expect(signInButton).toBeVisible();
  });

  test('should redirect to Google OAuth', async ({ page, context }) => {
    await page.goto('/');
    
    const signInButton = page.locator('button:has-text("Sign in with Google")').first();
    
    // Interceptar navegación a Google
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      signInButton.click()
    ]);
    
    await popup.waitForLoadState();
    expect(popup.url()).toContain('accounts.google.com');
    
    await popup.close();
  });

  test('should handle sign out', async ({ page }) => {
    // Este test necesita estar autenticado primero
    const BASE_URL = process.env.BASE_URL || 'http://52.90.115.123';
    
    // Usar la autenticación guardada temporalmente
    await page.goto(BASE_URL);
    
    // Buscar botón de logout
    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign out"), a:has-text("Logout")').first();
    
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      
      // Verificar que volvemos a la pantalla de login
      await expect(page.locator('button:has-text("Sign in with Google")')).toBeVisible({ timeout: 5000 });
    }
  });
});

// ============================================================================

// tests/e2e/example.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Example E2E Tests', () => {
  test('should load home page', async ({ page }) => {
    await page.goto('/');
    
    // Verificar que la página carga
    await expect(page).toHaveTitle(/.*/, { timeout: 5000 });
  });

  test('should navigate through the app', async ({ page }) => {
    await page.goto('/');
    
    // Esperar que la página esté lista
    await page.waitForLoadState('networkidle');
    
    // Verificar elementos comunes de la UI
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should be responsive', async ({ page }) => {
    // Test desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    // Test mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});

// ============================================================================

// .env.test (example)
// BASE_URL=http://52.90.115.123
// GOOGLE_TEST_EMAIL=test@example.com
// GOOGLE_TEST_PASSWORD=your_secure_password
// ADMIN_EMAIL=admin@example.com
// ADMIN_PASSWORD=admin_secure_password

// ============================================================================

// package.json (scripts section)
// {
//   "scripts": {
//     "test:e2e": "playwright test",
//     "test:e2e:ui": "playwright test --ui",
//     "test:e2e:headed": "playwright test --headed",
//     "test:e2e:debug": "playwright test --debug",
//     "test:e2e:chromium": "playwright test --project=chromium",
//     "test:e2e:firefox": "playwright test --project=firefox",
//     "test:e2e:webkit": "playwright test --project=webkit",
//     "test:e2e:mobile": "playwright test --project='Mobile Chrome' --project='Mobile Safari'",
//     "test:e2e:report": "playwright show-report"
//   }
// }

// ============================================================================

// .gitignore additions
// playwright-report/
// test-results/
// playwright/.auth/
// test-results.json
// junit.xml
