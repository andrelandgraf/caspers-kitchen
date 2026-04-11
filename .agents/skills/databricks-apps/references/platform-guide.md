# Databricks Apps Platform Guide

Universal platform rules that apply to ALL Databricks Apps regardless of framework (AppKit, Streamlit, FastAPI, etc.).

For non-AppKit framework-specific setup (port config, app.yaml, Streamlit gotchas), see [Other Frameworks](other-frameworks.md).

## Service Principal Permissions

**The #1 cause of runtime crashes after deployment.**

When your app uses a Databricks resource (SQL warehouse, model serving endpoint, vector search index, volume, secret scope), the app's **service principal** must have explicit permissions on that resource.

### How Permissions Work

When you declare a resource in `app.yaml` / `databricks.yml` with a `permission` field, the platform **automatically grants** that permission to the app's SP on deployment. You do NOT need to run manual `set-permissions` commands for declared resources.

```yaml
# databricks.yml — declaring resources with permissions
resources:
  apps:
    my_app:
      resources:
        - name: my-warehouse
          sql_warehouse:
            id: ${var.warehouse_id}
            permission: CAN_USE          # auto-granted to SP on deploy
        - name: my-endpoint
          serving_endpoint:
            name: ${var.endpoint_name}
            permission: CAN_QUERY        # auto-granted to SP on deploy
```

### Default Permissions by Resource Type

| Resource Type | Default Permission | Notes |
|---------------|-------------------|-------|
| SQL Warehouse | CAN_USE | Minimum for query execution |
| Model Serving Endpoint | CAN_QUERY | For inference calls |
| Vector Search Index (UC) | SELECT | UC securable of type TABLE |
| Volume (UC) | READ_VOLUME | Via UC securable |
| Secret Scope | READ | Deploying user needs MANAGE on the scope |
| Job | CAN_MANAGE_RUN | |
| Lakebase Database | CAN_CONNECT_AND_CREATE | |
| Genie Space | CAN_VIEW | |

### ⚠️ CRITICAL AGENT BEHAVIOR

Always declare resources in `databricks.yml` with the correct `permission` field — do NOT skip this. The platform handles granting automatically on deploy.

## Resource Types & Injection

**NEVER hardcode workspace-specific IDs in source code.** Always inject via environment variables with `valueFrom`.

| Resource Type | Default Key | Use Case |
|---------------|-------------|----------|
| SQL Warehouse | `sql-warehouse` | Query compute |
| Model Serving Endpoint | `serving-endpoint` | Model inference |
| Vector Search Index | `vector-search-index` | Semantic search |
| Lakebase Database | `database` | OLTP storage |
| Secret | `secret` | Sensitive values |
| UC Table | `table` | Structured data |
| UC Connection | `connection` | External data sources |
| Genie Space | `genie-space` | AI analytics |
| MLflow Experiment | `experiment` | ML tracking |
| Lakeflow Job | `job` | Data workflows |
| UDF | `function` | SQL/Python functions |
| Databricks App | `app` | App-to-app communication |

```python
# ✅ GOOD
warehouse_id = os.environ["DATABRICKS_WAREHOUSE_ID"]
```

```yaml
# app.yaml / databricks.yml env section
env:
  - name: DATABRICKS_WAREHOUSE_ID
    valueFrom: sql-warehouse
  - name: SERVING_ENDPOINT
    valueFrom: serving-endpoint
```

## Authentication: OBO vs Service Principal

| Context | When Used | Token Source | Cached Per |
|---------|-----------|--------------|------------|
| **Service Principal (SP)** | Default; background tasks, shared data | Auto-injected `DATABRICKS_CLIENT_ID` + `DATABRICKS_CLIENT_SECRET` | All users (shared) |
| **On-Behalf-Of (OBO)** | User-specific data, user-scoped access | `x-forwarded-access-token` header | Per user |

**SP auth** is auto-configured — `WorkspaceClient()` picks up injected env vars.

**OBO** requires extracting the token from request headers and declaring scopes:

| Scope | Purpose |
|-------|---------|
| `sql` | Query SQL warehouses |
| `dashboards.genie` | Manage Genie spaces |
| `files.files` | Manage files/directories |
| `iam.access-control:read` | Read permissions (default) |
| `iam.current-user:read` | Read current user info (default) |

⚠️ Databricks blocks access outside approved scopes even if the user has permission.

## Deployment Workflow

⚠️ **USER CONSENT REQUIRED** — always confirm with the user before deploying.

```bash
# Option A: single command (recommended) — validates, deploys, and runs
databricks apps deploy -t <TARGET> --profile <PROFILE>

# Option B: step by step
databricks apps validate --profile <PROFILE>
databricks bundle deploy -t <TARGET> --profile <PROFILE>
databricks bundle run <APP_RESOURCE_NAME> -t <TARGET> --profile <PROFILE>
```

❌ **Common mistake:** Running only `bundle deploy` and expecting the app to update. Deploy uploads code but does NOT apply config changes or restart the app. Use `databricks apps deploy` or add `bundle run` after `bundle deploy`.

### Deploy Lock

If a previous deploy was interrupted, you may see:
```
Failed to acquire deployment lock: deploy lock force acquired by <user>
```
Fix by running `databricks bundle deploy -t <TARGET> --profile <PROFILE> --force-lock` once to clear it, then retry `databricks apps deploy`.

### Stale Workspace Files (list files timed out)

Bundle sync is **incremental** — it uploads new/changed files but does **not** delete files that were previously uploaded and later added to `.gitignore`. If a prior deployment uploaded `node_modules/`, `dist/`, or other large directories, those stale files persist in the workspace and can cause the platform to timeout when listing files:
```
error listing files: list files timed out after 1m0s
```

**Fix:** Delete the stale directory from the workspace, then redeploy:
```bash
databricks workspace delete \
  /Workspace/Users/<USER>/.bundle/<APP>/default/files/node_modules \
  --recursive --profile <PROFILE>
```

**Prevention:** Ensure `.gitignore` includes `node_modules/`, `dist/`, `build/`, `.env`, `.databricks/` from the start — before the first `bundle deploy`.

### ⚠️ Destructive Updates Warning

`databricks apps update --json` performs a **full replacement**, not a merge. If you pass a partial JSON payload, any omitted fields are **removed** from the app:
- Passing only `user_api_scopes` wipes all `resources` (and vice versa)
- Removing a postgres resource revokes the SP's Postgres role, destroying all SQL GRANTs
- Re-adding a resource does NOT restore manually-applied grants — they must be re-applied via SQL

**Best practice:** Manage `user_api_scopes` and `resources` together in `databricks.yml` and deploy with `bundle deploy` + `bundle run`. The bundle handles full replacement correctly because it always sends the complete config. Avoid `databricks apps update --json` unless you include ALL fields.

### OBO Scope Changes Require User Re-Authentication

When you add a new `user_api_scopes` entry (e.g. `dashboards.genie`), existing user sessions still hold OAuth tokens issued **before** the scope was added. These tokens will fail with `does not have required scopes`.

Users must **re-authenticate** to get a fresh token with the new scope:
- Open the app in an incognito/private browser window, OR
- Clear cookies for `*.databricksapps.com` and reload

This is a one-time action per user after a scope change.

## Runtime Environment

| Constraint | Value |
|------------|-------|
| Max file size | 10 MB per file |
| Available port | Only `DATABRICKS_APP_PORT` |
| Auto-injected env vars | `DATABRICKS_HOST`, `DATABRICKS_APP_PORT`, `DATABRICKS_APP_NAME`, `DATABRICKS_WORKSPACE_ID`, `DATABRICKS_CLIENT_ID`, `DATABRICKS_CLIENT_SECRET` |
| No root access | Cannot use `apt-get`, `yum`, or `apk` — use PyPI/npm packages only |
| Graceful shutdown | SIGTERM → 15 seconds to shut down → SIGKILL |
| Logging | Only stdout/stderr are captured — file-based logs are lost on container recycle |
| Filesystem | Ephemeral — no persistent local storage; use UC Volumes/tables |

## Compute & Limits

| Size | RAM | vCPU | DBU/hour | Notes |
|------|-----|------|----------|-------|
| Medium | 6 GB | Up to 2 | 0.5 | Default |
| Large | 12 GB | Up to 4 | 1.0 | Select during app creation or edit |

- No GPU access. Use model serving endpoints for inference.
- Apps must start within **10 minutes** (including dependency installation).
- Max apps per workspace: **100**.

## HTTP Proxy & Streaming

The Databricks Apps reverse proxy enforces a **120-second per-request timeout** (NOT configurable).

| Behavior | Detail |
|----------|--------|
| 504 in app logs? | **No** — the error is generated at the proxy. App logs show nothing. |
| SSE streaming | Responses may be **buffered** and delivered in chunks, not token-by-token |
| WebSockets | Bypass the 120s limit — working but undocumented |

For long-running agent interactions, use **WebSockets** instead of SSE.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `PERMISSION_DENIED` after deploy | SP missing permissions | Grant SP access to all declared resources |
| App deploys but config doesn't change | Only ran `bundle deploy` | Also run `bundle run <app-name>` |
| `File is larger than 10485760 bytes` | Bundled dependencies | Use requirements.txt / package.json |
| `list files timed out after 1m0s` | Stale `node_modules/` or other large directories in workspace from a prior deploy | Delete stale dir from workspace: `databricks workspace delete .../node_modules --recursive` |
| `INSUFFICIENT_PERMISSIONS` during typegen build | SP lacks Unity Catalog grants | Grant `USE_CATALOG` and `USE_SCHEMA`+`SELECT` on referenced catalogs/schemas (see below) |
| `permission denied for schema appkit` | AppKit cache schema owned by a previous SP or human user | `DROP SCHEMA appkit CASCADE` so the new SP recreates it (cache is ephemeral) |
| `permission denied for schema X` (Lakebase) | SP lacks Postgres-level grants on pre-existing schemas | Connect as schema owner via psql and grant `USAGE`, `SELECT`/`ALL` to SP. See Lakebase skill |
| OBO scopes missing after deploy | Destructive `apps update` wiped them | Manage scopes in `databricks.yml` with `bundle deploy` |
| `does not have required scopes: genie` | User token issued before scope was added | User must re-authenticate (incognito or clear cookies) |
| `permission denied for schema X` after resource change | Removing/re-adding postgres resource revokes SP grants | Re-apply all SQL GRANTs to the SP |
| `${var.xxx}` appears literally in env | Variables not resolved in config | Use literal values, not bundle variables |
| 504 Gateway Timeout | Request exceeded 120s | Use WebSockets for long operations |

## Fresh Deployment Permissions Checklist

When an app is deleted and recreated (or the postgres resource is removed and re-added), the new SP has **zero grants**. Follow this checklist:

### 1. Unity Catalog Grants (for typegen and SQL warehouse queries)

The SP needs access to catalogs/schemas referenced in `config/queries/*.sql`:

```bash
# Find the SP's application ID (used as the UC principal)
databricks apps get <APP_NAME> --profile <PROFILE> -o json
# → .service_principal_client_id

# Grant catalog access
databricks grants update catalog <CATALOG> \
  --json '{"changes": [{"add": ["USE_CATALOG"], "principal": "<SP_CLIENT_ID>"}]}' \
  --profile <PROFILE>

# Grant schema access
databricks grants update schema <CATALOG>.<SCHEMA> \
  --json '{"changes": [{"add": ["USE_SCHEMA", "SELECT"], "principal": "<SP_CLIENT_ID>"}]}' \
  --profile <PROFILE>
```

### 2. Lakebase Postgres Grants (for tRPC/pool queries)

Connect to Lakebase as the schema owner and grant the SP access. See the `databricks-lakebase` skill for full details. Key steps:

```bash
# Generate credential and connect via psql
databricks postgres generate-database-credential \
  projects/<PROJECT>/branches/<BRANCH>/endpoints/<ENDPOINT> --profile <PROFILE>

PGPASSWORD=<token> psql "host=<HOST> dbname=<DB> sslmode=require user=<EMAIL>"
```

```sql
-- Drop stale appkit cache schema (SP will recreate it)
DROP SCHEMA IF EXISTS appkit CASCADE;

-- Grant access to each schema the app uses
GRANT USAGE ON SCHEMA <schema> TO "<SP_CLIENT_ID>";
GRANT SELECT ON ALL TABLES IN SCHEMA <schema> TO "<SP_CLIENT_ID>";

-- For app-managed schemas, also grant write
GRANT CREATE ON SCHEMA <schema> TO "<SP_CLIENT_ID>";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA <schema> TO "<SP_CLIENT_ID>";

-- Set default privileges for each owner role that creates tables
ALTER DEFAULT PRIVILEGES FOR ROLE "<OWNER>" IN SCHEMA <schema>
  GRANT SELECT ON TABLES TO "<SP_CLIENT_ID>";
```

Check table ownership with `SELECT tablename, tableowner FROM pg_tables WHERE schemaname = '<schema>';` — synced tables may be owned by a `databricks_writer_XXXXX` role rather than a human user. You need `ALTER DEFAULT PRIVILEGES` for **each distinct owner role**.
