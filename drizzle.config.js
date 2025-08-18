import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './database/drizzle-schema.js',
  out: './database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  },
  verbose: true,
  strict: true,
});