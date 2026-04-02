#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.development}"
PROFILE="${DATABRICKS_CONFIG_PROFILE:-DEFAULT}"

TOKEN=$(databricks auth token --profile "$PROFILE" -o json | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

if [ -z "$TOKEN" ]; then
  echo "Failed to get token from Databricks CLI (profile: $PROFILE)" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

if grep -q '^DATABRICKS_TOKEN=' "$ENV_FILE"; then
  sed -i '' "s|^DATABRICKS_TOKEN=.*|DATABRICKS_TOKEN=\"$TOKEN\"|" "$ENV_FILE"
else
  echo "DATABRICKS_TOKEN=\"$TOKEN\"" >> "$ENV_FILE"
fi

echo "Updated DATABRICKS_TOKEN in $ENV_FILE (valid ~1 hour)"
