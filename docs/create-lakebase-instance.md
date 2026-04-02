# Create Lakebase Instance

Lakebase Autoscaling project for Casper's Kitchen production database.

## Resources Created

| Resource | Value |
|----------|-------|
| Project | `caspers-prod-db` |
| Branch | `production` (auto-created, default) |
| Endpoint | `primary` (read-write, 1 CU) |
| Database | `databricks_postgres` |
| Host | `ep-misty-truth-d1ys8dfq.database.us-west-2.cloud.databricks.com` |
| Workspace | `https://dbc-df6b51a2-a992.cloud.databricks.com` |
| Region | AWS us-west-2 |

## Steps

### 1. Create the project

```bash
databricks postgres create-project caspers-prod-db \
  --json '{"spec": {"display_name": "Caspers Kitchen Prod"}}' \
  --profile DEFAULT
```

This auto-provisions a `production` branch and a `primary` read-write endpoint (1 CU min/max, scale-to-zero enabled).

### 2. Verify the resources

```bash
databricks postgres list-branches projects/caspers-prod-db --profile DEFAULT
databricks postgres list-endpoints projects/caspers-prod-db/branches/production --profile DEFAULT
databricks postgres list-databases projects/caspers-prod-db/branches/production --profile DEFAULT
```

### 3. Get connection details

```bash
databricks postgres get-endpoint \
  projects/caspers-prod-db/branches/production/endpoints/primary \
  --profile DEFAULT
```

The `hosts.host` field in the response is the Postgres connection hostname.

### 4. Connect with psql

```bash
TOKEN=$(databricks auth token --profile DEFAULT | jq -r '.access_token')
PGPASSWORD="$TOKEN" psql \
  -h ep-misty-truth-d1ys8dfq.database.us-west-2.cloud.databricks.com \
  -U you@databricks.com \
  -d databricks_postgres
```

## Notes

- The endpoint scales to zero when idle and resumes in seconds on next connection.
- The app authenticates via M2M OAuth (service principal) in production, and personal access token in development.
- Schema migrations are managed via Drizzle ORM in `apps/api`.
