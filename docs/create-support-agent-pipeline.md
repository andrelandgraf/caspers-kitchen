# Support Agent Response Pipeline

Lakeflow Job that generates AI-powered draft responses for open support cases using GPT via AI Gateway.

## Prerequisites

- Medallion pipeline deployed and running (see [create-medallion-pipelines.md](./create-medallion-pipelines.md))
- Silver and gold tables populated in `caspers-kitchen-prod`
- Databricks CLI >= v0.292.0, authenticated (`databricks auth profiles`)
- AI Gateway endpoint available (e.g., `databricks-gpt-5-4-mini`)

## Architecture

```
SILVER                              GOLD (input)
  support_cases ──┐                   support_case_context ──┐
  support_messages ──┤                user_support_profile ──┤
                     ▼                                       ▼
              ┌──────────────────────────────────────────────────┐
              │  Lakeflow Job: generate_responses.py             │
              │  For each unanswered user message:               │
              │    1. Build prompt with case + customer context   │
              │    2. Call GPT via AI Gateway                     │
              │    3. Parse structured JSON response              │
              │    4. Merge into gold table (append-only)         │
              └──────────────────┬───────────────────────────────┘
                                 │
                                 ▼
              GOLD (output): support_agent_responses
```

## Pipeline Bundle

Location in repo: `pipelines/caspers_kitchen_support_agent/`

```
pipelines/caspers_kitchen_support_agent/
├── databricks.yml                            # Bundle config
├── AGENTS.md
├── resources/
│   └── support_agent_job.job.yml             # Every-minute cron schedule
└── src/
    └── generate_responses.py                 # Python notebook
```

## Output Table: `gold.support_agent_responses`

One row per user message that triggered a response. Rows are merged (append-only), preserving the full history of agent drafts across pipeline runs.

| Column | Type | Description |
|---|---|---|
| `message_id` | BINARY | PK — FK to silver.support_messages |
| `case_id` | BINARY | FK to silver.support_cases |
| `user_id` | STRING | FK to silver.users |
| `case_summary` | STRING | LLM-generated summary of all messages |
| `suggested_response` | STRING | Draft admin reply |
| `suggested_action` | STRING | `refund`, `credit`, `no_action`, or `escalate` |
| `suggested_amount_cents` | INT | Suggested compensation amount (0 if no_action/escalate) |
| `reasoning` | STRING | LLM explanation of the recommendation |
| `model` | STRING | Model used (e.g., `gpt-5.4-mini-2026-03-17`) |
| `generated_at` | TIMESTAMP | When the response was generated |

## LLM Prompt Design

Each case prompt includes:

1. **Case metadata** -- subject, status, message count, first response time
2. **Customer profile** -- lifetime spend, order count, recent support history, refund/credit history
3. **Full message thread** -- all messages in chronological order with role labels (customer vs admin)
4. **System prompt** -- Caspers Kitchen support policy with refund thresholds, escalation criteria, and tone guidelines

The model returns structured JSON which is parsed and validated before writing.

## Model

Uses `databricks-gpt-5-4-mini` via AI Gateway. Configurable via the `endpoint` bundle variable in `databricks.yml`.

## Deploy and Run

### Validate

```bash
cd pipelines/caspers_kitchen_support_agent
databricks bundle validate --profile DEFAULT
```

### Deploy (dev)

```bash
databricks bundle deploy -t dev --profile DEFAULT
```

### Run

```bash
databricks bundle run support_agent_job -t dev --profile DEFAULT
```

### Deploy (prod)

```bash
databricks bundle deploy -t prod --profile DEFAULT
```

### Verify output

```bash
databricks experimental aitools tools query \
  "SELECT HEX(message_id) AS message_id, suggested_action, suggested_amount_cents, case_summary, generated_at FROM \`caspers-kitchen-prod\`.gold.support_agent_responses ORDER BY generated_at DESC LIMIT 5" \
  --profile DEFAULT
```

## Schedule

Runs every minute via a cron schedule (`0 * * * * ?`). Only processes the latest unanswered user message per open/in-progress case. Messages that already have an agent response are skipped (merge is idempotent).

## Troubleshooting

### Binary UUID comparisons in Spark SQL

Support case IDs are `BINARY` (UUID) columns. You cannot compare them with string literals in SQL. Use `HEX()` to extract as string and `UNHEX()` to convert back:

```python
case_id_hex = row["case_id_hex"]  # from HEX(sc.id) in the query
spark.sql(f"SELECT * FROM table WHERE case_id = UNHEX('{case_id_hex}')")
```

### AI Gateway authentication

Jobs running on Databricks automatically authenticate to AI Gateway. No API keys or tokens needed -- the job's workspace credentials are used. Use `mlflow.deployments.get_deploy_client("databricks")` to get a client.

### Structured JSON parsing

The LLM occasionally wraps JSON in markdown code fences. The notebook strips these before parsing. If parsing still fails, the case is skipped with an error log and other cases continue.

### Rate limits

AI Gateway has built-in rate limiting. For large case volumes, consider adding a small delay between calls or batching in parallel with Spark UDFs.
