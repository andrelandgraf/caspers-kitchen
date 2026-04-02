import { Pool, type PoolConfig } from "pg";
import assert from "@/lib/common/assert";
import { lakebaseConfig } from "./config";
import { type AuthStrategy, getLakebaseToken } from "./credentials";

type SslMode = "require" | "prefer" | "disable";

function mapSslConfig(sslMode: SslMode): PoolConfig["ssl"] {
  switch (sslMode) {
    case "require":
      return { rejectUnauthorized: true };
    case "prefer":
      return { rejectUnauthorized: false };
    case "disable":
      return false;
  }
}

function normalizeHost(host: string): string {
  if (host.startsWith("https://") || host.startsWith("http://")) {
    return host.replace(/\/$/, "");
  }
  return `https://${host}`.replace(/\/$/, "");
}

function resolveAuth(
  databricksHost: string,
  databricksToken: string | undefined,
  clientId: string | undefined,
  clientSecret: string | undefined,
): AuthStrategy {
  if (databricksToken) {
    return { kind: "token", token: databricksToken };
  }
  assert(
    clientId,
    "Either DATABRICKS_TOKEN or DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET must be set",
  );
  assert(
    clientSecret,
    "DATABRICKS_CLIENT_SECRET is required when using DATABRICKS_CLIENT_ID",
  );
  return {
    kind: "m2m",
    host: normalizeHost(databricksHost),
    clientId,
    clientSecret,
  };
}

/**
 * Creates a pg.Pool connected to Databricks Lakebase with automatic
 * OAuth token refresh. The pool's password callback fetches and
 * caches tokens from the Databricks credential API.
 */
export function createLakebasePool(): Pool {
  const cfg = lakebaseConfig.server;

  const rawHost = cfg.databricksHost;
  assert(rawHost, "DATABRICKS_HOST environment variable is required");

  const pgHost = cfg.pgHost;
  assert(pgHost, "PGHOST environment variable is required");

  const pgDatabase = cfg.pgDatabase;
  assert(pgDatabase, "PGDATABASE environment variable is required");

  const endpoint = cfg.endpoint;
  assert(endpoint, "LAKEBASE_ENDPOINT environment variable is required");

  const auth = resolveAuth(
    rawHost,
    cfg.databricksToken,
    cfg.clientId,
    cfg.clientSecret,
  );
  const databricksHost = normalizeHost(rawHost);

  const pgUser = cfg.pgUser ?? (cfg.clientId || undefined);
  assert(
    pgUser,
    "PGUSER environment variable is required (or DATABRICKS_CLIENT_ID for M2M)",
  );

  const pgPort = cfg.pgPort ?? 5432;
  const pgSslMode = cfg.pgSslMode ?? "require";

  const pool = new Pool({
    host: pgHost,
    port: pgPort,
    user: pgUser,
    database: pgDatabase,
    password: () => getLakebaseToken(databricksHost, auth, endpoint),
    ssl: mapSslConfig(pgSslMode),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on("error", (error) => {
    console.error("Lakebase pool error:", error.message);
  });

  return pool;
}
