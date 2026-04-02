CREATE OR REFRESH MATERIALIZED VIEW `caspers-kitchen-prod`.gold.support_overview
TBLPROPERTIES ('delta.feature.timestampNtz' = 'supported')
AS
WITH case_stats AS (
  SELECT
    DATE(sc.created_at) AS case_date,
    COUNT(*) AS total_cases,
    COUNT(CASE WHEN sc.status = 'open' THEN 1 END) AS open_cases,
    COUNT(CASE WHEN sc.status = 'resolved' THEN 1 END) AS resolved_cases
  FROM `caspers-kitchen-prod`.silver.support_cases sc
  GROUP BY DATE(sc.created_at)
),
message_stats AS (
  SELECT
    DATE(sc.created_at) AS case_date,
    AVG(msg_count) AS avg_messages_per_case
  FROM `caspers-kitchen-prod`.silver.support_cases sc
  JOIN (
    SELECT case_id, COUNT(*) AS msg_count
    FROM `caspers-kitchen-prod`.silver.support_messages
    GROUP BY case_id
  ) mc ON sc.id = mc.case_id
  GROUP BY DATE(sc.created_at)
),
first_admin_reply AS (
  SELECT
    sm.case_id,
    MIN(sm.created_at) AS first_reply_at
  FROM `caspers-kitchen-prod`.silver.support_messages sm
  WHERE sm.admin_id IS NOT NULL
  GROUP BY sm.case_id
),
response_time_stats AS (
  SELECT
    DATE(sc.created_at) AS case_date,
    AVG(TIMESTAMPDIFF(MINUTE, sc.created_at, far.first_reply_at)) AS avg_first_response_minutes
  FROM `caspers-kitchen-prod`.silver.support_cases sc
  JOIN first_admin_reply far ON sc.id = far.case_id
  GROUP BY DATE(sc.created_at)
),
refund_stats AS (
  SELECT
    DATE(sc.created_at) AS case_date,
    COUNT(DISTINCT r.support_case_id) AS cases_with_refund,
    COALESCE(SUM(r.amount_in_cents), 0) AS total_refund_cents
  FROM `caspers-kitchen-prod`.silver.refunds r
  JOIN `caspers-kitchen-prod`.silver.support_cases sc ON r.support_case_id = sc.id
  GROUP BY DATE(sc.created_at)
),
credit_stats AS (
  SELECT
    DATE(sc.created_at) AS case_date,
    COUNT(DISTINCT c.support_case_id) AS cases_with_credit,
    COALESCE(SUM(c.amount_in_cents), 0) AS total_credit_cents
  FROM `caspers-kitchen-prod`.silver.credits c
  JOIN `caspers-kitchen-prod`.silver.support_cases sc ON c.support_case_id = sc.id
  GROUP BY DATE(sc.created_at)
)
SELECT
  cs.case_date,
  cs.total_cases,
  cs.open_cases,
  cs.resolved_cases,
  COALESCE(ms.avg_messages_per_case, 0) AS avg_messages_per_case,
  COALESCE(rts.avg_first_response_minutes, 0) AS avg_first_response_minutes,
  COALESCE(rs.cases_with_refund, 0) AS cases_with_refund,
  COALESCE(crs.cases_with_credit, 0) AS cases_with_credit,
  COALESCE(rs.total_refund_cents, 0) AS total_refund_cents,
  COALESCE(crs.total_credit_cents, 0) AS total_credit_cents
FROM case_stats cs
LEFT JOIN message_stats ms ON cs.case_date = ms.case_date
LEFT JOIN response_time_stats rts ON cs.case_date = rts.case_date
LEFT JOIN refund_stats rs ON cs.case_date = rs.case_date
LEFT JOIN credit_stats crs ON cs.case_date = crs.case_date
