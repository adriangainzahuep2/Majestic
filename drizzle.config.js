/** @type { import("drizzle-kit").Config } */
export default {
  schema: "./shared/schema.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://neondb_owner:npg_EIi12BMkpafF@ep-curly-dew-ae0gu1st.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require",
  },
  verbose: true,
  strict: true,
};