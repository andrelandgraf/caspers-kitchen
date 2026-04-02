# Create Unity Catalog Instance

Unity Catalog for synced Lakebase data and downstream analytics.

## Resources Created

| Resource | Value |
|----------|-------|
| Catalog | `caspers-kitchen-prod` |
| Schema | `caspers-kitchen-prod.lakebase` (destination for Lakehouse Sync) |

## Steps

### 1. Create the catalog

The CLI requires an explicit storage location, so we used a SQL statement through a warehouse instead (uses workspace default storage):

```bash
databricks experimental aitools tools query \
  "CREATE CATALOG IF NOT EXISTS \`caspers-kitchen-prod\` COMMENT 'Production catalog for Caspers Kitchen Lakebase sync'" \
  --profile DEFAULT
```

### 2. Create the destination schema

```bash
databricks experimental aitools tools query \
  "CREATE SCHEMA IF NOT EXISTS \`caspers-kitchen-prod\`.\`lakebase\` COMMENT 'Lakebase CDC sync tables'" \
  --profile DEFAULT
```

### 3. Verify

```bash
databricks schemas list caspers-kitchen-prod --profile DEFAULT
```

Expected output:

```
caspers-kitchen-prod.default             (auto-created)
caspers-kitchen-prod.information_schema  (auto-created)
caspers-kitchen-prod.lakebase            Lakebase CDC sync tables
```

## Notes

- There is also a pre-existing `casper` catalog in the workspace with demo/analytics data. The new `caspers-kitchen-prod` catalog is dedicated to the production Lakebase sync pipeline.
- The `lakebase` schema will contain `lb_<table_name>_history` Delta tables once Lakehouse Sync is enabled.
