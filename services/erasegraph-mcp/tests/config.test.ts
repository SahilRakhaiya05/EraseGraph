import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("runtime configuration", () => {
  it("defaults to the real Postgres and MinIO adapter", () => {
    const config = loadConfig({});
    expect(config.storeMode).toBe("real");
    expect(config.host).toBe("127.0.0.1");
    expect(config.minio.useSSL).toBe(false);
  });

  it("offers an explicit disposable memory mode for protocol previews", () => {
    expect(loadConfig({ STORE_MODE: "memory" }).storeMode).toBe("memory");
  });

  it("rejects broad network binding", () => {
    expect(() => loadConfig({ HOST: "0.0.0.0" })).toThrow();
  });
});
