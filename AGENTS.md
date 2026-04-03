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

# Dev Workflow

After every atomic feature change, follow this loop until everything is green:

1. **Verify and fix** — run `typecheck`, `build`, `fmt` (in `apps/api`). Fix every error before moving on.
2. **Commit** — one clean commit per atomic change.
3. **Push** — push to `main`.
4. **Verify deploy** — run `vercel ls` (from `apps/api`) and confirm the latest production deployment shows **● Ready**. If it shows **● Error**, run `vercel inspect <url>` to diagnose.
5. **Verify cron** — run `vercel logs --project caspers-kitchen` and confirm `GET /api/cron/simulate` is returning **200** on its every-5-minute schedule. If it's missing or erroring, investigate immediately.
6. **Iterate** — if the deploy or cron fails, find the root cause, fix it, and restart from step 1. Never stop with issues still persisting.

Pushing to GitHub is **not** the last step — the task is only done when the production deployment is Ready and the cron job is healthy.

Principles:

- **No workarounds** — find the root cause and fix it properly.
- **Code quality is priority number one** — never sacrifice correctness for speed.
- **Type narrowing, not type casting** — no `as any`, no `as T`. Use assertion functions, discriminated unions, and control flow narrowing.
- **Good error messages** — every assert and throw should explain what went wrong and what was expected.
- **Fail early** — validate inputs and env vars at the boundary, not deep in business logic.
