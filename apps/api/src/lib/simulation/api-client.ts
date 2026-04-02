import { getBaseUrl } from "./config";

export type ApiClient = {
  signUp(data: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ ok: boolean; data: unknown }>;
  signIn(data: {
    email: string;
    password: string;
  }): Promise<{ ok: boolean; data: unknown }>;
  get(path: string): Promise<{ ok: boolean; status: number; data: unknown }>;
  post(
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; data: unknown }>;
  patch(
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; data: unknown }>;
  del(path: string): Promise<{ ok: boolean; status: number; data: unknown }>;
};

export function createApiClient(baseUrl?: string): ApiClient {
  const base = baseUrl ?? getBaseUrl();
  let cookies = "";

  function extractCookies(response: Response): void {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      const parsed = setCookies.map((c) => c.split(";")[0]).join("; ");
      cookies = parsed;
    }
  }

  function headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Origin: base,
    };
    if (cookies) {
      h["Cookie"] = cookies;
    }
    return h;
  }

  async function request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    const url = `${base}${path}`;
    const res = await fetch(url, {
      method,
      headers: headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    extractCookies(res);
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  }

  return {
    async signUp(data) {
      const result = await request("POST", "/api/auth/sign-up/email", data);
      return { ok: result.ok, data: result.data };
    },

    async signIn(data) {
      const result = await request("POST", "/api/auth/sign-in/email", data);
      return { ok: result.ok, data: result.data };
    },

    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    patch: (path, body) => request("PATCH", path, body),
    del: (path) => request("DELETE", path),
  };
}
