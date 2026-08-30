import { createHash, timingSafeEqual } from "node:crypto";
import express, { type ErrorRequestHandler, type Express } from "express";
import { DEMO_REQUEST_ID } from "./domain.js";
import type { EraseGraphControlPlane } from "./control-plane.js";
import { normalizeError } from "./errors.js";
import { mountMcpEndpoint } from "./mcp-server.js";

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;

export type RequestPolicy = "loopback" | "hosted";

interface AppOptions {
  mcpBearerToken: string;
  requestPolicy?: RequestPolicy;
}

function secretsMatch(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function isAllowedRequest(host: string | undefined, origin: string | undefined, policy: RequestPolicy): boolean {
  if (host === undefined || host.length === 0) return false;

  if (policy === "loopback") {
    return LOCAL_HOST.test(host) && (origin === undefined || LOCAL_ORIGIN.test(origin));
  }

  // Hosted/Vercel: only same-origin browser calls (or non-browser calls without Origin).
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string, host: string, policy: RequestPolicy): boolean {
  if (policy === "loopback") return LOCAL_ORIGIN.test(origin);
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function createApp(controlPlane: EraseGraphControlPlane, options: AppOptions): Express {
  const requestPolicy = options.requestPolicy ?? "loopback";
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.use((req, res, next) => {
    const host = req.header("host");
    const origin = req.header("origin");
    if (!isAllowedRequest(host, origin, requestPolicy)) {
      res.status(403).json({
        error: {
          code: requestPolicy === "loopback" ? "LOCAL_REQUEST_REQUIRED" : "ORIGIN_NOT_ALLOWED",
          message: requestPolicy === "loopback"
            ? "Only loopback requests are accepted."
            : "Only same-origin hosted requests are accepted.",
        },
      });
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (origin !== undefined && host !== undefined && isAllowedOrigin(origin, host, requestPolicy)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "content-type, mcp-protocol-version, x-erasegraph-demo");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use("/mcp", (req, res, next) => {
    const expected = `Bearer ${options.mcpBearerToken}`;
    if (!secretsMatch(req.header("authorization") ?? "", expected)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      res.status(401).json({ error: { code: "MCP_AUTH_REQUIRED", message: "Valid MCP bearer authentication is required." } });
      return;
    }
    next();
  });

  app.get("/health", async (_req, res) => {
    const health = await controlPlane.health();
    res.status(health.status === "ok" ? 200 : 503).json(health);
  });

  app.get("/api/state", async (req, res) => {
    const requestId = typeof req.query.requestId === "string" ? req.query.requestId : DEMO_REQUEST_ID;
    res.json(await controlPlane.getState(requestId));
  });

  app.post("/api/demo/reset", async (_req, res) => {
    if (_req.header("x-erasegraph-demo") !== "reset") {
      res.status(403).json({ error: { code: "RESET_CONFIRMATION_REQUIRED", message: "Explicit synthetic reset confirmation is required." } });
      return;
    }
    res.json(await controlPlane.resetDemo());
  });

  app.get("/api/evidence/:requestId", async (req, res) => {
    res.json(await controlPlane.exportEvidencePacket({ requestId: req.params.requestId }));
  });

  mountMcpEndpoint(app, controlPlane);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const normalized = normalizeError(error);
    res.status(normalized.status).json({
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details === undefined ? {} : { details: normalized.details })
      }
    });
  };
  app.use(errorHandler);
  return app;
}
