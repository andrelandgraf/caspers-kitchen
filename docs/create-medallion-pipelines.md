# Medallion Architecture Pipelines (Silver + Gold)

Transform raw CDC data from Lakehouse Sync into clean, analytics-ready tables using Lakeflow Declarative Pipelines.

## Prerequisites

- Lakebase instance with Lakehouse Sync active (see [create-lakebase-instance.md](./create-lakebase-instance.md))
- Unity Catalog `caspers-kitchen-prod` with external S3 storage root (see [create-unity-catalog-instance.md](./create-unity-catalog-instance.md))
- Bronze tables in `caspers-kitchen-prod.lakebase` (see [create-sync-from-lakebase-to-lakehouse.md](./create-sync-from-lakebase-to-lakehouse.md))
- Databricks CLI >= v0.292.0, authenticated (`databricks auth profiles`)

## Architecture

```
Lakebase (Postgres OLTP)
  │
  │  Lakehouse Sync (CDC)
  ▼
BRONZE: caspers-kitchen-prod.lakebase
  20 × lb_*_history tables (raw CDC with _change_type, _lsn, _xid, _timestamp)
  │
  │  Lakeflow Declarative Pipeline (SQL materialized views)
  ▼
SILVER: caspers-kitchen-prod.silver
  9 clean current-state tables (deduplicated, CDC columns removed)
  │
  │  Same pipeline
  ▼
GOLD: caspers-kitchen-prod.gold
  4 business aggregate / agent context tables
```

## Pipeline Bundle

Location in repo: `pipelines/caspers_kitchen_analytics/`

```
pipelines/caspers_kitchen_analytics/
├── databricks.yml                                 # Bundle config (targets: dev, prod)
├── AGENTS.md
├── resources/
│   ├── caspers_kitchen_analytics.pipeline.yml     # Pipeline definition (serverless)
│   └── caspers_kitchen_analytics_job.job.yml      # Daily trigger
└── src/
    ├── silver/                                    # CDC dedup → current state
    │   ├── users.sql
    │   ├── orders.sql
    │   ├── order_items.sql
    │   ├── menu_items.sql
    │   ├── support_cases.sql
    │   ├── support_messages.sql
    │   ├── refunds.sql
    │   ├── credits.sql
    │   └── admins.sql
    └── gold/                                      # Business aggregates
        ├── daily_revenue.sql
        ├── support_overview.sql
        ├── user_support_profile.sql
        └── support_case_context.sql
```

## Silver Tables (9)

Each silver table applies the same CDC dedup pattern: take the latest row per `id` by `_lsn`, exclude deleted rows, drop CDC metadata columns.

| Silver Table | Bronze Source | Description |
|---|---|---|
| `silver.users` | `lakebase.lb_users_history` | Customer accounts |
| `silver.orders` | `lakebase.lb_orders_history` | Orders with status and total |
| `silver.order_items` | `lakebase.lb_order_items_history` | Line items per order |
| `silver.menu_items` | `lakebase.lb_menu_items_history` | Product catalog |
| `silver.support_cases` | `lakebase.lb_support_cases_history` | Support tickets |
| `silver.support_messages` | `lakebase.lb_support_messages_history` | Messages within cases |
| `silver.refunds` | `lakebase.lb_refunds_history` | Refund records |
| `silver.credits` | `lakebase.lb_credits_history` | Credit records |
| `silver.admins` | `lakebase.lb_admins_history` | Support agents |

## Gold Tables (4)

### `gold.daily_revenue`

Daily revenue metrics. Joins orders, order items, menu items, refunds, credits.

| Column | Description |
|---|---|
| `order_date` | Date |
| `total_orders` | Orders placed |
| `gross_revenue_cents` | Sum of order totals |
| `total_refunds_cents` | Approved refunds for that day's orders |
| `total_credits_cents` | Credits issued that day |
| `net_revenue_cents` | Gross - refunds - credits |
| `avg_order_value_cents` | Gross / total orders |
| `items_sold` | Total quantity of items |
| `top_category` | Highest-revenue menu category |

### `gold.support_overview`

Daily support operations metrics.

| Column | Description |
|---|---|
| `case_date` | Date |
| `total_cases` | Cases opened |
| `open_cases` / `resolved_cases` | By status |
| `avg_messages_per_case` | Message volume |
| `avg_first_response_minutes` | Avg time to first admin reply |
| `cases_with_refund` / `cases_with_credit` | Cases that led to compensation |
| `total_refund_cents` / `total_credit_cents` | Compensation amounts |

### `gold.user_support_profile`

Per-user 360 view for the support agent. One row per user.

| Column | Description |
|---|---|
| `user_id`, `name`, `email`, `region` | User identity |
| `total_orders_90d`, `total_spend_90d_cents` | Recent activity |
| `lifetime_order_count`, `lifetime_spend_cents` | All-time value |
| `support_cases_90d`, `support_cases_lifetime` | Support frequency |
| `total_refunds_90d_cents`, `total_credits_90d_cents` | Recent compensation |
| `last_order_date`, `last_support_case_date` | Recency |

### `gold.support_case_context`

Per-case enriched view for the support agent. One row per case.

| Column | Description |
|---|---|
| `case_id`, `subject`, `status`, `case_created_at` | Case identity |
| `user_id`, `user_name`, `user_email`, `user_region` | Customer info |
| `message_count`, `first_message_at`, `last_message_at` | Conversation stats |
| `has_admin_reply` | Whether an admin has responded |
| `first_response_minutes` | Time to first admin reply |
| `linked_refund_cents`, `linked_credit_cents` | Compensation for this case |
| `user_lifetime_spend_cents`, `user_cases_90d` | Customer context |

## Deploy and Run

### Validate

```bash
cd pipelines/caspers_kitchen_analytics
databricks bundle validate --profile DEFAULT
```

### Deploy (dev)

```bash
databricks bundle deploy -t dev --profile DEFAULT
```

### Run

```bash
databricks bundle run caspers_kitchen_analytics -t dev --profile DEFAULT
```

### Deploy (prod)

```bash
databricks bundle deploy -t prod --profile DEFAULT
```

### Verify tables

```bash
databricks schemas list caspers-kitchen-prod --profile DEFAULT
databricks tables list caspers-kitchen-prod silver --profile DEFAULT
databricks tables list caspers-kitchen-prod gold --profile DEFAULT
```

## Follow-up: LLM-enriched Gold Tables

These are not yet implemented. They require a separate Python Databricks Job that calls an LLM and writes to `caspers-kitchen-prod.gold`:

- `gold.support_message_sentiment` -- per-message sentiment (positive/neutral/negative/frustrated)
- `gold.support_case_summary` -- per-case LLM-generated summary, classified intent, suggested resolution

## Adding New Tables

### New silver table

1. Create `src/silver/<table_name>.sql` following the CDC dedup pattern
2. Source from `caspers-kitchen-prod.lakebase.lb_<table_name>_history`
3. Deploy and run

### New gold table

1. Create `src/gold/<table_name>.sql` as a materialized view
2. Read from `caspers-kitchen-prod.silver.*` or other gold tables
3. Write to `caspers-kitchen-prod.gold.<table_name>`
4. Deploy and run
