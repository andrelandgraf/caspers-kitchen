# Support Console (Databricks App)

Internal admin console for reviewing AI-generated support responses and managing support cases.

## Prerequisites

- Medallion pipeline deployed and gold tables populated (see [create-medallion-pipelines.md](./create-medallion-pipelines.md))
- Support agent pipeline deployed (see [create-support-agent-pipeline.md](./create-support-agent-pipeline.md))
- Lakebase project `caspers-prod-db` with Lakehouse Sync active (see [create-sync-from-lakebase-to-lakehouse.md](./create-sync-from-lakebase-to-lakehouse.md))
- Databricks CLI >= v0.294.0, authenticated

## Architecture

```
Gold Tables (Unity Catalog)
  │
  │ Reverse ETL (synced tables)
  ▼
Lakebase Postgres
  ├── gold.support_agent_responses_sync (CONTINUOUS)
  ├── gold.support_case_context_sync    (SNAPSHOT)
  ├── gold.user_support_profile_sync    (SNAPSHOT)
  ├── gold.support_overview_sync        (SNAPSHOT)
  ├── public.support_messages           (original OLTP, via Lakehouse Sync)
  └── support_console.admin_decisions   (app-owned, writable)
        │
        ▼
  AppKit App (Express + React)
  ├── Lakebase plugin: CRUD routes for cases, messages, agent responses, admin decisions
  └── Analytics plugin: SQL warehouse queries for dashboards
```

## Phase 1: Reverse ETL (Synced Tables)

### Enable CDF on agent responses

```sql
ALTER TABLE `caspers-kitchen-prod`.`gold`.`support_agent_responses`
SET TBLPROPERTIES (delta.enableChangeDataFeed = true);
```

### Create synced tables (UI only)

Synced table creation for Autoscaling projects requires the Databricks UI (CLI not yet supported):

1. Open **Catalog** in the workspace
2. Navigate to `caspers-kitchen-prod` > `gold` > select source table
3. Click **Create synced table**
4. Target: `caspers-prod-db`, branch `production`

| Source Table | Synced Table (UC) | Postgres Name | Primary Key | Sync Mode |
|---|---|---|---|---|
| `gold.support_agent_responses` | `gold.support_agent_responses_sync` | `gold.support_agent_responses_sync` | `case_id` | CONTINUOUS |
| `gold.support_case_context` | `gold.support_case_context_sync` | `gold.support_case_context_sync` | `case_id` | SNAPSHOT |
| `gold.user_support_profile` | `gold.user_support_profile_sync` | `gold.user_support_profile_sync` | `user_id` | SNAPSHOT |
| `gold.support_overview` | `gold.support_overview_sync` | `gold.support_overview_sync` | `case_date` | SNAPSHOT |

Continuous sync requires CDF on the source table. Materialized Views don't support CDF, so they use Snapshot mode.

### Verify in Postgres

```bash
TOKEN=$(databricks auth token --profile <PROFILE> | jq -r '.access_token')
PGPASSWORD="$TOKEN" psql \
  -h <PGHOST> -U <your-email>@databricks.com -d databricks_postgres \
  -c "SELECT COUNT(*) FROM gold.support_agent_responses_sync;"
```

## Phase 2: AppKit App

Location in repo: `apps/support-console/`

### Scaffold (already done)

```bash
cd apps
databricks apps init \
  --name support-console \
  --version latest \
  --features analytics,lakebase \
  --set "analytics.sql-warehouse.id=<WAREHOUSE_ID>" \
  --set "lakebase.postgres.branch=projects/caspers-prod-db/branches/production" \
  --set "lakebase.postgres.database=projects/caspers-prod-db/branches/production/databases/<DB_ID>" \
  --set "lakebase.postgres.databaseName=databricks_postgres" \
  --set "lakebase.postgres.endpointPath=projects/caspers-prod-db/branches/production/endpoints/primary" \
  --set "lakebase.postgres.host=<PGHOST>" \
  --set "lakebase.postgres.port=5432" \
  --set "lakebase.postgres.sslmode=require" \
  --run none --profile <PROFILE>
```

### Grant catalog access to app service principal

The app's service principal needs read access to the gold catalog for SQL warehouse queries:

```sql
GRANT USE CATALOG ON CATALOG `caspers-kitchen-prod` TO `<service-principal-client-id>`;
GRANT USE SCHEMA ON SCHEMA `caspers-kitchen-prod`.gold TO `<service-principal-client-id>`;
GRANT SELECT ON SCHEMA `caspers-kitchen-prod`.gold TO `<service-principal-client-id>`;
```

Find the SP client ID: `databricks apps get support-console --profile <PROFILE> -o json | jq -r '.service_principal_client_id'`

### Deploy

```bash
cd apps/support-console
databricks apps validate --profile <PROFILE>
databricks apps deploy --profile <PROFILE>
```

### Verify

```bash
databricks apps list --profile <PROFILE>
databricks apps logs support-console --profile <PROFILE>
```

App URL: `https://support-console-<WORKSPACE_ID>.aws.databricksapps.com`

## App Pages

### Cases (home)

List of all support cases sorted by newest first, split into "Needs attention" (open/in_progress) and "Resolved" sections. Each row shows subject, customer name, status, message count, and the AI agent's recommended action.

### Case Detail (`/cases/:id`)

Two-column layout:
- **Left**: Full message thread + customer profile (lifetime spend, order history, case history)
- **Right**: AI agent summary, recommendation, and an editable form where admins can approve/edit/submit the response

Admin decisions are written to `support_console.admin_decisions` in Lakebase.

### Analytics (`/analytics`)

Support metrics dashboard using SQL warehouse queries:
- KPI cards: total cases, avg response time, refund cases, avg messages
- Agent action distribution chart
- Average suggested amount by action

## Troubleshooting

### INSUFFICIENT_PERMISSIONS on catalog

The app's service principal needs `USE CATALOG`, `USE SCHEMA`, and `SELECT` grants. See the grant commands above.

### Schema ownership for admin_decisions

The app creates `support_console.admin_decisions` on first startup. The service principal must own the schema. Deploy the app first (it creates the schema), then grant yourself access for local dev:

```bash
databricks psql --project caspers-prod-db --profile <PROFILE> -- -c "
  GRANT databricks_superuser TO \"<your-email>\";
"
```

### Synced table not found in Postgres

If the `gold.*_sync` tables don't appear, check the sync pipeline in the Databricks UI: **Catalog** > select the synced table > **Overview** tab > check pipeline status.

### Workspace monorepo npm install

The root `package.json` has `"workspaces": ["apps/*"]`. Install from the root:

```bash
npm install -w apps/support-console
```
