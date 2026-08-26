import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { EraseGraphControlPlane } from "./control-plane.js";
import { MemoryEraseGraphStore } from "./memory-store.js";
import { PostgresMinioStore } from "./postgres-minio-store.js";
import { resolveMcpBearerToken } from "./local-token.js";

const config = loadConfig();
const mcpBearerToken = resolveMcpBearerToken(config.mcpBearerToken);
const store = config.storeMode === "memory" ? new MemoryEraseGraphStore() : new PostgresMinioStore(config);
const controlPlane = new EraseGraphControlPlane({ store });

await controlPlane.initialize();

const httpServer = createServer(createApp(controlPlane, { mcpBearerToken }));
httpServer.listen(config.port, config.host, () => {
  console.log(`EraseGraph control plane listening on http://${config.host}:${config.port}`);
  if (config.storeMode === "memory") {
    console.warn("STORE_MODE=memory is a disposable preview adapter; use the default real mode for judging.");
  }
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; closing EraseGraph control plane.`);
  httpServer.close(async () => {
    await controlPlane.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
