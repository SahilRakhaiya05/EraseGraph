import type { Express, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { DEMO_REQUEST_ID } from "./domain.js";
import {
  executeInputSchema,
  rehearsalInputSchema,
  verifyInputSchema,
  type EraseGraphControlPlane
} from "./control-plane.js";
import { normalizeError } from "./errors.js";

type JsonObject = Record<string, unknown>;

function success(value: JsonObject): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value
  };
}

async function invoke(operation: () => Promise<JsonObject>): Promise<CallToolResult> {
  try {
    return success(await operation());
  } catch (error) {
    const normalized = normalizeError(error);
    const body = {
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details === undefined ? {} : { details: normalized.details })
      }
    };
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
      structuredContent: body
    };
  }
}

export function createEraseGraphMcpServer(controlPlane: EraseGraphControlPlane): McpServer {
  const server = new McpServer({ name: "erasegraph-control-plane", version: "0.1.0" });
  const requestIdShape = {
    requestId: z.string().min(1).default(DEMO_REQUEST_ID)
  };

  server.registerTool(
    "get_consent_request",
    {
      title: "Get consent request",
      description: "Read the synthetic purpose-scoped consent withdrawal request.",
      inputSchema: requestIdShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (input) => invoke(async () => ({ request: await controlPlane.getConsentRequest(input) }))
  );

  server.registerTool(
    "search_postgres_records",
    {
      title: "Search Postgres records",
      description: "Discover current Postgres records for the request subject and show server policy decisions.",
      inputSchema: requestIdShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (input) => invoke(async () => controlPlane.searchResources(input, "postgres"))
  );

  server.registerTool(
    "search_minio_objects",
    {
      title: "Search MinIO objects",
      description: "Discover current MinIO objects for the request subject and show server policy decisions.",
      inputSchema: requestIdShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (input) => invoke(async () => controlPlane.searchResources(input, "minio"))
  );

  server.registerTool(
    "get_retention_policy",
    {
      title: "Get retention policy",
      description:
        "Read the deterministic demo retention policy. The response is operational policy, not a legal conclusion.",
      inputSchema: requestIdShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (input) => invoke(async () => controlPlane.getRetentionPolicy(input))
  );

  server.registerTool(
    "submit_erasure_rehearsal",
    {
      title: "Submit erasure rehearsal",
      description:
        "Submit a complete non-destructive proposal. The server recomputes policy, rejects unsafe actions, fingerprints source state, and persists a plan awaiting approval.",
      inputSchema: rehearsalInputSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (input) => invoke(async () => ({ plan: await controlPlane.submitErasureRehearsal(input) }))
  );

  server.registerTool(
    "execute_approved_plan",
    {
      title: "Execute approved erasure plan",
      description:
        "DESTRUCTIVE: physically deletes only server-authorized resources after explicit approval. Requires the exact latest plan hash and an idempotency key; stale plans are blocked.",
      inputSchema: executeInputSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
    },
    async (input) => invoke(async () => ({ execution: await controlPlane.executeApprovedPlan(input) }))
  );

  server.registerTool(
    "verify_plan_execution",
    {
      title: "Verify erasure execution",
      description:
        "Independently rechecks that deletion targets are absent and protected retention records remain present.",
      inputSchema: verifyInputSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (input) => invoke(async () => ({ verification: await controlPlane.verifyPlanExecution(input) }))
  );

  server.registerTool(
    "export_evidence_packet",
    {
      title: "Export evidence packet",
      description:
        "Return request, plan, execution, verification, and SHA-256 audit-chain evidence with a non-compliance disclaimer.",
      inputSchema: requestIdShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (input) => invoke(async () => ({ evidence: await controlPlane.exportEvidencePacket(input) }))
  );

  return server;
}

function methodNotAllowed(res: Response): void {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32_000, message: "Method not allowed for stateless Streamable HTTP." },
    id: null
  });
}

export function mountMcpEndpoint(app: Express, controlPlane: EraseGraphControlPlane): void {
  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createEraseGraphMcpServer(controlPlane);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        const normalized = normalizeError(error);
        res.status(normalized.status).json({
          jsonrpc: "2.0",
          error: { code: -32_603, message: normalized.message, data: { code: normalized.code } },
          id: null
        });
      }
    }
  });
  app.get("/mcp", (_req, res) => methodNotAllowed(res));
  app.delete("/mcp", (_req, res) => methodNotAllowed(res));
}
