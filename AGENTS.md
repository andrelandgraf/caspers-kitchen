# Caspers Kitchen

Caspers Kitchen is a demo ghost kitchen company. You can order food online, will be assigned to a kitchen location, a driver will pick up the order and deliver it to you.

This monorepo contains parts of the Caspers Kitchen system (relevant to the demo flows), including:

- the public-facing REST API (signup, login, order, support chat, etc.)
- the schema for the core Databricks Lakebase (Postgres) database for Caspers Kitchen
- a user data generator UI (for demo purposes) - instead of a real food delivery app
- an internal support console built on Databricks Apps
- addiitonal Databricks infra used to sync data to the lake house
- an internal support agent built on Databricks AgentBricks
