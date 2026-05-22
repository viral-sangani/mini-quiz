#!/usr/bin/env node

import http from "node:http";
import { URL } from "node:url";

const listenPort = Number(process.env.PHASE2_PROXY_PORT ?? "4000");
const apiTarget = new URL(process.env.PHASE2_API_TARGET ?? "http://127.0.0.1:4101");
const realtimeTarget = new URL(
  process.env.PHASE2_REALTIME_TARGET ?? "http://127.0.0.1:4102",
);

function targetFor(pathname) {
  return /^\/rooms\/[^/]+\/events$/.test(pathname) ? realtimeTarget : apiTarget;
}

const server = http.createServer((req, res) => {
  const incomingUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const target = targetFor(incomingUrl.pathname);
  const headers = { ...req.headers, host: target.host };

  const proxyReq = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: req.method,
      path: `${incomingUrl.pathname}${incomingUrl.search}`,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (err) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "local proxy upstream failed", detail: err.message }));
  });

  req.pipe(proxyReq);
});

server.listen(listenPort, "0.0.0.0", () => {
  console.log(
    `Phase 2 local proxy listening on :${listenPort} (api=${apiTarget.href}, realtime=${realtimeTarget.href})`,
  );
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
