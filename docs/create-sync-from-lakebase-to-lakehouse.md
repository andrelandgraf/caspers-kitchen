# Sync Lakebase to Lakehouse (Lakehouse Sync)

Replicate all Lakebase Postgres tables into Unity Catalog as managed Delta tables using Lakehouse Sync (CDC-based, SCD Type 2 history).

## Prerequisites

- Lakebase project on AWS (see [create-lakebase-instance.md](./create-lakebase-instance.md))
- Unity Catalog destination (see [create-unity-catalog-instance.md](./create-unity-catalog-instance.md))

## Steps

### 1. Verify replica identity

Connect to Lakebase via psql and check all tables:

```bash
TOKEN=$(databricks auth token --profile DEFAULT | jq -r '.access_token')
PGPASSWORD="$TOKEN" psql \
  -h ep-misty-truth-d1ys8dfq.database.us-west-2.cloud.databricks.com \
  -U you@databricks.com \
  -d databricks_postgres
```

```sql
SELECT c.relname AS table_name,
       CASE c.relreplident
         WHEN 'd' THEN 'default'
         WHEN 'f' THEN 'full'
       END AS replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname = 'public'
ORDER BY c.relname;
```

### 2. Set REPLICA IDENTITY FULL on all tables

All 20 tables were on `default` and needed to be set to `FULL`:

```sql
ALTER TABLE accounts REPLICA IDENTITY FULL;
ALTER TABLE admins REPLICA IDENTITY FULL;
ALTER TABLE cart_items REPLICA IDENTITY FULL;
ALTER TABLE carts REPLICA IDENTITY FULL;
ALTER TABLE credits REPLICA IDENTITY FULL;
ALTER TABLE deliveries REPLICA IDENTITY FULL;
ALTER TABLE drivers REPLICA IDENTITY FULL;
ALTER TABLE menu_items REPLICA IDENTITY FULL;
ALTER TABLE order_items REPLICA IDENTITY FULL;
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE promotion_redemptions REPLICA IDENTITY FULL;
ALTER TABLE promotions REPLICA IDENTITY FULL;
ALTER TABLE refunds REPLICA IDENTITY FULL;
ALTER TABLE sessions REPLICA IDENTITY FULL;
ALTER TABLE simulation_configs REPLICA IDENTITY FULL;
ALTER TABLE simulation_runs REPLICA IDENTITY FULL;
ALTER TABLE support_cases REPLICA IDENTITY FULL;
ALTER TABLE support_messages REPLICA IDENTITY FULL;
ALTER TABLE users REPLICA IDENTITY FULL;
ALTER TABLE verifications REPLICA IDENTITY FULL;
```

### 3. Check for unsupported data types

```sql
SELECT c.table_name, c.column_name, c.udt_name AS data_type
FROM information_schema.columns c
JOIN pg_catalog.pg_type t ON t.typname = c.udt_name
WHERE c.table_schema = 'public'
  AND NOT (
    c.udt_name IN (
      'bool','int2','int4','int8','text','varchar','bpchar',
      'jsonb','numeric','date','timestamp','timestamptz',
      'real','float4','float8'
    )
    OR t.typcategory = 'E'
  )
ORDER BY c.table_name, c.ordinal_position;
```

Result: only `uuid` columns were flagged. `uuid` is supported by Lakehouse Sync (maps to `STRING` in Delta) — no action needed.

### 4. Enable Lakehouse Sync (UI)

This step is not yet available via CLI and must be done in the Databricks UI:

1. Open **Catalog** in the workspace
2. Find Lakebase project **caspers-prod-db** → branch **production**
3. Click **Lakehouse Sync** → **Start Sync**
4. Configure:
   - Source database: `databricks_postgres`
   - Source schema: `public`
   - Destination catalog: `caspers-kitchen-prod`
   - Destination schema: `lakebase`
   - Tables: all 20

### 5. Monitor sync status

After enabling, check from psql:

```sql
SELECT * FROM wal2delta.tables;
```

Or check the destination tables in Unity Catalog:

```bash
databricks tables list caspers-kitchen-prod lakebase --profile DEFAULT
```

## Synced Tables

Once active, the `caspers-kitchen-prod.lakebase` schema will contain these Delta history tables:

| Source Table (Postgres) | Destination Table (Delta) |
|------------------------|--------------------------|
| `accounts` | `lb_accounts_history` |
| `admins` | `lb_admins_history` |
| `cart_items` | `lb_cart_items_history` |
| `carts` | `lb_carts_history` |
| `credits` | `lb_credits_history` |
| `deliveries` | `lb_deliveries_history` |
| `drivers` | `lb_drivers_history` |
| `menu_items` | `lb_menu_items_history` |
| `order_items` | `lb_order_items_history` |
| `orders` | `lb_orders_history` |
| `promotion_redemptions` | `lb_promotion_redemptions_history` |
| `promotions` | `lb_promotions_history` |
| `refunds` | `lb_refunds_history` |
| `sessions` | `lb_sessions_history` |
| `simulation_configs` | `lb_simulation_configs_history` |
| `simulation_runs` | `lb_simulation_runs_history` |
| `support_cases` | `lb_support_cases_history` |
| `support_messages` | `lb_support_messages_history` |
| `users` | `lb_users_history` |
| `verifications` | `lb_verifications_history` |

Each history table includes CDC metadata columns: `_change_type`, `_lsn`, `_commit_timestamp`.
