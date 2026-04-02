import { execSync } from "node:child_process";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

execSync(
  "npx @better-auth/cli@latest generate --config src/lib/auth/server.tsx --output src/lib/auth/schema.ts",
  { stdio: "inherit" },
);

execSync("npx drizzle-kit generate", { stdio: "inherit" });
