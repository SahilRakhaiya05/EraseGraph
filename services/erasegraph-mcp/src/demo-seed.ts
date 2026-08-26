import {
  DEMO_PURPOSE,
  DEMO_REQUEST_ID,
  DEMO_SUBJECT_ID,
  type DemoSeed,
  type SeedMinioObject,
  type SeedPostgresRecord
} from "./domain.js";
import { canonicalJson, sha256 } from "./hashing.js";

function postgresRecord(args: {
  resourceId: string;
  label: string;
  category: string;
  purposes: string[];
  retentionClass: SeedPostgresRecord["retentionClass"];
  payload: Record<string, unknown>;
  createdAt: string;
}): SeedPostgresRecord {
  const serialized = canonicalJson(args.payload);
  return {
    system: "postgres",
    resourceId: args.resourceId,
    subjectId: DEMO_SUBJECT_ID,
    label: args.label,
    category: args.category,
    purposes: args.purposes,
    retentionClass: args.retentionClass,
    payload: args.payload,
    fingerprint: sha256(serialized),
    sizeBytes: Buffer.byteLength(serialized),
    createdAt: args.createdAt
  };
}

function minioObject(args: {
  resourceId: string;
  label: string;
  category: string;
  purposes: string[];
  retentionClass: SeedMinioObject["retentionClass"];
  contentType: string;
  content: string;
  createdAt: string;
}): SeedMinioObject {
  const content = Buffer.from(args.content, "utf8");
  return {
    system: "minio",
    resourceId: args.resourceId,
    subjectId: DEMO_SUBJECT_ID,
    label: args.label,
    category: args.category,
    purposes: args.purposes,
    retentionClass: args.retentionClass,
    contentType: args.contentType,
    content,
    fingerprint: sha256(args.content),
    sizeBytes: content.byteLength,
    createdAt: args.createdAt
  };
}

export function createDemoSeed(now: Date): DemoSeed {
  const createdAt = now.toISOString();
  const deadlineAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000).toISOString();

  return {
    request: {
      id: DEMO_REQUEST_ID,
      subjectId: DEMO_SUBJECT_ID,
      subjectName: "Maya Chen",
      email: "maya.chen@erasegraph.example.test",
      purpose: DEMO_PURPOSE,
      status: "pending",
      receivedAt: createdAt,
      deadlineAt,
      verified: true
    },
    postgresRecords: [
      postgresRecord({
        resourceId: "pg-account-C1842",
        label: "Active customer account",
        category: "account",
        purposes: ["account_service"],
        retentionClass: "none",
        payload: {
          subjectId: DEMO_SUBJECT_ID,
          email: "maya.chen@erasegraph.example.test",
          status: "active"
        },
        createdAt
      }),
      postgresRecord({
        resourceId: "pg-training-profile-C1842",
        label: "Model-training profile",
        category: "training_profile",
        purposes: [DEMO_PURPOSE],
        retentionClass: "none",
        payload: {
          subjectId: DEMO_SUBJECT_ID,
          email: "maya.chen@erasegraph.example.test",
          cohort: "synthetic-demo-2026",
          preferenceSignals: ["documentation", "accessibility"]
        },
        createdAt
      }),
      postgresRecord({
        resourceId: "pg-embedding-C1842-001",
        label: "Training-text embedding row",
        category: "embedding",
        purposes: [DEMO_PURPOSE],
        retentionClass: "none",
        payload: {
          subjectId: DEMO_SUBJECT_ID,
          source: "synthetic-interview-001",
          vectorPreview: [0.01842, -0.01842, 0.1842]
        },
        createdAt
      }),
      postgresRecord({
        resourceId: "pg-consent-proof-C1842",
        label: "Consent history receipt",
        category: "consent_history",
        purposes: [DEMO_PURPOSE],
        retentionClass: "consent_proof",
        payload: {
          subjectId: DEMO_SUBJECT_ID,
          email: "maya.chen@erasegraph.example.test",
          purpose: DEMO_PURPOSE,
          event: "synthetic_consent_granted"
        },
        createdAt
      }),
      postgresRecord({
        resourceId: "pg-billing-C1842-2026-001",
        label: "Billing invoice record",
        category: "billing",
        purposes: ["billing"],
        retentionClass: "billing_record",
        payload: {
          subjectId: DEMO_SUBJECT_ID,
          email: "billing.c1842@erasegraph.example.test",
          invoice: "SYNTH-INV-C1842-001",
          amount: "0.00"
        },
        createdAt
      }),
      postgresRecord({
        resourceId: "pg-legal-hold-C1842",
        label: "Configured legal-hold record",
        category: "legal",
        purposes: [DEMO_PURPOSE],
        retentionClass: "legal_hold",
        payload: {
          subjectId: DEMO_SUBJECT_ID,
          caseReference: "SYNTHETIC-HOLD-C1842",
          reason: "Demonstrates a configured retention exception; not a legal conclusion."
        },
        createdAt
      })
    ],
    minioObjects: [
      minioObject({
        resourceId: "subjects/C-1842/model-training/interview-audio.txt",
        label: "Synthetic interview audio placeholder",
        category: "training_audio",
        purposes: [DEMO_PURPOSE],
        retentionClass: "none",
        contentType: "text/plain",
        content: "Synthetic audio placeholder for C-1842 at erasegraph.example.test. No real person or recording.",
        createdAt
      }),
      minioObject({
        resourceId: "subjects/C-1842/model-training/interview-transcript.json",
        label: "Synthetic training transcript",
        category: "training_transcript",
        purposes: [DEMO_PURPOSE],
        retentionClass: "none",
        contentType: "application/json",
        content: canonicalJson({
          subjectId: DEMO_SUBJECT_ID,
          email: "maya.chen@erasegraph.example.test",
          transcript: "Synthetic demonstration text only."
        }),
        createdAt
      }),
      minioObject({
        resourceId: "subjects/C-1842/billing/invoice-artifact.txt",
        label: "Billing invoice artifact",
        category: "billing",
        purposes: ["billing"],
        retentionClass: "billing_record",
        contentType: "text/plain",
        content: "Synthetic invoice artifact SYNTH-INV-C1842-001 for billing.c1842@erasegraph.example.test.",
        createdAt
      }),
      minioObject({
        resourceId: "subjects/C-1842/legal/hold-evidence.txt",
        label: "Configured hold evidence",
        category: "legal",
        purposes: [DEMO_PURPOSE],
        retentionClass: "legal_hold",
        contentType: "text/plain",
        content: "Synthetic hold evidence for C-1842. Demonstration data only; not legal advice.",
        createdAt
      })
    ]
  };
}
