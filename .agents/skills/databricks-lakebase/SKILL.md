---
name: databricks-lakebase
description: "Manage Lakebase Postgres Autoscaling projects, branches, and endpoints via Databricks CLI. Use when asked to create, configure, or manage Lakebase Postgres databases, projects, branches, computes, or endpoints."
compatibility: Requires databricks CLI (>= v0.294.0)
metadata:
  version: "0.1.0"
parent: databricks-core
---

# Lakebase Postgres Autoscaling

**FIRST**: Use the parent `databricks-core` skill for CLI basics, authentication, and profile selection.

Lakebase is Databricks' serverless Postgres-compatible database (similar to Neon). It provides fully managed OLTP storage with autoscaling, branching, and scale-to-zero.

Manage Lakebase Postgres projects, branches, endpoints, and databases via `databricks postgres` CLI commands.

## Resource Hierarchy

```
Project (top-level container)
  └── Branch (isolated database environment, copy-on-write)
        ├── Endpoint (read-write or read-only)
        ├── Database (standard Postgres DB)
        └── Role (Postgres role)
```

- **Project**: Top-level container. Creating one auto-provisions a `production` branch and a `primary` read-write endpoint.
- **Branch**: Isolated database environment sharing storage with parent (copy-on-write). States: `READY`, `ARCHIVED`.
- **Endpoint** (called **Compute** in the Lakebase UI): Compute resource powering a branch. Types: `ENDPOINT_TYPE_READ_WRITE`, `ENDPOINT_TYPE_READ_ONLY` (read replica).
- **Database**: Standard Postgres database within a branch. Default: `databricks_postgres`.
- **Role**: Postgres role within a branch. Manage roles via `databricks postgres create-role -h`.

### Resource Name Formats

| Resource | Format |
|----------|--------|
| Project | `projects/{project_id}` |
| Branch | `projects/{project_id}/branches/{branch_id}` |
| Endpoint | `projects/{project_id}/branches/{branch_id}/endpoints/{endpoint_id}` |
| Database | `projects/{project_id}/branches/{branch_id}/databases/{database_id}` |

All IDs: 1-63 characters, start with lowercase letter, lowercase letters/numbers/hyphens only (RFC 1123).

## CLI Discovery — ALWAYS Do This First

> **Note:** "Lakebase" is the product name; the CLI command group is `postgres`. All commands use `databricks postgres ...`.

**Do NOT guess command syntax.** Discover available commands and their usage dynamically:

```bash
# List all postgres subcommands
databricks postgres -h

# Get detailed usage for any subcommand (flags, args, JSON fields)
databricks postgres <subcommand> -h
```

Run `databricks postgres -h` before constructing any command. Run `databricks postgres <subcommand> -h` to discover exact flags, positional arguments, and JSON spec fields for that subcommand.

## Create a Project

> **Do NOT list projects before creating.**

```bash
databricks postgres create-project <PROJECT_ID> \
  --json '{"spec": {"display_name": "<DISPLAY_NAME>"}}' \
  --profile <PROFILE>
```

- Auto-creates: `production` branch + `primary` read-write endpoint (1 CU min/max, scale-to-zero)
- Long-running operation; the CLI waits for completion by default. Use `--no-wait` to return immediately.
- Run `databricks postgres create-project -h` for all available spec fields (e.g. `pg_version`).

After creation, verify the auto-provisioned resources:

```bash
databricks postgres list-branches projects/<PROJECT_ID> --profile <PROFILE>
databricks postgres list-endpoints projects/<PROJECT_ID>/branches/<BRANCH_ID> --profile <PROFILE>
databricks postgres list-databases projects/<PROJECT_ID>/branches/<BRANCH_ID> --profile <PROFILE>
```

## Autoscaling

Endpoints use **compute units (CU)** for autoscaling. Configure min/max CU via `create-endpoint` or `update-endpoint`. Run `databricks postgres create-endpoint -h` to see all spec fields.

Scale-to-zero is enabled by default. When idle, compute scales down to zero; it resumes in seconds on next connection.

## Branches

Branches are copy-on-write snapshots of an existing branch. Use them for **experimentation**: testing schema migrations, trying queries, or previewing data changes -- without affecting production.

```bash
databricks postgres create-branch projects/<PROJECT_ID> <BRANCH_ID> \
  --json '{
    "spec": {
      "source_branch": "projects/<PROJECT_ID>/branches/<SOURCE_BRANCH_ID>",
      "no_expiry": true
    }
  }' --profile <PROFILE>
```

Branches require an expiration policy: use `"no_expiry": true` for permanent branches.

When done experimenting, delete the branch. Protected branches must be unprotected first -- use `update-branch` to set `spec.is_protected` to `false`, then delete:

```bash
# Step 1 — unprotect
databricks postgres update-branch projects/<PROJECT_ID>/branches/<BRANCH_ID> \
  --json '{"spec": {"is_protected": false}}' --profile <PROFILE>

# Step 2 — delete (run -h to confirm positional arg format for your CLI version)
databricks postgres delete-branch projects/<PROJECT_ID>/branches/<BRANCH_ID> \
  --profile <PROFILE>
```

**Never delete the `production` branch** — it is the authoritative branch auto-provisioned at project creation.

## App Service Principal Permissions — CRITICAL

When a Databricks App connects to Lakebase with `CAN_CONNECT_AND_CREATE`, the app's **service principal (SP)** gets a Postgres role that can:
- **Connect** to the database
- **Create new schemas and tables** (which the SP will own)

The SP **cannot** access schemas or tables created by other roles (human users, pipelines, etc.) unless explicitly granted. This is the #1 cause of `permission denied for schema X` errors after deployment.

### ⚠️ Resource Removal Revokes All Grants

If the postgres resource is ever **removed** from the app (even temporarily — e.g. via a partial `databricks apps update --json` that omits `resources`, or a bundle deploy that drops the resource), the platform **revokes the SP's Postgres role entirely**. Re-adding the resource creates a fresh role, but **all manually-applied SQL GRANTs are lost** and must be re-applied.

This means:
- `databricks apps update --json` with incomplete payloads can silently wipe the postgres resource (it does full replacement, not merge)
- A `databricks.yml` change that temporarily removes a resource and redeploys will revoke grants
- Schema-level grants (`GRANT USAGE ON SCHEMA ...`) are **not** managed by the platform — they are SQL-level and must be restored manually after any role recreation

**Always include ALL resources when using `databricks apps update --json`.** Prefer `databricks.yml` + `bundle deploy` to manage resources declaratively.

### Discovering the SP Role Name

The SP's Postgres role name is its **client ID** (a UUID). Find it from the app:

```bash
databricks apps get <APP_NAME> --profile <PROFILE> -o json
# → .service_principal_client_id is the Postgres role name
```

### Granting Cross-Schema Access

When an app needs to read/write schemas it did not create (e.g. `public`, `gold`, or any schema populated by pipelines or human users), you must connect as the **schema owner** and grant access to the SP role.

**Step 1 — Generate credentials and connect as the owner:**

```bash
databricks postgres generate-database-credential \
  projects/<PROJECT_ID>/branches/<BRANCH_ID>/endpoints/<ENDPOINT_ID> \
  --profile <PROFILE>
```

Use the returned token as the password for `psql`:

```bash
PGPASSWORD=<token> psql "host=<ENDPOINT_HOST> dbname=<DB_NAME> sslmode=require user=<YOUR_EMAIL>"
```

**Step 2 — Check schema ownership** (different schemas may have different owners):

```sql
SELECT schema_name, schema_owner FROM information_schema.schemata;
```

Tables synced by pipelines are typically owned by a `databricks_writer_XXXXX` role, not by a human user. You must run `ALTER DEFAULT PRIVILEGES` for **each distinct owner role** to cover future tables.

**Step 3 — Grant permissions** (replace `<SP_CLIENT_ID>` with the UUID from step above):

```sql
-- Read-only access to a schema (e.g. gold, synced from lakehouse)
GRANT USAGE ON SCHEMA gold TO "<SP_CLIENT_ID>";
GRANT SELECT ON ALL TABLES IN SCHEMA gold TO "<SP_CLIENT_ID>";
ALTER DEFAULT PRIVILEGES FOR ROLE "<OWNER_ROLE>" IN SCHEMA gold
  GRANT SELECT ON TABLES TO "<SP_CLIENT_ID>";

-- Read-write access to a schema (e.g. public)
GRANT USAGE ON SCHEMA public TO "<SP_CLIENT_ID>";
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO "<SP_CLIENT_ID>";
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO "<SP_CLIENT_ID>";
ALTER DEFAULT PRIVILEGES FOR ROLE "<OWNER_ROLE>" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO "<SP_CLIENT_ID>";
ALTER DEFAULT PRIVILEGES FOR ROLE "<OWNER_ROLE>" IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO "<SP_CLIENT_ID>";

-- Full access to an app-managed schema (e.g. support_console)
GRANT USAGE, CREATE ON SCHEMA support_console TO "<SP_CLIENT_ID>";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA support_console TO "<SP_CLIENT_ID>";
GRANT USAGE ON ALL SEQUENCES IN SCHEMA support_console TO "<SP_CLIENT_ID>";
ALTER DEFAULT PRIVILEGES FOR ROLE "<OWNER_ROLE>" IN SCHEMA support_console
  GRANT ALL ON TABLES TO "<SP_CLIENT_ID>";
```

`<OWNER_ROLE>` is typically your email (the human user who created the schema), but for pipeline-synced schemas check the actual owner (e.g. `databricks_writer_XXXXX`). You need `ALTER DEFAULT PRIVILEGES` for each owner role that creates tables in that schema.

**Step 4 — `ALTER DEFAULT PRIVILEGES` is essential.** Without it, new tables created by pipelines or migrations (under the owner role) will not be visible to the SP. This prevents the permissions from breaking again when data is re-synced.

### Ownership vs Grants

- **Ownership transfer** (`ALTER ... OWNER TO`) requires `SET ROLE` privilege, which Lakebase may not grant between human and SP roles. Use `GRANT` instead.
- **AppKit cache**: AppKit creates an `appkit` schema at startup for persistent caching. If a human user previously created it, the SP gets `permission denied` or `must be owner`. Fix: `DROP SCHEMA appkit CASCADE` so the SP recreates it on next deploy (the cache is ephemeral and safe to drop).

## What's Next

### Build a Databricks App

After creating a Lakebase project, scaffold a Databricks App connected to it.

**Step 1 — Discover branch name** (use `.name` from a `READY` branch):

```bash
databricks postgres list-branches projects/<PROJECT_ID> --profile <PROFILE>
```

**Step 2 — Discover database name** (use `.name` from the desired database; `<BRANCH_ID>` is the branch ID, not the full resource name):

```bash
databricks postgres list-databases projects/<PROJECT_ID>/branches/<BRANCH_ID> --profile <PROFILE>
```

**Step 3 — Scaffold the app** with the `lakebase` feature:

```bash
databricks apps init --name <APP_NAME> \
  --features lakebase \
  --set "lakebase.postgres.branch=<BRANCH_NAME>" \
  --set "lakebase.postgres.database=<DATABASE_NAME>" \
  --run none --profile <PROFILE>
```

Where `<BRANCH_NAME>` is the full resource name (e.g. `projects/<PROJECT_ID>/branches/<BRANCH_ID>`) and `<DATABASE_NAME>` is the full resource name (e.g. `projects/<PROJECT_ID>/branches/<BRANCH_ID>/databases/<DB_ID>`).

For the full app development workflow, use the **`databricks-apps`** skill.

### Other Workflows

**Connect a Postgres client**
Get the connection string from the endpoint, then connect with psql, DBeaver, or any standard Postgres client.

```bash
databricks postgres get-endpoint projects/<PROJECT_ID>/branches/<BRANCH_ID>/endpoints/<ENDPOINT_ID> --profile <PROFILE>
```

**Manage roles and permissions**
Create Postgres roles and grant access to databases or schemas.

```bash
databricks postgres create-role -h   # discover role spec fields
```

**Add a read-only endpoint**
Create a read replica for analytics or reporting workloads to avoid contention on the primary read-write endpoint.

```bash
databricks postgres create-endpoint projects/<PROJECT_ID>/branches/<BRANCH_ID> <ENDPOINT_ID> \
  --json '{"spec": {"type": "ENDPOINT_TYPE_READ_ONLY"}}' --profile <PROFILE>
```

## Query Performance Diagnostics

Lakebase ships with `pg_stat_statements` enabled by default. Use these queries to identify slow queries, cache efficiency, and currently running operations.

### Connecting via psql

Generate a short-lived credential and connect:

```bash
databricks postgres generate-database-credential \
  projects/<PROJECT_ID>/branches/<BRANCH_ID>/endpoints/<ENDPOINT_ID> \
  --profile <PROFILE>
```

```bash
PGPASSWORD=<token> psql "host=<ENDPOINT_HOST> dbname=<DB_NAME> sslmode=require user=<YOUR_EMAIL>"
```

### Slow Queries (pg_stat_statements)

Top queries by mean execution time — the primary tool for finding performance bottlenecks:

```sql
SELECT
  LEFT(query, 120) AS query_preview,
  calls,
  ROUND(total_exec_time::numeric, 2) AS total_ms,
  ROUND(mean_exec_time::numeric, 2) AS mean_ms,
  ROUND(min_exec_time::numeric, 2) AS min_ms,
  ROUND(max_exec_time::numeric, 2) AS max_ms,
  rows,
  shared_blks_hit,
  shared_blks_read
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
  AND query NOT LIKE '%EXPLAIN%'
ORDER BY mean_exec_time DESC
LIMIT 20;
```

Focus on application queries — ignore system queries (replication slots, `pg_settings` scans, `pg_database_size`) which are Lakebase internals.

### Highest Total Time (cumulative impact)

Queries that consume the most total database time across all invocations:

```sql
SELECT
  LEFT(query, 120) AS query_preview,
  calls,
  ROUND(total_exec_time::numeric, 2) AS total_ms,
  ROUND(mean_exec_time::numeric, 2) AS mean_ms,
  rows
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY total_exec_time DESC
LIMIT 20;
```

A query with 2ms mean but 100K calls may matter more than one with 200ms mean and 4 calls.

### Cache Hit Ratio

Healthy databases serve >99% of reads from shared buffers. A low ratio means queries are hitting disk:

```sql
SELECT
  ROUND(
    100.0 * SUM(shared_blks_hit) /
    NULLIF(SUM(shared_blks_hit) + SUM(shared_blks_read), 0), 2
  ) AS cache_hit_pct
FROM pg_stat_statements;
```

### Currently Running Queries

Find long-running or stuck queries in real time:

```sql
SELECT
  pid,
  NOW() - query_start AS duration,
  state,
  LEFT(query, 120) AS query_preview
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;
```

### Explain a Specific Query

Get the execution plan for a slow query to understand sequential scans, missing indexes, or join strategy:

```sql
EXPLAIN (ANALYZE, VERBOSE, BUFFERS, FORMAT JSON) <your_query>;
```

Drop `ANALYZE` to get the plan without actually executing the query.

### Reset Statistics

After deploying a fix, reset stats to measure the improvement from a clean baseline:

```sql
SELECT pg_stat_statements_reset();
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| `cannot configure default credentials` | Use `--profile` flag or authenticate first |
| `PERMISSION_DENIED` | Check workspace permissions |
| `permission denied for schema X` | App SP lacks access to a pre-existing schema. See **App Service Principal Permissions** above |
| `permission denied for table X` (schema grants exist) | Table-level grants are separate from schema grants. Re-run `GRANT SELECT ON ALL TABLES IN SCHEMA ...` — the table may have been created after the original grant |
| `must be owner of table X` | Object was created by a different role. `DROP` and let the SP recreate, or `GRANT ALL` to the SP |
| Grants lost after `apps update` or resource change | Removing/re-adding a postgres resource revokes the SP role and all grants. Re-apply all SQL GRANTs. See **Resource Removal Revokes All Grants** above |
| Protected branch cannot be deleted | `update-branch` to set `spec.is_protected` to `false` first |
| Long-running operation timeout | Use `--no-wait` and poll with `get-operation` |
