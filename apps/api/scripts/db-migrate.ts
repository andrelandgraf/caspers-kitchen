import { loadEnvConfig } from "@next/env";

// Load Next.js environment variables before accessing process.env
loadEnvConfig(process.cwd());

import { execSync } from "node:child_process";

/**
 * Fetches a short-lived Lakebase credential and returns a full connection URL.
 * Drizzle-kit needs a plain DATABASE_URL — it can't use pg's password callback —
 * so we build the URL here and pass it via env to the subprocess.
 */
async function buildLakebaseUrl(): Promise<string> {
  const host = process.env.PGHOST;
  const port = process.env.PGPORT ?? "5432";
  const user = process.env.PGUSER;
  const database = process.env.PGDATABASE;
  const databricksHost = process.env.DATABRICKS_HOST?.replace(/\/$/, "");
  const token = process.env.DATABRICKS_TOKEN;
  const endpoint = process.env.LAKEBASE_ENDPOINT;

  if (!host || !user || !database || !databricksHost || !token || !endpoint) {
    throw new Error(
      "Lakebase migration requires: PGHOST, PGUSER, PGDATABASE, DATABRICKS_HOST, DATABRICKS_TOKEN, LAKEBASE_ENDPOINT",
    );
  }

  // Exchange the workspace access token for a short-lived Postgres credential
  const resp = await fetch(`${databricksHost}/api/2.0/postgres/credentials`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ endpoint }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Lakebase credential fetch failed (${resp.status}): ${text}`,
    );
  }

  // Validate the response shape
  const data: unknown = await resp.json();
  if (
    typeof data !== "object" ||
    data === null ||
    !("token" in data) ||
    typeof data.token !== "string"
  ) {
    throw new Error("Invalid credential response from Lakebase API");
  }

  const password = encodeURIComponent(data.token);
  const encodedUser = encodeURIComponent(user);
  return `postgresql://${encodedUser}:${password}@${host}:${port}/${database}?sslmode=require`;
}

async function main() {
  // When PGHOST is set (Lakebase), build a credential URL for drizzle-kit
  if (process.env.PGHOST && !process.env.DATABASE_URL) {
    console.log("Lakebase detected — fetching credential for drizzle-kit…");
    process.env.DATABASE_URL = await buildLakebaseUrl();
    console.log("Credential acquired, running migration…");
  }

  // Run drizzle-kit migrate (reads DATABASE_URL from drizzle.config.ts)
  execSync("npx drizzle-kit migrate", {
    stdio: "inherit",
    env: { ...process.env },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
