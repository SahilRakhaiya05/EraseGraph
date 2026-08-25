import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const configSchema = z.object({
  STORE_MODE: z.enum(["real", "memory"]).default("real"),
  MCP_BEARER_TOKEN: z.string().min(32).optional(),
  HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://erasegraph:erasegraph_local@127.0.0.1:54329/erasegraph"),
  MINIO_ENDPOINT: z.string().min(1).default("127.0.0.1"),
  MINIO_PORT: z.coerce.number().int().min(1).max(65_535).default(59_000),
  MINIO_USE_SSL: booleanFromString.default(false),
  MINIO_ACCESS_KEY: z.string().min(3).default("erasegraph_local"),
  MINIO_SECRET_KEY: z.string().min(8).default("erasegraph_local_secret"),
  MINIO_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/).default("erasegraph-demo")
});

export interface AppConfig {
  storeMode: "real" | "memory";
  mcpBearerToken?: string;
  host: "127.0.0.1";
  port: number;
  databaseUrl: string;
  minio: {
    endPoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    bucket: string;
  };
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(environment);
  return {
    storeMode: parsed.STORE_MODE,
    ...(parsed.MCP_BEARER_TOKEN === undefined ? {} : { mcpBearerToken: parsed.MCP_BEARER_TOKEN }),
    host: parsed.HOST,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    minio: {
      endPoint: parsed.MINIO_ENDPOINT,
      port: parsed.MINIO_PORT,
      useSSL: parsed.MINIO_USE_SSL,
      accessKey: parsed.MINIO_ACCESS_KEY,
      secretKey: parsed.MINIO_SECRET_KEY,
      bucket: parsed.MINIO_BUCKET
    }
  };
}
