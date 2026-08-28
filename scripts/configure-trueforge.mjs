#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trueForgeUrl = (process.env.TRUEFORGE_URL ?? "http://127.0.0.1:8790").replace(/\/$/, "");
const mcpUrl = process.env.ERASEGRAPH_MCP_URL ?? "http://127.0.0.1:8787/mcp";
const openAiApiKey = process.env.OPENAI_API_KEY?.trim();

if (!openAiApiKey) {
  throw new Error("OPENAI_API_KEY is required to configure the TrueForge OpenAI provider.");
}

const tokenPath = resolve(root, ".data", "erasegraph-mcp-token");
const agentPath = resolve(root, "agent", "erasegraph.agent.json");
const bearerToken = (await readFile(tokenPath, "utf8")).trim();
const agentDefinition = JSON.parse(await readFile(agentPath, "utf8"));

if (bearerToken.length < 32) {
  throw new Error("The EraseGraph MCP token is missing or unexpectedly short. Start the API once, then retry.");
}

async function request(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${trueForgeUrl}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Could not reach TrueForge at ${trueForgeUrl}. Start TrueForge, then retry.`);
  }

  if (!response.ok) {
    // Deliberately omit response bodies: provider and connector payloads contain secrets.
    throw new Error(`${method} ${path} failed with HTTP ${response.status}.`);
  }

  if (response.status === 204) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

function collection(payload, keys) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

const modelProperties = {
  context_length: 1_050_000,
  max_output_tokens: 128_000,
  reasoning_efforts: ["none", "low", "medium", "high", "xhigh", "max"],
};

const models = [
  {
    model_id: "gpt-5.4-mini",
    name: "gpt-5-4-mini",
    properties: {
      context_length: 400_000,
      max_output_tokens: 128_000,
      reasoning_efforts: ["none", "low", "medium", "high", "xhigh"],
    },
  },
  {
    model_id: "gpt-5.5",
    name: "gpt-5-5",
    properties: {
      context_length: 1_050_000,
      max_output_tokens: 128_000,
      reasoning_efforts: ["none", "low", "medium", "high", "xhigh"],
    },
  },
  { model_id: "gpt-5.6-luna", name: "gpt-5-6-luna", properties: modelProperties },
  { model_id: "gpt-5.6-sol", name: "gpt-5-6-sol", properties: modelProperties },
  { model_id: "gpt-5.6-terra", name: "gpt-5-6-terra", properties: modelProperties },
];

await request("/healthz");
console.log(`TrueForge is healthy at ${trueForgeUrl}.`);

await request("/api/v1/settings/model-providers", {
  method: "PUT",
  body: {
    manifest: {
      type: "openai",
      auth: { api_key: openAiApiKey },
      base_url: "https://api.openai.com/v1",
      models,
    },
  },
});
console.log("Configured the OpenAI model provider.");

await request("/api/v1/settings/mcp-servers", {
  method: "PUT",
  body: {
    manifest: {
      type: "remote",
      name: "erasegraph",
      url: mcpUrl,
      description: "Purpose-scoped consent withdrawal with deterministic policy and fresh verification.",
      auth: {
        type: "header",
        headers: { Authorization: `Bearer ${bearerToken}` },
      },
    },
  },
});
console.log(`Configured the EraseGraph MCP connector at ${mcpUrl}.`);

const agentPayload = await request("/api/v1/agents");
const agents = collection(agentPayload, ["agents", "items"]);
const existingAgent = agents.find((agent) => agent?.name === agentDefinition.name);
const existingId = existingAgent?.id ?? existingAgent?.agent_id;

if (existingId) {
  await request(`/api/v1/agents/${encodeURIComponent(existingId)}`, {
    method: "PUT",
    body: { manifest: agentDefinition.manifest },
  });
  console.log(`Updated the ${agentDefinition.name} agent.`);
} else {
  await request("/api/v1/agents", {
    method: "POST",
    body: agentDefinition,
  });
  console.log(`Created the ${agentDefinition.name} agent.`);
}

const discoveryPayload = await request("/api/v1/mcp-servers/erasegraph/tools");
const discoveredTools = collection(discoveryPayload, ["tools", "items"])
  .map((tool) => tool?.name ?? tool?.tool_name)
  .filter(Boolean);
const expectedTools = [
  "get_consent_request",
  "search_postgres_records",
  "search_minio_objects",
  "get_retention_policy",
  "submit_erasure_rehearsal",
  "execute_approved_plan",
  "verify_plan_execution",
  "export_evidence_packet",
];
const missingTools = expectedTools.filter((name) => !discoveredTools.includes(name));

if (missingTools.length > 0) {
  throw new Error(`TrueForge connector validation failed; missing ${missingTools.length} expected tool(s).`);
}

console.log(`Validated ${expectedTools.length}/${expectedTools.length} EraseGraph tools through TrueForge.`);
console.log("TrueForge configuration is ready. Secrets were not printed.");
