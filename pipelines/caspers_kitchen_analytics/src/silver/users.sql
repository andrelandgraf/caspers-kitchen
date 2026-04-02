CREATE OR REFRESH MATERIALIZED VIEW `caspers-kitchen-prod`.silver.users
TBLPROPERTIES ('delta.feature.timestampNtz' = 'supported')
AS
SELECT * EXCEPT (_change_type, _lsn, _xid, _timestamp, rn)
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY _lsn DESC) AS rn
  FROM `caspers-kitchen-prod`.lakebase.lb_users_history
  WHERE _change_type != 'update_preimage'
)
WHERE rn = 1 AND _change_type != 'delete'
