/**
 * Smoke test: connect to the database via Drizzle and run a simple query.
 * Usage: bun run db:smoke
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

async function main() {
  let pool: Pool;

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
    console.error("Neither PGHOST nor DATABASE_URL is set");
    process.exit(1);
  }

  const db = drizzle({ client: pool });

  try {
    console.log("\nConnecting...");
    const result = await db.execute(
      sql`SELECT version(), now() AS server_time`,
    );
    const row = result.rows[0] as { version: string; server_time: string };
    console.log(`  PG version: ${row.version}`);
    console.log(`  Server time: ${row.server_time}`);

    const tables = await db.execute(sql`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);
    console.log(`\nTables found: ${tables.rows.length}`);
    for (const t of tables.rows as {
      table_schema: string;
      table_name: string;
    }[]) {
      console.log(`  ${t.table_schema}.${t.table_name}`);
    }

    console.log("\nSmoke test passed.");
  } catch (err) {
    console.error("\nSmoke test failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
