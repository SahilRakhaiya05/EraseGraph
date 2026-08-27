import { demoState } from "./demoState";
import type { MissionState } from "./types";
import { z } from "zod";

export const API_BASE_URL = (
  import.meta.env.VITE_ERASEGRAPH_API_URL ?? "http://127.0.0.1:8787"
).replace(/\/$/, "");

export const TRUEFORGE_BASE_URL = (
  import.meta.env.VITE_TRUEFORGE_URL ?? `${window.location.origin}/trueforge`
).replace(/\/$/, "");

const recordActionSchema = z.enum(["delete", "retain", "anonymize", "withdraw", "none"]);
const recordStatusSchema = z.enum([
  "present", "found", "discovered", "planned", "deleted", "retained", "anonymized", "withdrawn",
  "deletion_failed", "missing",
]);
const dataRecordSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  category: z.string().min(1),
  action: recordActionSchema,
  status: recordStatusSchema,
  reason: z.string().optional(),
});
const dataSystemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  status: z.string().min(1),
  recordCount: z.number().int().nonnegative().optional(),
  records: z.array(dataRecordSchema).default([]),
}).transform((system) => ({ ...system, recordCount: system.recordCount ?? system.records.length }));
const missionStateSchema = z.object({
  request: z.object({
    id: z.string().min(1),
    subjectId: z.string().min(1),
    subjectName: z.string().min(1),
    email: z.string().email(),
    purpose: z.string().min(1),
    status: z.string().min(1),
    receivedAt: z.string().min(1),
    deadlineAt: z.string().min(1),
    verified: z.boolean(),
  }),
  systems: z.array(dataSystemSchema),
  plan: z.object({
    hash: z.string().min(1),
    status: z.string().min(1),
    deleteCount: z.number().int().nonnegative(),
    retainCount: z.number().int().nonnegative(),
    anonymizeCount: z.number().int().nonnegative(),
    createdAt: z.string().min(1),
  }).nullable().default(null),
  audit: z.array(z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    message: z.string().min(1),
    system: z.string().optional(),
    createdAt: z.string().min(1),
    hash: z.string().min(1),
  })),
  verification: z.object({
    status: z.string().min(1),
    checkedAt: z.string().min(1),
    deleted: z.number().int().nonnegative(),
    retained: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
  }).nullable().default(null),
});

function asMissionState(value: unknown): MissionState {
  const result = missionStateSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`EraseGraph returned invalid state: ${result.error.issues[0]?.message ?? "schema mismatch"}`);
  }
  return result.data;
}

export async function fetchMissionState(signal?: AbortSignal): Promise<MissionState> {
  const response = await fetch(`${API_BASE_URL}/api/state`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Control plane responded with ${response.status}`);
  return asMissionState(await response.json());
}

export async function resetMission(): Promise<MissionState> {
  const response = await fetch(`${API_BASE_URL}/api/demo/reset`, {
    method: "POST",
    headers: { Accept: "application/json", "X-EraseGraph-Demo": "reset" },
  });
  if (!response.ok) throw new Error(`Reset failed with ${response.status}`);
  const payload = await response.json();
  return asMissionState(payload.state ?? payload);
}

export function evidencePacketUrl(requestId: string): string {
  return `${API_BASE_URL}/api/evidence/${encodeURIComponent(requestId)}`;
}

export function fallbackMissionState(): MissionState {
  return structuredClone(demoState);
}
