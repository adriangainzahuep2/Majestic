# Drizzle ORM Setup and Usage Guide

## Overview

This project now uses **Drizzle ORM** for database management with PostgreSQL. Drizzle provides type-safe database operations, migrations, and a powerful query builder.

## Available Commands

### Database Management Workflows
Run these commands through the Replit workflow interface:

- **DB Sync** - Syncs the database schema with Drizzle definitions
- **DB Status** - Shows database statistics and table information  
- **DB Seed** - Seeds the database with health systems data

### Command Line Usage

```bash
# Database utilities
node scripts/db-commands.js status   # Show database status
node scripts/db-commands.js seed     # Seed health systems
node scripts/db-commands.js reset    # ⚠️ Reset entire database

# Drizzle utilities  
node scripts/drizzle-sync.js         # Sync schema with existing database
```

### Manual Drizzle Kit Commands

```bash
# Generate migration files from schema changes
npx drizzle-kit generate

# Apply migrations to database (interactive)
npx drizzle-kit push

# Open Drizzle Studio (database GUI)
npx drizzle-kit studio
```

## File Structure

```
/shared/
  ├── schema.js      # Drizzle schema definitions
  └── database.js    # Database connection and utilities

/scripts/
  ├── drizzle-sync.js    # Schema sync utility
  └── db-commands.js     # Database management commands

drizzle.config.js      # Drizzle configuration
/drizzle/             # Generated migration files
```

## Usage Examples

### Basic Database Operations

```javascript
import { db } from '../shared/database.js';
import { users, metrics, healthSystems } from '../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';

// Insert a new user
const newUser = await db.insert(users).values({
  email: 'user@example.com',
  name: 'John Doe',
  googleId: 'google123'
}).returning();

// Query with relations
const userWithMetrics = await db.query.users.findFirst({
  where: eq(users.id, userId),
  with: {
    metrics: {
      limit: 10,
      orderBy: [desc(metrics.createdAt)]
    }
  }
});

// Complex query
const recentMetrics = await db
  .select()
  .from(metrics)
  .leftJoin(healthSystems, eq(metrics.systemId, healthSystems.id))
  .where(and(
    eq(metrics.userId, userId),
    gt(metrics.testDate, new Date('2024-01-01'))
  ))
  .orderBy(desc(metrics.testDate));
```

### Schema Definitions

All table schemas are defined in `/shared/schema.js`:

- **users** - User profiles and authentication
- **healthSystems** - Health system categories (13 systems)
- **metrics** - Health measurements and lab values  
- **uploads** - File upload tracking
- **imagingStudies** - Medical imaging data
- **dailyPlans** - AI-generated daily health plans
- **aiOutputsLog** - AI processing logs
- **userCustomMetrics** - User-defined metrics
- **questionnaireResponses** - Health questionnaire data

## Migration Strategy

This setup uses a **hybrid approach**:

1. **Existing tables** are preserved and schema is updated to match
2. **New tables** are created using Drizzle migrations
3. **Schema changes** are handled through controlled migrations

### Safe Migration Process

1. Update schema in `/shared/schema.js`
2. Run `npx drizzle-kit generate` to create migration files
3. Review migration files in `/drizzle/` directory
4. Run `npx drizzle-kit push` to apply changes
5. Use `DB Status` workflow to verify changes

## Configuration

**Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `NODE_ENV` - Environment mode (affects SSL settings)

**Drizzle Config** (`drizzle.config.js`):
```javascript
export default {
  schema: "./shared/schema.js",
  out: "./drizzle", 
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL
  }
}
```

## Benefits of Drizzle

✅ **Type Safety** - Full TypeScript support with inference  
✅ **Performance** - Minimal runtime overhead  
✅ **Flexibility** - Raw SQL support when needed  
✅ **Developer Experience** - Great IDE support and debugging  
✅ **Migration Safety** - Interactive migration process  
✅ **Query Builder** - Intuitive and powerful query API  

## Troubleshooting

### Common Issues

**Module Type Warning**: Add `"type": "module"` to `package.json` to eliminate ES module warnings.

**Table Already Exists**: Use `scripts/drizzle-sync.js` to sync existing schema instead of running fresh migrations.

**Interactive Migrations**: For automated deployments, use `--force` flag with drizzle-kit commands, but review changes first.

### Getting Help

- Check workflow logs for detailed error messages
- Use `DB Status` workflow to inspect current database state  
- Review generated migration files before applying
- Test schema changes on development database first