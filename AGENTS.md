# Caspers Kitchen

Caspers Kitchen is a demo ghost kitchen company. You can order food online, will be assigned to a kitchen location, a driver will pick up the order and deliver it to you.

This monorepo contains parts of the Caspers Kitchen system (relevant to the demo flows), including:

- the public-facing REST API (signup, login, order, support chat, etc.)
- the schema for the core Databricks Lakebase (Postgres) database for Caspers Kitchen
- a user data generator UI (for demo purposes) - instead of a real food delivery app
- an internal support console built on Databricks Apps
- addiitonal Databricks infra used to sync data to the lake house
- an internal support agent built on Databricks AgentBricks

# Dev Workflow

After every atomic feature change, follow this loop until everything is green:

1. **Verify and fix** — run `typecheck`, `build`, `fmt` (in `apps/api`). Fix every error before moving on.
2. **Commit** — one clean commit per atomic change.
3. **Push** — push to `main`.
4. **Verify deploy** — use `vercel` CLI or dashboard to confirm the production build succeeds.
5. **Iterate** — if the deploy fails, find the root cause, fix it, and restart from step 1. Never stop with issues still persisting.

Principles:

- **No workarounds** — find the root cause and fix it properly.
- **Code quality is priority number one** — never sacrifice correctness for speed.
- **Type narrowing, not type casting** — no `as any`, no `as T`. Use assertion functions, discriminated unions, and control flow narrowing.
- **Good error messages** — every assert and throw should explain what went wrong and what was expected.
- **Fail early** — validate inputs and env vars at the boundary, not deep in business logic.
