import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { execSync } from "child_process";

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

  const data = (await resp.json()) as { token: string };
  const password = encodeURIComponent(data.token);
  const encodedUser = encodeURIComponent(user);

  return `postgresql://${encodedUser}:${password}@${host}:${port}/${database}?sslmode=require`;
}

async function main() {
  if (process.env.PGHOST && !process.env.DATABASE_URL) {
    console.log("Lakebase detected — fetching credential for drizzle-kit…");
    process.env.DATABASE_URL = await buildLakebaseUrl();
    console.log("Credential acquired, running migration…");
  }

  execSync("npx drizzle-kit migrate", {
    stdio: "inherit",
    env: { ...process.env },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
