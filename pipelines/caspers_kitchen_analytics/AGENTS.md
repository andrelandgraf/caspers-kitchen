# Caspers Kitchen Analytics Pipeline

Declarative Automation Bundle for the medallion architecture (silver + gold layers).
Syncs data from Lakebase (OLTP) → Lakehouse silver (CDC streaming tables) → Lakehouse gold (materialized views).

## Prerequisites

- Databricks CLI >= v0.292.0
- Authenticated profile with access to `caspers-kitchen-prod` catalog

## For AI Agents

Read the `databricks-core` skill for CLI basics, authentication, and deployment workflow.
Read the `databricks-pipelines` skill for pipeline-specific guidance.

## CRITICAL: Dataset Type Changes

**NEVER change a dataset type (MATERIALIZED_VIEW ↔ STREAMING_TABLE) without dropping the existing table first.** DLT rejects in-place type changes with `CANNOT_CHANGE_DATASET_TYPE`. A full refresh does NOT help — the table must be explicitly dropped.

If you need to change a dataset type:
1. Drop the table: `DROP TABLE IF EXISTS \`caspers-kitchen-prod\`.<schema>.<table>`
2. Deploy the pipeline with the new definition
3. Run a full refresh: `databricks pipelines start-update <PIPELINE_ID> --full-refresh`

This applies to ALL tables in the pipeline. If you change multiple tables, drop them all before deploying.

**This pipeline is continuous and powers the support agent job.** If it breaks, the support agent stops processing tickets within minutes. Always test type changes on a dev target first.

## Dev Workflow

```bash
databricks bundle validate --profile DEFAULT
databricks bundle deploy -t dev --profile DEFAULT
databricks bundle run caspers_kitchen_analytics -t dev --profile DEFAULT
```
