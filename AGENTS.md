# Caspers Kitchen

Caspers Kitchen is a demo ghost kitchen company. You can order food online, will be assigned to a kitchen location, a driver will pick up the order and deliver it to you.

This monorepo contains parts of the Caspers Kitchen system (relevant to the demo flows), including:

- the public-facing REST API (signup, login, order, support chat, etc.)
- the schema for the core Databricks Lakebase (Postgres) database for Caspers Kitchen
- a user data generator UI (for demo purposes) - instead of a real food delivery app
- an internal support console built on Databricks Apps
- addiitonal Databricks infra used to sync data to the lake house
- an internal support agent built on Databricks AgentBricks

# Package Manager

This project uses **npm** (not bun, yarn, or pnpm). Do not generate `bun.lock`, `yarn.lock`, or `pnpm-lock.yaml` files.

# Feature Development Workflow

For every feature, follow this end-to-end workflow:

1. **Branch** — switch to `main`, pull latest, create a new git branch for the feature.
2. **Lakebase branch** — create a new Lakebase branch off `production` with a 1-day TTL (`"ttl": "86400s"`). Use this branch for all local development and testing.
3. **Run locally** — start the app locally against the new Lakebase branch.
4. **Smoke test** — use agent browser to verify both the Next.js app and the support console run successfully on localhost.
5. **Develop** — implement the feature. For each atomic change, run `typecheck`, `build`, `fmt` (in `apps/api`) and fix every error before moving on.
6. **Test locally** — use agent browser to verify the feature works end-to-end on localhost.
7. **Push & PR** — push the git branch and create a pull request. Do **not** merge yet.
8. **Verify deploy** — after the PR preview deploy succeeds, run `vercel ls` from the **monorepo root** and confirm the deployment shows **● Ready**. If it shows **● Error**, run `vercel inspect <url>` to diagnose. **Never run `vercel link` from a subdirectory.**
9. **Merge & apply schema** — only after the PR is merged, apply any schema changes to the Lakebase `production` branch. Never apply schema changes to production before the PR is merged.
10. **Verify production** — confirm the production deployment is Ready and `/api/cron/simulate` is returning **200** on its every-5-minute schedule. Use `vercel logs` (streaming, from the repo root) or check the Vercel dashboard.
11. **Iterate** — if the deploy or cron fails, find the root cause, fix it, and restart from step 5. Never stop with issues still persisting.

The task is only done when the production deployment is Ready and the cron job is healthy.

## Lakebase Schema Changes

- **Forward-compatible only** — never break the existing schema. Add columns as nullable, add new tables, add new indexes. Do not rename or drop columns/tables that production code depends on.
- **Test first** — always apply and validate schema changes on the Lakebase test branch before touching production.
- **Production last** — only apply schema changes to the `production` branch after the corresponding code PR is merged.

Principles:

- **No workarounds** — find the root cause and fix it properly.
- **Code quality is priority number one** — never sacrifice correctness for speed.
- **Type narrowing, not type casting** — no `as any`, no `as T`. Use assertion functions, discriminated unions, and control flow narrowing.
- **Good error messages** — every assert and throw should explain what went wrong and what was expected.
- **Fail early** — validate inputs and env vars at the boundary, not deep in business logic.

# Tools

- Use the `databricks` CLI with default profile (`DEFAULT`) for all Databricks infra management. Report if auth is expired and prompt for re-auth.
- Use the `vercel` CLI for Vercel deployment management. Report if auth is expired and prompt for re-auth.

# Vercel (API)

- The Vercel project is linked at the **monorepo root** (`/.vercel/project.json`). All `vercel` CLI commands (`ls`, `inspect`, `logs`) must run from the repo root — **never** from `apps/api` or any subdirectory.
- **Do not run `vercel link`** from subdirectories. It will create a second `.vercel` folder pointing to the wrong project.
- Deploys are triggered automatically on push to `main` via the GitHub integration. No manual `vercel deploy` needed.
- Production URL: `caspers-kitchen.vercel.app`

# Databricks Apps (Support Console)

- `databricks bundle deploy` uploads files but does **not** restart the app. To apply changes, run `databricks apps deploy --profile <PROFILE>` from the app directory — this rebuilds and restarts the app.
- The support console fetches data on page load only (no polling). If data looks stale after a deploy, the app likely needs a restart, not just a browser refresh.
