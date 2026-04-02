# Caspers Kitchen Analytics Pipeline

Declarative Automation Bundle for the medallion architecture (silver + gold layers).

## Prerequisites

- Databricks CLI >= v0.292.0
- Authenticated profile with access to `caspers-kitchen-prod` catalog

## For AI Agents

Read the `databricks-core` skill for CLI basics, authentication, and deployment workflow.
Read the `databricks-pipelines` skill for pipeline-specific guidance.

## Dev Workflow

```bash
databricks bundle validate --profile DEFAULT
databricks bundle deploy -t dev --profile DEFAULT
databricks bundle run caspers_kitchen_analytics -t dev --profile DEFAULT
```
