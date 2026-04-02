# Create Unity Catalog Instance

Unity Catalog for synced Lakebase data and downstream analytics.

**Important:** Lakehouse Sync requires a catalog with an **external S3 storage root** — catalogs using Default Storage (the metastore-managed bucket) will not work.

## Steps

### 1. Ensure a storage credential exists

A storage credential wraps an AWS IAM role that Unity Catalog can assume to read/write to S3. List existing credentials:

```bash
databricks storage-credentials list --profile <PROFILE>
```

If none exist with access to your target S3 bucket, create one (requires `CREATE_STORAGE_CREDENTIAL` privilege):

```bash
databricks storage-credentials create \
  --json '{
    "name": "<CREDENTIAL_NAME>",
    "aws_iam_role": {
      "role_arn": "arn:aws:iam::<AWS_ACCOUNT_ID>:role/<ROLE_NAME>"
    }
  }' \
  --profile <PROFILE>
```

### 2. Create an external location

An external location binds an S3 path to a storage credential. You need `CREATE EXTERNAL LOCATION` on the credential:

```bash
databricks experimental aitools tools query \
  "GRANT CREATE EXTERNAL LOCATION ON CREDENTIAL <CREDENTIAL_NAME> TO \`<your-email>\`" \
  --profile <PROFILE>
```

Then create the location:

```bash
databricks external-locations create <LOCATION_NAME> \
  "s3://<BUCKET>/<PATH>" \
  <CREDENTIAL_NAME> \
  --comment "External storage for Caspers Kitchen Lakebase sync" \
  --profile <PROFILE>
```

### 3. Create the catalog with external storage root

```bash
databricks catalogs create caspers-kitchen-prod \
  --storage-root "s3://<BUCKET>/<PATH>" \
  --comment "Production catalog for Caspers Kitchen Lakebase sync" \
  --profile <PROFILE>
```

### 4. Create the destination schema

```bash
databricks experimental aitools tools query \
  "CREATE SCHEMA IF NOT EXISTS \`caspers-kitchen-prod\`.\`lakebase\` COMMENT 'Lakebase CDC sync tables'" \
  --profile <PROFILE>
```

### 5. Verify

```bash
databricks schemas list caspers-kitchen-prod --profile <PROFILE>
```

Expected output:

```
caspers-kitchen-prod.default             (auto-created)
caspers-kitchen-prod.information_schema  (auto-created)
caspers-kitchen-prod.lakebase            Lakebase CDC sync tables
```

## What doesn't work

Creating a catalog with **Default Storage** (the metastore-managed S3 bucket) does not support Lakehouse Sync:

- SQL `CREATE CATALOG` without `MANAGED LOCATION` uses Default Storage
- CLI `databricks catalogs create --storage-root <default-bucket-url>` is rejected with "Please use the UI to create a catalog with Default Storage"

You must provide a non-default S3 path backed by a storage credential and external location.

## Notes

- The `lakebase` schema will contain `lb_<table_name>_history` Delta tables once Lakehouse Sync is enabled.
- The storage credential's IAM role must have read/write access to the S3 path used as storage root.
- The external location must cover the S3 path before `catalogs create --storage-root` will accept it.
