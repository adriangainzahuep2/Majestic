/** @type { import("drizzle-kit").Config } */
export default {
  schema: "./shared/schema.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  },
  verbose: true,
  strict: true,
};