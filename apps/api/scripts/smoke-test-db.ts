import { loadEnvConfig } from "@next/env";

// Load Next.js environment variables before accessing process.env
loadEnvConfig(process.cwd());

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

async function main() {
  let pool: Pool;

  // Connect via Lakebase (PGHOST) or plain Postgres (DATABASE_URL)
  if (process.env.PGHOST) {
    console.log("Mode: Lakebase");
    console.log(`  Host: ${process.env.PGHOST}`);
    console.log(`  Database: ${process.env.PGDATABASE}`);
    console.log(
      `  Auth: ${process.env.DATABRICKS_TOKEN ? "CLI token" : "M2M OAuth"}`,
    );
    const { createLakebasePool } = await import("../src/lib/lakebase/pool");
    pool = createLakebasePool();
  } else if (process.env.DATABASE_URL) {
    console.log("Mode: DATABASE_URL");
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  } else {
    throw new Error("Neither PGHOST nor DATABASE_URL is set");
  }

  const db = drizzle({ client: pool });

  try {
    // Verify basic connectivity
    console.log("\nConnecting...");
    const result = await db.execute(
      sql`SELECT version(), now() AS server_time`,
    );
    const row = result.rows[0];
    console.log(`  PG version: ${String(row?.version)}`);
    console.log(`  Server time: ${String(row?.server_time)}`);

    // List all user-created tables
    const tables = await db.execute(sql`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);
    console.log(`\nTables found: ${tables.rows.length}`);
    for (const t of tables.rows) {
      console.log(`  ${String(t.table_schema)}.${String(t.table_name)}`);
    }

    console.log("\nSmoke test passed.");
  } catch (err) {
    console.error("\nSmoke test failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
