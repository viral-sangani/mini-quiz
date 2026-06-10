// Thin wrapper around fetch() that points at the Fastify backend.
// `adminApi` (in admin-api.ts) mints a short-lived HS256 JWT and forwards it.

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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

function messageFromErrorBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return null;

  const fieldErrors =
    "fieldErrors" in error &&
    error.fieldErrors &&
    typeof error.fieldErrors === "object"
      ? (error.fieldErrors as Record<string, unknown>)
      : null;
  if (!fieldErrors) return null;

  const messages = Object.entries(fieldErrors)
    .flatMap(([field, value]) =>
      Array.isArray(value)
        ? value
            .filter((msg): msg is string => typeof msg === "string")
            .map((msg) => `${field}: ${msg}`)
        : [],
    );
  return messages.length > 0 ? messages.join("; ") : null;
}

async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { token, headers, ...rest } = opts;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "network error";
    throw new ApiError(
      0,
      `Could not reach API at ${API_BASE_URL}: ${reason}`,
      null,
    );
  }
  if (!res.ok) {
    let body: unknown = null;
    let text = "";
    try {
      text = await res.text();
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    const message = messageFromErrorBody(body) ?? `API ${res.status} ${path}`;
    const code =
      body && typeof body === "object" && "code" in body && typeof (body as { code: unknown }).code === "string"
        ? (body as { code: string }).code
        : undefined;
    throw new ApiError(res.status, message, body, code);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
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
