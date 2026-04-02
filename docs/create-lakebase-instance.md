# Create Lakebase Instance

Lakebase Autoscaling project for Casper's Kitchen production database.

## Steps

### 1. Create the project

```bash
databricks postgres create-project caspers-prod-db \
  --json '{"spec": {"display_name": "Caspers Kitchen Prod"}}' \
  --profile <PROFILE>
```

This auto-provisions a `production` branch and a `primary` read-write endpoint (1 CU min/max, scale-to-zero enabled).

### 2. Verify the resources

```bash
databricks postgres list-branches projects/caspers-prod-db --profile <PROFILE>
databricks postgres list-endpoints projects/caspers-prod-db/branches/production --profile <PROFILE>
databricks postgres list-databases projects/caspers-prod-db/branches/production --profile <PROFILE>
```

### 3. Get connection details

```bash
databricks postgres get-endpoint \
  projects/caspers-prod-db/branches/production/endpoints/primary \
  --profile <PROFILE>
```

The `hosts.host` field in the response is the Postgres connection hostname. Use this as `PGHOST` in `.env.development` and `.env.production`.

### 4. Connect with psql

```bash
TOKEN=$(databricks auth token --profile <PROFILE> | jq -r '.access_token')
PGPASSWORD="$TOKEN" psql \
  -h <PGHOST> \
  -U <your-email>@databricks.com \
  -d databricks_postgres
```

### 5. Run schema migrations

```bash
cd apps/api
bun run lakebase:token   # refresh DATABRICKS_TOKEN in .env.development
bun run db:migrate       # apply Drizzle migrations
```

### 6. Seed and simulate

```bash
bun run dev
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/seed
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/simulate
```

## Notes

- The endpoint scales to zero when idle and resumes in seconds on next connection.
- The app authenticates via M2M OAuth (service principal) in production, and personal access token in development.
- Schema migrations are managed via Drizzle ORM in `apps/api`.
- The token refresh script (`bun run lakebase:token`) reads `DATABRICKS_CONFIG_PROFILE` (defaults to `DEFAULT`).
