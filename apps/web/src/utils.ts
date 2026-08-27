import type { DataSystem, MissionState, RecordAction } from "./types";

export type MissionPhase = "ready" | "discovering" | "approval" | "executing" | "verified" | "failed";

export function deriveMissionPhase(state: MissionState): MissionPhase {
  const verificationStatus = state.verification?.status.toLowerCase();
  const requestStatus = state.request.status.toLowerCase();
  if (verificationStatus?.match(/fail|residual/) || requestStatus === "verification_failed") return "failed";
  if (verificationStatus?.match(/pass|verified|complete/)) return "verified";

  if (requestStatus.match(/executed|verifying/)) return "executing";
  if (state.plan) return "approval";
  if (state.audit.length > 1 || requestStatus.match(/discover|investigat|running/)) return "discovering";
  return "ready";
}

export function titleCase(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function shortHash(value: string, size = 10): string {
  if (!value) return "pending";
  return value.length <= size ? value : `${value.slice(0, size)}…`;
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function actionCounts(system: DataSystem): Record<RecordAction, number> {
  return system.records.reduce<Record<RecordAction, number>>(
    (counts, record) => {
      counts[record.action] += 1;
      return counts;
    },
    { delete: 0, retain: 0, anonymize: 0, withdraw: 0, none: 0 },
  );
}

export function systemTone(system: DataSystem): "neutral" | "danger" | "warning" | "success" {
  if (system.records.some((record) => ["deleted", "withdrawn", "anonymized"].includes(record.status))) {
    return "success";
  }
  const counts = actionCounts(system);
  if (counts.delete + counts.withdraw + counts.anonymize > 0) return "danger";
  if (counts.retain > 0) return "warning";
  return "neutral";
}
