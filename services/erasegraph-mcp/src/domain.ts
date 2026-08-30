import { z } from "zod";

export const DEMO_SUBJECT_ID = "C-1842";
export const DEMO_REQUEST_ID = "ER-2048";
export const DEMO_PURPOSE = "model_training";
export const AUDIT_GENESIS_HASH = "0".repeat(64);

export const systemSchema = z.enum(["postgres", "minio"]);
export type SystemId = z.infer<typeof systemSchema>;

export const planActionSchema = z.enum(["delete", "retain", "anonymize"]);
export type PlanAction = z.infer<typeof planActionSchema>;

export const retentionClassSchema = z.enum(["none", "legal_hold", "billing_record", "consent_proof"]);
export type RetentionClass = z.infer<typeof retentionClassSchema>;

export const requestStatusSchema = z.enum([
  "pending",
  "awaiting_approval",
  "executed",
  "verified",
  "verification_failed"
]);
export type RequestStatus = z.infer<typeof requestStatusSchema>;

export const consentRequestSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string().min(1),
  subjectName: z.string().min(1),
  email: z.string().email().endsWith(".example.test"),
  purpose: z.literal(DEMO_PURPOSE),
  status: requestStatusSchema,
  receivedAt: z.string().datetime(),
  deadlineAt: z.string().datetime(),
  verified: z.boolean()
});
export type ConsentRequest = z.infer<typeof consentRequestSchema>;

export const resourceSnapshotSchema = z.object({
  system: systemSchema,
  resourceId: z.string().min(1),
  subjectId: z.literal(DEMO_SUBJECT_ID),
  label: z.string().min(1),
  category: z.string().min(1),
  purposes: z.array(z.string().min(1)).min(1),
  retentionClass: retentionClassSchema,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  versionId: z.string().min(1).optional()
});
export type ResourceSnapshot = z.infer<typeof resourceSnapshotSchema>;

export interface SeedPostgresRecord extends ResourceSnapshot {
  system: "postgres";
  payload: Record<string, unknown>;
}

export interface SeedMinioObject extends ResourceSnapshot {
  system: "minio";
  contentType: string;
  content: Uint8Array;
}

export interface DemoSeed {
  request: ConsentRequest;
  postgresRecords: SeedPostgresRecord[];
  minioObjects: SeedMinioObject[];
}

export const proposedPlanItemSchema = z.object({
  system: systemSchema,
  resourceId: z.string().min(1).max(512),
  action: planActionSchema
});
export type ProposedPlanItem = z.infer<typeof proposedPlanItemSchema>;

export const planItemSchema = resourceSnapshotSchema.extend({
  action: planActionSchema,
  reason: z.string().min(1)
});
export type PlanItem = z.infer<typeof planItemSchema>;

export const planStatusSchema = z.enum(["awaiting_approval", "executed", "verified", "verification_failed"]);
export type PlanStatus = z.infer<typeof planStatusSchema>;

export const erasurePlanSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  purpose: z.literal(DEMO_PURPOSE),
  sourceStateHash: z.string().regex(/^[a-f0-9]{64}$/),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: planStatusSchema,
  deleteCount: z.number().int().nonnegative(),
  retainCount: z.number().int().nonnegative(),
  anonymizeCount: z.number().int().nonnegative(),
  items: z.array(planItemSchema).min(1),
  createdAt: z.string().datetime()
});
export type ErasurePlan = z.infer<typeof erasurePlanSchema>;

export const executionReceiptSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().min(8),
  approvedBy: z.string().min(2),
  approvedAt: z.string().datetime(),
  executedAt: z.string().datetime(),
  deleted: z.array(z.string()),
  retained: z.array(z.string()),
  anonymized: z.array(z.string())
});
export type ExecutionReceipt = z.infer<typeof executionReceiptSchema>;

export const verificationReportSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["passed", "failed"]),
  checkedAt: z.string().datetime(),
  deleted: z.array(z.string()),
  retained: z.array(z.string()),
  failures: z.array(
    z.object({
      system: systemSchema,
      resourceId: z.string(),
      expected: z.string(),
      actual: z.string()
    })
  )
});
export type VerificationReport = z.infer<typeof verificationReportSchema>;

export const auditEventSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().positive(),
  requestId: z.string().min(1),
  type: z.string().min(1),
  message: z.string().min(1),
  system: systemSchema.optional(),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  previousHash: z.string().regex(/^[a-f0-9]{64}$/),
  hash: z.string().regex(/^[a-f0-9]{64}$/)
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export interface AuditEventInput {
  requestId: string;
  type: string;
  message: string;
  system?: SystemId;
  details?: Record<string, unknown>;
}

export interface EvidencePacket {
  schemaVersion: "1.0";
  generatedAt: string;
  disclaimer: string;
  request: ConsentRequest;
  plan: ErasurePlan | null;
  execution: ExecutionReceipt | null;
  verification: VerificationReport | null;
  audit: AuditEvent[];
  auditChain: {
    valid: boolean;
    eventCount: number;
    headHash: string;
    externallyAnchored: false;
    limitation: string;
  };
}

export interface UiState {
  request: ConsentRequest;
  systems: Array<{
    id: SystemId;
    name: string;
    kind: "database" | "object_store";
    status: "connected" | "error";
    recordCount: number;
    records: Array<{
      id: string;
      label: string;
      category: string;
      purposes: string[];
      retentionClass: RetentionClass;
      fingerprint: string;
      action: PlanAction;
      status: string;
      reason?: string;
    }>;
  }>;
  plan: {
    hash: string;
    status: PlanStatus;
    deleteCount: number;
    retainCount: number;
    anonymizeCount: number;
    createdAt: string;
  } | null;
  audit: Array<{
    id: string;
    type: string;
    message: string;
    system?: SystemId;
    createdAt: string;
    hash: string;
  }>;
  verification: {
    status: "passed" | "failed";
    checkedAt: string;
    deleted: number;
    retained: number;
    failures: number;
  } | null;
}

export interface HealthState {
  postgres: "up" | "down";
  minio: "up" | "down";
}
