#!/bin/bash

# ==============================================================================
# DATABASE INITIALIZATION SCRIPT
#
# This script is executed by the PostgreSQL container on its first run.
# It creates an additional database and can be used to set up initial schemas,
# roles, or extensions if needed.
#
# The standard POSTGRES_DB, POSTGRES_USER, and POSTGRES_PASSWORD environment
# variables already create a database and a user. This script is for any
# additional setup.
#
# In this case, the primary database 'health_app' is already created by the
# POSTGRES_DB variable in docker-compose.yml. We will use this script to
# add any extensions we might need, like 'uuid-ossp'.
#
# Location: This script must be placed in the /docker-entrypoint-initdb.d/
# directory inside the container.
# ==============================================================================

set -e

# The 'psql' command is available in this script.
# The -v ON_ERROR_STOP=1 flag ensures that the script will exit immediately
# if any command fails.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Enable extensions that might be useful for a modern web application.
    -- For example, 'uuid-ossp' for generating UUIDs.
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- You could also create additional roles here.
    -- For example, a read-only user for analytics.
    -- CREATE USER readonly_user WITH PASSWORD 'readonlypassword';
    -- GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO readonly_user;
    -- GRANT USAGE ON SCHEMA public TO readonly_user;
    -- GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
    -- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;

    -- This is also a good place to create initial schemas if your app
    -- uses a schema other than 'public'.
    -- CREATE SCHEMA IF NOT EXISTS my_app_schema;

    -- The application itself (using a library like Prisma, Sequelize, etc.)
    -- will be responsible for creating the actual tables (migrations).
    -- This script just prepares the database environment.
EOSQL

echo "✅ Database initialized successfully with extensions."