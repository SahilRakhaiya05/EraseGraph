import { createApp } from "./app.js";
import { EraseGraphControlPlane } from "./control-plane.js";
import { resolveMcpBearerToken } from "./local-token.js";
import { MemoryEraseGraphStore } from "./memory-store.js";

let appPromise: Promise<ReturnType<typeof createApp>> | null = null;

/**
 * Hosted/Vercel entry: memory-backed control plane with same-origin request policy.
 * Persistent Postgres/MinIO remain the local judging path.
 */
export async function createHostedApp() {
  const configuredToken = process.env.MCP_BEARER_TOKEN?.trim();
  const mcpBearerToken = resolveMcpBearerToken(
    configuredToken && configuredToken.length >= 32 ? configuredToken : undefined,
    undefined,
    { allowEphemeral: true },
  );
  const controlPlane = new EraseGraphControlPlane({ store: new MemoryEraseGraphStore() });
  await controlPlane.initialize();
  return createApp(controlPlane, {
    mcpBearerToken,
    requestPolicy: "hosted",
  });
}

export async function getHostedApp() {
  appPromise ??= createHostedApp();
  return appPromise;
}

const app = await getHostedApp();
export default app;
