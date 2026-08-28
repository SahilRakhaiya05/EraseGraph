#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createServer, request } from "node:http";
import { isIP } from "node:net";

const upstream = new URL(process.env.ERASEGRAPH_MCP_UPSTREAM ?? "http://127.0.0.1:8787");
if (upstream.protocol !== "http:" || upstream.hostname !== "127.0.0.1") {
  throw new Error("ERASEGRAPH_MCP_UPSTREAM must be an HTTP loopback URL.");
}

function detectWslGateway() {
  if (process.platform !== "win32") {
    throw new Error("This bridge is only needed when TrueForge runs in NAT-mode WSL and the API runs on Windows.");
  }
  const route = execFileSync("wsl.exe", ["ip", "route", "show", "default"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return route.match(/\bdefault\s+via\s+([0-9.]+)/)?.[1];
}

const listenHost = (process.env.ERASEGRAPH_WSL_GATEWAY ?? detectWslGateway())?.trim();
if (listenHost === undefined || isIP(listenHost) !== 4 || !/^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./.test(listenHost)) {
  throw new Error("Could not resolve a private IPv4 WSL gateway. Set ERASEGRAPH_WSL_GATEWAY explicitly.");
}

const listenPort = Number(process.env.ERASEGRAPH_WSL_BRIDGE_PORT ?? 8877);
if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65_535) {
  throw new Error("ERASEGRAPH_WSL_BRIDGE_PORT must be a valid TCP port.");
}

const server = createServer((incoming, outgoing) => {
  const path = new URL(incoming.url ?? "/", "http://bridge.invalid").pathname;
  if (path === "/healthz" && incoming.method === "GET") {
    outgoing.writeHead(200, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ status: "ok", target: "loopback-only EraseGraph MCP" }));
    return;
  }
  if (path !== "/mcp" || !["GET", "POST", "DELETE"].includes(incoming.method ?? "")) {
    outgoing.writeHead(404).end();
    return;
  }
  if (!incoming.headers.authorization?.startsWith("Bearer ")) {
    outgoing.writeHead(401).end();
    return;
  }

  const headers = { ...incoming.headers, host: `${upstream.hostname}:${upstream.port || "80"}` };
  const forwarded = request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      method: incoming.method,
      path: incoming.url,
      headers,
    },
    (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    },
  );
  forwarded.on("error", () => {
    if (!outgoing.headersSent) outgoing.writeHead(502);
    outgoing.end("MCP loopback target unavailable");
  });
  incoming.on("error", () => forwarded.destroy());
  incoming.pipe(forwarded);
});

server.listen(listenPort, listenHost, () => {
  console.log(`WSL-scoped MCP bridge ready at http://${listenHost}:${listenPort}/mcp.`);
  console.log("Only authenticated MCP traffic is forwarded; secrets are not logged.");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
