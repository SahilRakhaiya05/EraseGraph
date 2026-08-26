import { createHash } from "node:crypto";
import {
  AUDIT_GENESIS_HASH,
  type AuditEvent,
  type AuditEventInput,
  type ResourceSnapshot
} from "./domain.js";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)])
    );
  }

  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256(value: unknown): string {
  const input =
    typeof value === "string" || value instanceof Uint8Array
      ? value
      : canonicalJson(value);
  return createHash("sha256").update(input).digest("hex");
}

export function stateHash(resources: ResourceSnapshot[]): string {
  return sha256(
    resources
      .map((resource) => structuredClone(resource))
      .sort((left, right) => `${left.system}:${left.resourceId}`.localeCompare(`${right.system}:${right.resourceId}`))
  );
}

export function createAuditEvent(args: {
  input: AuditEventInput;
  previous: AuditEvent | undefined;
  id: string;
  createdAt: string;
}): AuditEvent {
  const sequence = (args.previous?.sequence ?? 0) + 1;
  const previousHash = args.previous?.hash ?? AUDIT_GENESIS_HASH;
  const unsigned = {
    id: args.id,
    sequence,
    requestId: args.input.requestId,
    type: args.input.type,
    message: args.input.message,
    ...(args.input.system === undefined ? {} : { system: args.input.system }),
    details: args.input.details ?? {},
    createdAt: args.createdAt,
    previousHash
  };

  return { ...unsigned, hash: sha256(unsigned) };
}

export function verifyAuditChain(events: AuditEvent[]): boolean {
  let expectedPreviousHash = AUDIT_GENESIS_HASH;
  let expectedSequence = 1;

  for (const event of events) {
    if (event.sequence !== expectedSequence || event.previousHash !== expectedPreviousHash) {
      return false;
    }
    const { hash, ...unsigned } = event;
    if (sha256(unsigned) !== hash) {
      return false;
    }
    expectedPreviousHash = hash;
    expectedSequence += 1;
  }

  return true;
}
