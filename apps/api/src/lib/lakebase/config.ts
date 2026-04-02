import { z } from "zod";
import { configSchema, server } from "better-env/config-schema";

const sslModeSchema = z
  .enum(["require", "prefer", "disable"])
  .default("require");

/**
 * Lakebase env vars are all optional at the schema level because
 * lakebase is only used when PGHOST is set. Required-field validation
 * happens at runtime in pool.ts with descriptive assert messages.
 */
export const lakebaseConfig = configSchema("Lakebase", {
  databricksHost: server({ env: "DATABRICKS_HOST", optional: true }),
  databricksToken: server({ env: "DATABRICKS_TOKEN", optional: true }),
  clientId: server({ env: "DATABRICKS_CLIENT_ID", optional: true }),
  clientSecret: server({ env: "DATABRICKS_CLIENT_SECRET", optional: true }),
  pgUser: server({ env: "PGUSER", optional: true }),
  endpoint: server({ env: "LAKEBASE_ENDPOINT", optional: true }),
  pgHost: server({ env: "PGHOST", optional: true }),
  pgDatabase: server({ env: "PGDATABASE", optional: true }),
  pgPort: server({
    env: "PGPORT",
    schema: z.coerce.number().default(5432),
    optional: true,
  }),
  pgSslMode: server({
    env: "PGSSLMODE",
    schema: sslModeSchema,
    optional: true,
  }),
});
