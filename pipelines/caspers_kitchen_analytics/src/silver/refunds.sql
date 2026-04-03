CREATE OR REFRESH STREAMING TABLE `caspers-kitchen-prod`.silver.refunds
TBLPROPERTIES ('delta.feature.timestampNtz' = 'supported');

CREATE FLOW refunds_cdc AS AUTO CDC INTO `caspers-kitchen-prod`.silver.refunds
FROM STREAM(`caspers-kitchen-prod`.lakebase.lb_refunds_history)
KEYS (id)
APPLY AS DELETE WHEN _change_type = 'delete'
SEQUENCE BY _lsn
COLUMNS * EXCEPT (_change_type, _lsn, _xid, _timestamp)
STORED AS SCD TYPE 1;
