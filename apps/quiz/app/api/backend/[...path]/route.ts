import type { NextRequest } from "next/server";

const API_PROXY_TARGET = process.env.QUIZ_API_PROXY_TARGET ?? "http://localhost:4000";
const HOP_BY_HOP_HEADERS = [
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

type RouteContext = {
  params: {
    path?: string[];
  };
};

async function proxy(request: NextRequest, context: RouteContext) {
  const sourceUrl = new URL(request.url);
  const path = context.params.path?.join("/") ?? "";
  const targetUrl = new URL(`/${path}${sourceUrl.search}`, API_PROXY_TARGET);

  const requestHeaders = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) requestHeaders.delete(header);
  requestHeaders.set("ngrok-skip-browser-warning", "1");

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: requestHeaders,
    body: request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer(),
    cache: "no-store",
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstream.headers);
  for (const header of HOP_BY_HOP_HEADERS) responseHeaders.delete(header);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const dynamic = "force-dynamic";

export {
  proxy as DELETE,
  proxy as GET,
  proxy as HEAD,
  proxy as OPTIONS,
  proxy as PATCH,
  proxy as POST,
  proxy as PUT,
};
