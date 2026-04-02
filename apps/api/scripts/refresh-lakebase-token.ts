import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// Which env file to update (default: .env.development)
const envFile = process.argv[2] ?? ".env.development";

// Which Databricks CLI profile to use
const profile = process.env.DATABRICKS_CONFIG_PROFILE ?? "DEFAULT";

// Fetch a fresh access token from the Databricks CLI
const raw = execSync(`databricks auth token --profile "${profile}" -o json`, {
  encoding: "utf-8",
});

// Parse and validate the CLI output
const parsed: unknown = JSON.parse(raw);
if (
  typeof parsed !== "object" ||
  parsed === null ||
  !("access_token" in parsed) ||
  typeof parsed.access_token !== "string" ||
  parsed.access_token.length === 0
) {
  throw new Error(
    `Failed to get access token from Databricks CLI (profile: ${profile})`,
  );
}
const token = parsed.access_token;

// Read the target env file
if (!existsSync(envFile)) {
  throw new Error(`Env file not found: ${envFile}`);
}
const content = readFileSync(envFile, "utf-8");

// Update existing DATABRICKS_TOKEN line or append a new one
const tokenLine = `DATABRICKS_TOKEN="${token}"`;
const updated = content.includes("DATABRICKS_TOKEN=")
  ? content.replace(/^DATABRICKS_TOKEN=.*/m, tokenLine)
  : content.trimEnd() + "\n" + tokenLine + "\n";

writeFileSync(envFile, updated);
console.log(`Updated DATABRICKS_TOKEN in ${envFile} (valid ~1 hour)`);
