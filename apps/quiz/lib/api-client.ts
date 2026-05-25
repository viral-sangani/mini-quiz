// Thin wrapper around fetch() that points at the Fastify backend.

export const API_BASE_URL =
  resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");

function resolveApiBaseUrl(configuredUrl: string): string {
  if (
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    isLocalhostApi(configuredUrl) &&
    !isLocalBrowserHost(window.location.hostname)
  ) {
    return "/api/backend";
  }
  return configuredUrl;
}

function isLocalhostApi(value: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/)?$/i.test(value);
}

function isLocalBrowserHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export class ApiError extends Error {
  status: number;
  code?: string;
  body: unknown;

  constructor(status: number, message: string, body: unknown, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

type FetchOpts = RequestInit & { token?: string };

async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { token, headers, ...rest } = opts;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let body: unknown = null;
    let text = "";
    try {
      text = await res.text();
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    const message =
      (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : null) ?? `API ${res.status} ${path}`;
    const code =
      body && typeof body === "object" && "code" in body && typeof (body as { code: unknown }).code === "string"
        ? (body as { code: string }).code
        : undefined;
    throw new ApiError(res.status, message, body, code);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, opts?: FetchOpts) =>
    apiFetch<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: FetchOpts) =>
    apiFetch<T>(path, {
      ...opts,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown, opts?: FetchOpts) =>
    apiFetch<T>(path, {
      ...opts,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),
  del: <T>(path: string, opts?: FetchOpts) =>
    apiFetch<T>(path, { ...opts, method: "DELETE" }),
};
