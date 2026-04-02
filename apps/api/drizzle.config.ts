import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { defineConfig } from "drizzle-kit";
import { databaseConfig } from "./src/lib/db/config";

const url = databaseConfig.server.url;
if (!url) {
  throw new Error(
    "DATABASE_URL is required for drizzle-kit (the migration script sets it automatically for Lakebase)",
  );
}

export default defineConfig({
  schema: "./src/lib/*/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
});
