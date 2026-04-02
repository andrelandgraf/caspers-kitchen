import assert from "@/lib/common/assert";

const CACHE_BUFFER_MS = 2 * 60 * 1000;

interface CachedToken {
  value: string;
  expiresAt: number;
}

function isFresh(token: CachedToken | null): token is CachedToken {
  return token !== null && Date.now() < token.expiresAt - CACHE_BUFFER_MS;
}

// -- M2M OAuth (service principal) -----------------------------------------

let cachedM2MToken: CachedToken | null = null;
let m2mRefreshPromise: Promise<CachedToken> | null = null;

async function fetchM2MAccessToken(
  host: string,
  clientId: string,
  clientSecret: string,
): Promise<CachedToken> {
  const url = `${host}/oidc/v1/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "all-apis",
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  assert(
    response.ok,
    () =>
      `Databricks M2M token request failed: ${response.status} ${response.statusText}`,
  );

  const data: unknown = await response.json();
  assert(
    typeof data === "object" && data !== null,
    "Invalid M2M token response",
  );

  const { access_token, expires_in } = data as Record<string, unknown>;
  assert(typeof access_token === "string", "Missing access_token in response");
  assert(typeof expires_in === "number", "Missing expires_in in response");

  return {
    value: access_token,
    expiresAt: Date.now() + expires_in * 1000,
  };
}

function getM2MAccessToken(
  host: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  if (isFresh(cachedM2MToken)) {
    return Promise.resolve(cachedM2MToken.value);
  }

  if (!m2mRefreshPromise) {
    m2mRefreshPromise = fetchM2MAccessToken(host, clientId, clientSecret)
      .then((token) => {
        cachedM2MToken = token;
        return token;
      })
      .finally(() => {
        m2mRefreshPromise = null;
      });
  }

  return m2mRefreshPromise.then((t) => t.value);
}

// -- Lakebase credential (Postgres OAuth token) ----------------------------

let cachedCredential: CachedToken | null = null;
let credentialRefreshPromise: Promise<CachedToken> | null = null;

async function fetchLakebaseCredential(
  host: string,
  accessToken: string,
  endpoint: string,
): Promise<CachedToken> {
  const url = `${host}/api/2.0/postgres/credentials`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ endpoint }),
  });

  assert(
    response.ok,
    () =>
      `Lakebase credential request failed: ${response.status} ${response.statusText}`,
  );

  const data: unknown = await response.json();
  assert(
    typeof data === "object" && data !== null,
    "Invalid credential response",
  );

  const { token, expire_time } = data as Record<string, unknown>;
  assert(typeof token === "string", "Missing token in credential response");
  assert(
    typeof expire_time === "string",
    "Missing expire_time in credential response",
  );

  return {
    value: token,
    expiresAt: new Date(expire_time).getTime(),
  };
}

/**
 * Two auth strategies for obtaining a Databricks workspace access token:
 *
 * 1. DATABRICKS_TOKEN -- direct Bearer token (PAT or CLI-issued OAuth).
 *    Simplest for local dev: `databricks auth token --profile DEFAULT`.
 *
 * 2. DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET -- M2M OAuth
 *    client-credentials grant against the workspace OIDC endpoint.
 *    Use for production on Vercel with a service principal.
 */
export type AuthStrategy =
  | { kind: "token"; token: string }
  | { kind: "m2m"; host: string; clientId: string; clientSecret: string };

function getWorkspaceAccessToken(auth: AuthStrategy): Promise<string> {
  switch (auth.kind) {
    case "token":
      return Promise.resolve(auth.token);
    case "m2m":
      return getM2MAccessToken(auth.host, auth.clientId, auth.clientSecret);
  }
}

/**
 * Fetches (or returns cached) Lakebase Postgres OAuth token.
 * Handles the full auth -> credential chain with caching and deduplication.
 */
export function getLakebaseToken(
  host: string,
  auth: AuthStrategy,
  endpoint: string,
): Promise<string> {
  if (isFresh(cachedCredential)) {
    return Promise.resolve(cachedCredential.value);
  }

  if (!credentialRefreshPromise) {
    credentialRefreshPromise = (async () => {
      const accessToken = await getWorkspaceAccessToken(auth);
      return fetchLakebaseCredential(host, accessToken, endpoint);
    })()
      .then((cred) => {
        cachedCredential = cred;
        return cred;
      })
      .finally(() => {
        credentialRefreshPromise = null;
      });
  }

  return credentialRefreshPromise.then((c) => c.value);
}
