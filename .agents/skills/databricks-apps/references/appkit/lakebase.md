# Lakebase: OLTP Database for Apps

Use Lakebase when your app needs **persistent read/write storage** — forms, CRUD operations, user-generated data. For analytics dashboards reading from a SQL warehouse, use `config/queries/` instead.

## When to Use Lakebase vs Analytics

| Pattern | Use Case | Data Source |
|---------|----------|-------------|
| Analytics | Read-only dashboards, charts, KPIs | Databricks SQL Warehouse |
| Lakebase | CRUD operations, persistent state, forms | PostgreSQL (Lakebase Autoscaling) |
| Both | Dashboard with user preferences/saved state | Warehouse + Lakebase |

## Scaffolding

**ALWAYS scaffold with the correct feature flags** — do not add Lakebase manually to an analytics-only scaffold.

**Lakebase only** (no analytics SQL warehouse):
```bash
databricks apps init --name <NAME> --features lakebase \
  --set "lakebase.postgres.branch=<BRANCH_NAME>" \
  --set "lakebase.postgres.database=<DATABASE_NAME>" \
  --run none --profile <PROFILE>
```

**Both Lakebase and analytics**:
```bash
databricks apps init --name <NAME> --features analytics,lakebase \
  --set "analytics.sql-warehouse.id=<WAREHOUSE_ID>" \
  --set "lakebase.postgres.branch=<BRANCH_NAME>" \
  --set "lakebase.postgres.database=<DATABASE_NAME>" \
  --run none --profile <PROFILE>
```

Where `<BRANCH_NAME>` and `<DATABASE_NAME>` are full resource names (e.g. `projects/<PROJECT_ID>/branches/<BRANCH_ID>` and `projects/<PROJECT_ID>/branches/<BRANCH_ID>/databases/<DB_ID>`).

Use the `databricks-lakebase` skill to create a Lakebase project and discover branch/database resource names before running this command.

**Get resource names** (if you have an existing project):
```bash
# List branches → use the name field of a READY branch
databricks postgres list-branches projects/<PROJECT_ID> --profile <PROFILE>
# List databases → use the name field
databricks postgres list-databases projects/<PROJECT_ID>/branches/<BRANCH_ID> --profile <PROFILE>
```

## Project Structure (after `databricks apps init --features lakebase`)

```
my-app/
├── server/
│   └── server.ts       # Backend with Lakebase pool + tRPC routes
├── client/
│   └── src/
│       └── App.tsx     # React frontend
├── app.yaml            # Manifest with database resource declaration
└── package.json        # Includes @databricks/lakebase dependency
```

Note: **No `config/queries/` directory** — Lakebase apps use server-side `pool.query()` calls, not SQL files.

## `createLakebasePool` API

```typescript
import { createLakebasePool } from "@databricks/lakebase";
// or: import { createLakebasePool } from "@databricks/appkit";

const pool = createLakebasePool({
  // All fields optional — auto-populated from env vars when deployed
  host: process.env.PGHOST,              // Lakebase hostname
  database: process.env.PGDATABASE,      // Database name
  endpoint: process.env.LAKEBASE_ENDPOINT, // Endpoint resource path
  user: process.env.PGUSER,             // Service principal client ID
  max: 10,                               // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
```

Call `createLakebasePool()` **once at module level** (server startup), not inside request handlers.

## Environment Variables (auto-set when deployed with database resource)

| Variable | Description |
|----------|-------------|
| `PGHOST` | Lakebase hostname |
| `PGPORT` | Port (default 5432) |
| `PGDATABASE` | Database name |
| `PGUSER` | Service principal client ID |
| `PGSSLMODE` | SSL mode (`require`) |
| `LAKEBASE_ENDPOINT` | Endpoint resource path |

## tRPC CRUD Pattern

Always use tRPC for Lakebase operations — do NOT call `pool.query()` from the client.

```typescript
// server/server.ts
import { initTRPC } from '@trpc/server';
import { createLakebasePool } from "@databricks/lakebase";
import { z } from 'zod';
import superjson from 'superjson'; // requires: npm install superjson

const pool = createLakebasePool(); // reads env vars automatically

const t = initTRPC.create({ transformer: superjson });
const publicProcedure = t.procedure;

export const appRouter = t.router({
  listItems: publicProcedure.query(async () => {
    const { rows } = await pool.query(
      "SELECT * FROM app_data.items ORDER BY created_at DESC LIMIT 100"
    );
    return rows;
  }),

  createItem: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { rows } = await pool.query(
        "INSERT INTO app_data.items (name) VALUES ($1) RETURNING *",
        [input.name]
      );
      return rows[0];
    }),

  deleteItem: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await pool.query("DELETE FROM app_data.items WHERE id = $1", [input.id]);
      return { success: true };
    }),
});
```

## Schema Initialization

**Prefer a custom schema** — the Service Principal has `CONNECT_AND_CREATE` permission and can create new schemas, but **cannot access pre-existing schemas** (including `public`) without explicit SQL GRANTs. If you need to use `public`, grant access to the SP (see Cross-Schema Access below). For new tables, create a custom schema at startup:

```typescript
// server/server.ts — run once at startup before handling requests
await pool.query(`
  CREATE SCHEMA IF NOT EXISTS app_data;
  CREATE TABLE IF NOT EXISTS app_data.items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`);
```

## ORM Integration (Optional)

The pool returned by `createLakebasePool()` is a standard `pg.Pool` — works with any PostgreSQL library:

```typescript
// Drizzle ORM
import { drizzle } from "drizzle-orm/node-postgres";
const db = drizzle(pool);

// Prisma (with @prisma/adapter-pg)
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

## Key Differences from Analytics Pattern

| | Analytics | Lakebase |
|--|-----------|---------|
| SQL dialect | Databricks SQL (Spark SQL) | Standard PostgreSQL |
| Query location | `config/queries/*.sql` files | `pool.query()` in tRPC routes |
| Data retrieval | `useAnalyticsQuery` hook | tRPC query procedure |
| Date functions | `CURRENT_TIMESTAMP()`, `DATEDIFF(DAY, ...)` | `NOW()`, `AGE(...)` |
| Auto-increment | N/A | `SERIAL` or `GENERATED ALWAYS AS IDENTITY` |
| Insert pattern | N/A | `INSERT ... VALUES ($1) RETURNING *` |
| Params | Named (`:param`) | Positional (`$1, $2, ...`) |

**NEVER use `useAnalyticsQuery` for Lakebase data** — it queries the SQL warehouse, not Lakebase.
**NEVER put Lakebase SQL in `config/queries/`** — those files are only for warehouse queries.

## Local Development

The Lakebase env vars (`PGHOST`, `PGDATABASE`, etc.) are auto-set only when deployed. For local development, get the connection details from your endpoint and set them manually:

```bash
# Get endpoint connection details
databricks postgres get-endpoint \
  projects/<PROJECT_ID>/branches/<BRANCH_ID>/endpoints/<ENDPOINT_ID> \
  --profile <PROFILE>
```

Then create `server/.env` with the values from the endpoint response:

```
PGHOST=<host from endpoint>
PGPORT=5432
PGDATABASE=<your database name>
PGUSER=<your service principal client ID>
PGSSLMODE=require
LAKEBASE_ENDPOINT=projects/<PROJECT_ID>/branches/<BRANCH_ID>/endpoints/<ENDPOINT_ID>
```

Load `server/.env` in your dev server (e.g. via `dotenv` or `node --env-file=server/.env`). Never commit `.env` files — add `server/.env` to `.gitignore`.

## Cross-Schema Access (Pre-Existing Schemas)

When your app queries schemas it did **not** create (e.g. `public`, `gold`, or schemas populated by pipelines/sync jobs), the SP needs explicit grants from the schema owner.

**The `CAN_CONNECT_AND_CREATE` permission only lets the SP create and access its own objects.** Pre-existing schemas/tables owned by other roles are invisible to the SP.

### Diagnosing the SP Role

```bash
# Get the SP Postgres role name (it's the client ID UUID)
databricks apps get <APP_NAME> --profile <PROFILE> -o json
# → .service_principal_client_id
```

### Granting Access

Connect as the schema owner (typically your email) and grant:

```sql
-- Read-only schema (synced data, analytics)
GRANT USAGE ON SCHEMA gold TO "<SP_CLIENT_ID>";
GRANT SELECT ON ALL TABLES IN SCHEMA gold TO "<SP_CLIENT_ID>";
ALTER DEFAULT PRIVILEGES FOR ROLE "<OWNER>" IN SCHEMA gold
  GRANT SELECT ON TABLES TO "<SP_CLIENT_ID>";

-- Read-write schema (public, app CRUD)
GRANT USAGE ON SCHEMA public TO "<SP_CLIENT_ID>";
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO "<SP_CLIENT_ID>";
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO "<SP_CLIENT_ID>";
ALTER DEFAULT PRIVILEGES FOR ROLE "<OWNER>" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO "<SP_CLIENT_ID>";

-- App-owned schema created by human (needs ownership handoff)
GRANT USAGE, CREATE ON SCHEMA app_data TO "<SP_CLIENT_ID>";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app_data TO "<SP_CLIENT_ID>";
```

**`ALTER DEFAULT PRIVILEGES` prevents recurring permission errors** when the owner creates new tables (e.g. pipeline sync adds new tables to `gold`).

### AppKit Cache Schema

AppKit creates an `appkit` schema for persistent caching. If a human previously created it, the SP cannot run migrations. Fix: `DROP SCHEMA appkit CASCADE` and redeploy — the SP recreates it as the owner. The cache is ephemeral and safe to drop.

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|---------|
| `permission denied for schema public` | SP lacks access to `public` | Create a custom schema, or grant USAGE to the SP (see above) |
| `permission denied for schema X` | SP lacks access to a pre-existing schema | Grant USAGE + table permissions to the SP (see above) |
| `must be owner of table X` | Object owned by a different role | `DROP` the object and let SP recreate, or `GRANT ALL` to SP |
| `connection refused` | Pool not connected or wrong env vars | Check `PGHOST`, `PGPORT`, `LAKEBASE_ENDPOINT` are set |
| `relation "X" does not exist` | Tables not initialized | Run `CREATE TABLE IF NOT EXISTS` at startup |
| App builds but pool fails at runtime | Env vars not set locally | Set vars in `server/.env` — see Local Development above |
