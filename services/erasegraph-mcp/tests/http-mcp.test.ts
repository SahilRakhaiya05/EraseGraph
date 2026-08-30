import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { EraseGraphControlPlane } from "../src/control-plane.js";
import { DEMO_REQUEST_ID } from "../src/domain.js";
import { MemoryEraseGraphStore } from "../src/memory-store.js";

const MCP_TOKEN = "test-only-erasegraph-token-at-least-32-characters";

describe("HTTP surfaces", () => {
  let server: Server;
  let baseUrl: string;
  let controlPlane: EraseGraphControlPlane;

  beforeEach(async () => {
    controlPlane = new EraseGraphControlPlane({ store: new MemoryEraseGraphStore() });
    await controlPlane.initialize();
    server = createServer(createApp(controlPlane, { mcpBearerToken: MCP_TOKEN }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error)))
    );
    await controlPlane.close();
  });

  it("serves the stable UI state contract", async () => {
    const response = await fetch(`${baseUrl}/api/state`);
    const state = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(Object.keys(state).sort()).toEqual(["audit", "plan", "request", "systems", "verification"]);
    expect(state.request).toMatchObject({ id: DEMO_REQUEST_ID, subjectId: "C-1842", purpose: "model_training" });
    expect(state.systems).toHaveLength(2);
    const systems = state.systems as Array<{ records: Array<Record<string, unknown>> }>;
    expect(systems[0]?.records[0]).toMatchObject({
      purposes: expect.any(Array),
      retentionClass: expect.any(String),
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
  });

  it("exposes all eight tools over stateless Streamable HTTP", async () => {
    const client = new Client({ name: "erasegraph-test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${MCP_TOKEN}` } }
    });
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
        [
          "execute_approved_plan",
          "export_evidence_packet",
          "get_consent_request",
          "get_retention_policy",
          "search_minio_objects",
          "search_postgres_records",
          "submit_erasure_rehearsal",
          "verify_plan_execution"
        ].sort()
      );
      const executeTool = listed.tools.find((tool) => tool.name === "execute_approved_plan");
      expect(executeTool?.annotations).toMatchObject({ destructiveHint: true, idempotentHint: true });

      const result = await client.callTool({
        name: "get_consent_request",
        arguments: { requestId: DEMO_REQUEST_ID }
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ request: { id: DEMO_REQUEST_ID } });
    } finally {
      await client.close();
    }
  });

  it("rejects unauthenticated MCP clients", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })
    });
    expect(response.status).toBe(401);
  });

  it("rejects hostile browser origins and requires explicit synthetic reset confirmation", async () => {
    const hostile = await fetch(`${baseUrl}/api/demo/reset`, {
      method: "POST",
      headers: { Origin: "https://attacker.example", "X-EraseGraph-Demo": "reset" }
    });
    expect(hostile.status).toBe(403);

    const unconfirmed = await fetch(`${baseUrl}/api/demo/reset`, { method: "POST" });
    expect(unconfirmed.status).toBe(403);

    const confirmed = await fetch(`${baseUrl}/api/demo/reset`, {
      method: "POST",
      headers: { "X-EraseGraph-Demo": "reset" }
    });
    expect(confirmed.status).toBe(200);
  });

  it("allows same-origin hosted requests and still rejects cross-origin browsers", async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error)))
    );
    await controlPlane.close();

    controlPlane = new EraseGraphControlPlane({ store: new MemoryEraseGraphStore() });
    await controlPlane.initialize();
    server = createServer(createApp(controlPlane, { mcpBearerToken: MCP_TOKEN, requestPolicy: "hosted" }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    const host = `127.0.0.1:${address.port}`;

    const allowed = await fetch(`${baseUrl}/api/state`, {
      headers: { Host: host, Origin: `http://${host}` }
    });
    expect(allowed.status).toBe(200);

    const blocked = await fetch(`${baseUrl}/api/state`, {
      headers: { Host: host, Origin: "https://attacker.example" }
    });
    expect(blocked.status).toBe(403);
  });
});
