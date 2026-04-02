# Caspers Kitchen

A demo ghost-kitchen food delivery system. Customers sign up, browse a menu, place orders, and get deliveries. A traffic simulation generates realistic activity so the system always has fresh data to demo against.

## Architecture

```
┌──────────────┐       ┌──────────────────────────┐
│   Vercel      │       │  Databricks Lakebase     │
│   (Next.js)   │◄─────►│  (Postgres)              │
│               │  pg   │                          │
│  REST API     │       │  Auth, orders, carts,    │
│  Cron jobs    │       │  deliveries, support,    │
│               │       │  simulation state        │
└──────────────┘       └──────────────────────────┘
       ▲
       │  HTTPS
       │
┌──────┴───────┐
│  Clients      │
│  (apps, curl) │
└──────────────┘
```

**Stack:** Next.js 16 (App Router, API routes only), Drizzle ORM, pg, better-auth, Databricks Lakebase (managed Postgres), Vercel.

## Data flow

1. **Auth** — Email/password signup and login via `better-auth`. Sessions are stored in the database.
2. **Ordering** — Authenticated users browse menu items, add to cart, checkout, and cancel. Orders progress through states (confirmed → preparing → ready → picked up → delivered).
3. **Delivery** — Drivers are assigned to ready orders. Deliveries progress through pickup and dropoff.
4. **Support** — Users open support cases with messages. Admins reply and resolve.
5. **Simulation** — A Vercel cron (`/api/cron/simulate`, every 5 min) drives all of the above automatically. It signs up users, places orders, creates support cases, and advances the pipeline — generating realistic traffic without a real frontend.

## Key modules

| Module | Purpose |
|--------|---------|
| `lib/auth/` | better-auth server, session helpers, Drizzle adapter |
| `lib/db/` | Drizzle client, migrations, pool routing (Lakebase vs local Postgres) |
| `lib/lakebase/` | Databricks Lakebase connection with automatic OAuth token refresh |
| `lib/simulation/` | Traffic engine, seed data, backfill, cron auth, traffic model with diurnal/weekday/geo profiles |
| `lib/cart/`, `lib/orders/`, `lib/deliveries/`, `lib/drivers/`, `lib/menu/`, `lib/support/`, `lib/promotions/` | Domain schemas |

## API routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/[...all]` | GET, POST | Auth (signup, login, session) |
| `/api/menu` | GET | List menu items |
| `/api/cart`, `/api/cart/[itemId]`, `/api/cart/promo` | GET, POST, DELETE | Cart management |
| `/api/orders`, `/api/orders/[id]`, `/api/orders/[id]/cancel` | GET, POST | Order lifecycle |
| `/api/deliveries`, `/api/deliveries/[id]/complete` | GET, POST | Delivery tracking |
| `/api/drivers` | GET | Driver listing |
| `/api/support`, `/api/support/[id]/messages` | GET, POST | Support cases |
| `/api/promos` | GET | Active promotions |
| `/api/users/me` | GET | Current user profile |
| `/api/cron/seed` | POST | Seed menu, drivers, admins, config |
| `/api/cron/simulate` | POST | Run one simulation tick |
| `/api/cron/status` | GET | Recent simulation runs |
| `/api/internal/simulation-config` | GET, PATCH | View/update traffic config |

## Environment

Env vars are managed through `better-env` config schemas with validation at startup.

- **Locally** — Databricks CLI token auth, npm via Databricks registry
- **Vercel** — M2M OAuth service principal, npm via public registry
- **Lockfile** — Committed with public `registry.npmjs.org` URLs; local installs go through the Databricks proxy transparently

## Running locally

```bash
npm install
cd apps/api
bash scripts/refresh-lakebase-token.sh   # refresh CLI token (~1hr TTL)
npm run dev                               # start Next.js dev server
npm run typecheck                         # type check
npm run build                             # production build
npm run fmt                               # format with prettier
```
