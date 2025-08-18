# Production Deployment Instructions

## First-Time Production Deployment with Drizzle Reset

For the initial production deployment, we need to reset the database to ensure Drizzle has proper column-level tracking from the start.

### Step 1: Backup Existing Data (if needed)
```bash
# If you have important data, export it first
node complete_export.js
```

### Step 2: Run Production Reset
```bash
# Set environment variables for production reset
export NODE_ENV=production
export CONFIRM_PRODUCTION_RESET=true

# Run the one-time reset script
node database/production-reset.js
```

This script will:
- Drop all existing tables
- Run fresh Drizzle migrations 
- Seed health systems data
- Set up proper migration tracking

### Step 3: Verify Setup
The script will output:
- List of created tables
- Confirmation of migration tracking
- Health systems seeding status

### Step 4: Deploy Application
After the reset, normal deployments will use:
```bash
node run-migrations.js  # For any future schema changes
```

## Future Deployments

Once the initial reset is complete, all future deployments will:
- Detect existing Drizzle migration tracking
- Only apply incremental changes
- Preserve all existing data
- Track schema changes at the column level

## Schema Changes Going Forward

1. **Modify Schema**: Edit `database/drizzle-schema.js`
2. **Generate Migration**: Run `npx drizzle-kit generate`
3. **Deploy**: The migration will be applied automatically

## Safety Features

- **Data Preservation**: Future migrations only apply incremental changes
- **Migration History**: Full tracking of all schema changes
- **Rollback Capability**: Can revert changes if needed
- **Deployment Safety**: No more "delete existing data" prompts

## Important Notes

⚠️ **The production reset script should only be run ONCE during initial deployment**

✅ **After the reset, all future deployments will be safe and preserve data**

🔧 **Drizzle will now track every column-level change for proper schema management**