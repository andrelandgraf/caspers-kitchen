import { loadEnvConfig } from "@next/env";
import { execSync } from "node:child_process";

// Load Next.js environment variables (.env, .env.development, etc.)
loadEnvConfig(process.cwd());

// Generate the better-auth schema (auth tables) from the auth config
execSync(
  "npx @better-auth/cli@latest generate --config src/lib/auth/server.tsx --output src/lib/auth/schema.ts",
  { stdio: "inherit" },
);

// Generate Drizzle SQL migration files from all schema definitions
execSync("npx drizzle-kit generate", { stdio: "inherit" });
