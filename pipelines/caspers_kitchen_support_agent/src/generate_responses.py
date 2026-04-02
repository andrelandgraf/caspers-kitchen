# Databricks notebook source

# COMMAND ----------

import json
from datetime import datetime

import mlflow.deployments
from pyspark.sql import functions as F
from pyspark.sql.types import (
    BinaryType,
    IntegerType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)

# COMMAND ----------

catalog = dbutils.widgets.get("catalog")
endpoint = dbutils.widgets.get("endpoint")

client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

SYSTEM_PROMPT = """You are a support agent for Caspers Kitchen, a ghost kitchen food delivery company.

Your job is to analyze a customer support case and generate:
1. A concise summary of the case so far
2. A suggested response to send to the customer
3. A recommended action (refund, credit, no_action, or escalate)
4. If refund or credit, a suggested amount in cents
5. Your reasoning for the recommendation

Guidelines:
- Be empathetic and professional
- For missing/wrong items: suggest a refund for the affected items
- For late deliveries: suggest a credit of 10-20% of order total for first-time issues
- For repeat complaints (3+ cases in 90 days): consider escalation
- High-value customers (lifetime spend > $200) should get generous treatment
- Never suggest refund/credit exceeding the order total
- If the case is already resolved with a refund/credit, suggest no_action

Respond with valid JSON only, no markdown formatting:
{
  "case_summary": "...",
  "suggested_response": "...",
  "suggested_action": "refund|credit|no_action|escalate",
  "suggested_amount_cents": 0,
  "reasoning": "..."
}"""

# COMMAND ----------

open_cases = spark.sql(f"""
    SELECT sc.id AS case_id, HEX(sc.id) AS case_id_hex, sc.user_id, sc.subject, sc.status
    FROM `{catalog}`.silver.support_cases sc
    WHERE sc.status IN ('open', 'in_progress')
""").collect()

print(f"Found {len(open_cases)} open/in-progress cases to process")

# COMMAND ----------

def build_prompt(case_row):
    case_id_hex = case_row["case_id_hex"]
    user_id = case_row["user_id"]

    context_df = spark.sql(f"""
        SELECT user_name, user_email, user_region, subject, status,
               message_count, has_admin_reply, first_response_minutes,
               linked_refund_cents, linked_credit_cents,
               user_lifetime_spend_cents, user_cases_90d
        FROM `{catalog}`.gold.support_case_context
        WHERE case_id = UNHEX('{case_id_hex}')
    """).collect()

    profile_df = spark.sql(f"""
        SELECT total_orders_90d, total_spend_90d_cents,
               lifetime_order_count, lifetime_spend_cents,
               support_cases_90d, total_refunds_90d_cents, total_credits_90d_cents
        FROM `{catalog}`.gold.user_support_profile
        WHERE user_id = '{user_id}'
    """).collect()

    messages_df = spark.sql(f"""
        SELECT
            CASE WHEN admin_id IS NOT NULL THEN 'admin' ELSE 'customer' END AS role,
            content,
            created_at
        FROM `{catalog}`.silver.support_messages
        WHERE case_id = UNHEX('{case_id_hex}')
        ORDER BY created_at ASC
    """).collect()

    ctx = context_df[0] if context_df else None
    profile = profile_df[0] if profile_df else None

    parts = []
    parts.append(f"Subject: {case_row['subject']}")
    parts.append(f"Status: {case_row['status']}")

    if ctx:
        parts.append(f"Customer: {ctx['user_name']} ({ctx['user_email']}), region: {ctx['user_region']}")
        parts.append(f"Messages so far: {ctx['message_count']}")
        parts.append(f"Admin has replied: {ctx['has_admin_reply']}")
        if ctx["first_response_minutes"] is not None:
            parts.append(f"First response time: {ctx['first_response_minutes']} minutes")
        parts.append(f"Linked refunds: ${ctx['linked_refund_cents'] / 100:.2f}")
        parts.append(f"Linked credits: ${ctx['linked_credit_cents'] / 100:.2f}")

    if profile:
        parts.append(f"\nCustomer Profile:")
        parts.append(f"  Lifetime orders: {profile['lifetime_order_count']}, spend: ${profile['lifetime_spend_cents'] / 100:.2f}")
        parts.append(f"  Last 90 days: {profile['total_orders_90d']} orders, ${profile['total_spend_90d_cents'] / 100:.2f} spent")
        parts.append(f"  Support cases (90d): {profile['support_cases_90d']}")
        parts.append(f"  Refunds (90d): ${profile['total_refunds_90d_cents'] / 100:.2f}")
        parts.append(f"  Credits (90d): ${profile['total_credits_90d_cents'] / 100:.2f}")

    parts.append(f"\nMessage Thread:")
    for msg in messages_df:
        ts = msg["created_at"].strftime("%H:%M") if msg["created_at"] else ""
        parts.append(f"  [{ts}] {msg['role'].upper()}: {msg['content']}")

    return "\n".join(parts)

# COMMAND ----------

def call_llm(prompt):
    response = client.predict(
        endpoint=endpoint,
        inputs={
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 1000,
            "temperature": 0.3,
        },
    )
    content = response["choices"][0]["message"]["content"]
    model_name = response.get("model", endpoint)
    return content, model_name

# COMMAND ----------

def parse_response(raw_content):
    cleaned = raw_content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    parsed = json.loads(cleaned)

    valid_actions = {"refund", "credit", "no_action", "escalate"}
    action = parsed.get("suggested_action", "no_action")
    if action not in valid_actions:
        action = "no_action"

    return {
        "case_summary": str(parsed.get("case_summary", "")),
        "suggested_response": str(parsed.get("suggested_response", "")),
        "suggested_action": action,
        "suggested_amount_cents": int(parsed.get("suggested_amount_cents", 0)),
        "reasoning": str(parsed.get("reasoning", "")),
    }

# COMMAND ----------

results = []
now = datetime.utcnow()

for case in open_cases:
    try:
        prompt = build_prompt(case)
        raw_content, model_name = call_llm(prompt)
        parsed = parse_response(raw_content)

        results.append({
            "case_id": case["case_id"],
            "user_id": case["user_id"],
            "case_summary": parsed["case_summary"],
            "suggested_response": parsed["suggested_response"],
            "suggested_action": parsed["suggested_action"],
            "suggested_amount_cents": parsed["suggested_amount_cents"],
            "reasoning": parsed["reasoning"],
            "model": model_name,
            "generated_at": now,
        })
        print(f"Processed case {case['subject']}: {parsed['suggested_action']}")
    except Exception as e:
        print(f"Error processing case {case['subject']}: {e}")

print(f"\nGenerated {len(results)} responses out of {len(open_cases)} cases")

# COMMAND ----------

if results:
    schema = StructType([
        StructField("case_id", BinaryType(), False),
        StructField("user_id", StringType(), False),
        StructField("case_summary", StringType(), False),
        StructField("suggested_response", StringType(), False),
        StructField("suggested_action", StringType(), False),
        StructField("suggested_amount_cents", IntegerType(), False),
        StructField("reasoning", StringType(), False),
        StructField("model", StringType(), False),
        StructField("generated_at", TimestampType(), False),
    ])

    df = spark.createDataFrame(results, schema=schema)

    df.write.mode("overwrite").saveAsTable(
        f"`{catalog}`.gold.support_agent_responses"
    )

    print(f"Wrote {df.count()} rows to {catalog}.gold.support_agent_responses")
else:
    print("No results to write")
