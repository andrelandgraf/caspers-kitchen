# Caspers Kitchen Support Agent Pipeline

Lakeflow Job that generates AI-powered support agent responses by reading silver/gold tables and calling GPT via AI Gateway.

## Prerequisites

- Databricks CLI >= v0.292.0
- Authenticated profile with access to `caspers-kitchen-prod` catalog
- Silver and gold tables populated (run the analytics pipeline first)

## Dev Workflow

```bash
databricks bundle validate --profile DEFAULT
databricks bundle deploy -t dev --profile DEFAULT
databricks bundle run support_agent_job -t dev --profile DEFAULT
```
