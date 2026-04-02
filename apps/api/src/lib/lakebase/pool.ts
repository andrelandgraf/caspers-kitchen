import { Pool, type PoolConfig } from "pg";
import assert from "@/lib/common/assert";
import { type AuthStrategy, getLakebaseToken } from "./credentials";

type SslMode = "require" | "prefer" | "disable";

const VALID_SSL_MODES: readonly SslMode[] = ["require", "prefer", "disable"];

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

function parseSslMode(value: string | undefined): SslMode {
  if (!value) return "require";
  assert(
    (VALID_SSL_MODES as readonly string[]).includes(value),
    `Invalid PGSSLMODE "${value}", expected one of: ${VALID_SSL_MODES.join(", ")}`,
  );
  return value as SslMode;
}

function normalizeHost(host: string): string {
  if (host.startsWith("https://") || host.startsWith("http://")) {
    return host.replace(/\/$/, "");
  }
  return `https://${host}`.replace(/\/$/, "");
}

interface LakebaseConfig {
  databricksHost: string;
  auth: AuthStrategy;
  pgUser: string;
  endpoint: string;
  pgHost: string;
  pgDatabase: string;
  pgPort: number;
  sslMode: SslMode;
}

/**
 * Resolves auth strategy and connection config from env vars.
 *
 * Auth (pick one):
 *   DATABRICKS_TOKEN                         -- direct Bearer token (local dev / PAT)
 *   DATABRICKS_CLIENT_ID + CLIENT_SECRET     -- M2M OAuth (Vercel production)
 *
 * Postgres user:
 *   PGUSER                                   -- explicit (required for token auth)
 *   Falls back to DATABRICKS_CLIENT_ID       -- automatic for M2M
 */
function loadConfig(): LakebaseConfig {
  const rawHost = process.env.DATABRICKS_HOST;
  assert(rawHost, "DATABRICKS_HOST environment variable is required");

  const directToken = process.env.DATABRICKS_TOKEN;
  const clientId = process.env.DATABRICKS_CLIENT_ID;
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;

  let auth: AuthStrategy;
  if (directToken) {
    auth = { kind: "token", token: directToken };
  } else {
    assert(
      clientId,
      "Either DATABRICKS_TOKEN or DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET must be set",
    );
    assert(
      clientSecret,
      "DATABRICKS_CLIENT_SECRET is required when using DATABRICKS_CLIENT_ID",
    );
    auth = {
      kind: "m2m",
      host: normalizeHost(rawHost),
      clientId,
      clientSecret,
    };
  }

  const pgUser = process.env.PGUSER ?? (clientId || undefined);
  assert(
    pgUser,
    "PGUSER environment variable is required (or DATABRICKS_CLIENT_ID for M2M)",
  );

  const endpoint = process.env.LAKEBASE_ENDPOINT;
  assert(endpoint, "LAKEBASE_ENDPOINT environment variable is required");

  const pgHost = process.env.PGHOST;
  assert(pgHost, "PGHOST environment variable is required");

  const pgDatabase = process.env.PGDATABASE;
  assert(pgDatabase, "PGDATABASE environment variable is required");

  const portStr = process.env.PGPORT;
  const pgPort = portStr ? Number.parseInt(portStr, 10) : 5432;
  assert(!Number.isNaN(pgPort), `Invalid PGPORT: ${portStr}`);

  const sslMode = parseSslMode(process.env.PGSSLMODE);

  return {
    databricksHost: normalizeHost(rawHost),
    auth,
    pgUser,
    endpoint,
    pgHost,
    pgDatabase,
    pgPort,
    sslMode,
  };
}

/**
 * Creates a pg.Pool connected to Databricks Lakebase with automatic
 * OAuth token refresh. The pool's password callback fetches and
 * caches tokens from the Databricks credential API.
 *
 * Auth modes (set one):
 *   DATABRICKS_TOKEN                           -- PAT or CLI token (local dev)
 *   DATABRICKS_CLIENT_ID + CLIENT_SECRET       -- M2M OAuth (production)
 *
 * Always required: DATABRICKS_HOST, LAKEBASE_ENDPOINT, PGHOST, PGDATABASE.
 * Also required: PGUSER (or auto-resolved from DATABRICKS_CLIENT_ID for M2M).
 * Optional: PGPORT (default 5432), PGSSLMODE (default "require").
 */
export function createLakebasePool(): Pool {
  const config = loadConfig();

  const pool = new Pool({
    host: config.pgHost,
    port: config.pgPort,
    user: config.pgUser,
    database: config.pgDatabase,
    password: () =>
      getLakebaseToken(config.databricksHost, config.auth, config.endpoint),
    ssl: mapSslConfig(config.sslMode),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on("error", (error) => {
    console.error("Lakebase pool error:", error.message);
  });

  return pool;
}
