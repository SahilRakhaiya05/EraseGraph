import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function findServiceRoot(): string {
  let cursor = dirname(fileURLToPath(import.meta.url));
  while (dirname(cursor) !== cursor) {
    if (existsSync(join(cursor, "package.json")) && existsSync(join(cursor, "src"))) return cursor;
    cursor = dirname(cursor);
  }
  throw new Error("Unable to locate the EraseGraph service root for local token storage.");
}

export const DEFAULT_TOKEN_FILE = resolve(findServiceRoot(), "..", "..", ".data", "erasegraph-mcp-token");

function readToken(path: string): string {
  const token = readFileSync(path, "utf8").trim();
  if (token.length < 32) throw new Error(`MCP bearer token in ${path} is too short.`);
  return token;
}

export function resolveMcpBearerToken(explicitToken?: string, path = DEFAULT_TOKEN_FILE): string {
  if (explicitToken !== undefined) return explicitToken;

  try {
    return readToken(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const generated = randomBytes(32).toString("base64url");
  try {
    writeFileSync(path, `${generated}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return generated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return readToken(path);
  }
}
