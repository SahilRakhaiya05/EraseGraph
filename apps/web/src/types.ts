export type RecordAction = "delete" | "retain" | "anonymize" | "withdraw" | "none";

export type RecordStatus =
  | "present"
  | "found"
  | "discovered"
  | "planned"
  | "deleted"
  | "retained"
  | "anonymized"
  | "withdrawn"
  | "deletion_failed"
  | "missing";

export interface SubjectRequest {
  id: string;
  subjectId: string;
  subjectName: string;
  email: string;
  purpose: string;
  status: string;
  receivedAt: string;
  deadlineAt: string;
  verified: boolean;
}

export interface DataRecord {
  id: string;
  label: string;
  category: string;
  purposes?: string[];
  retentionClass?: string;
  fingerprint?: string;
  action: RecordAction;
  status: RecordStatus;
  reason?: string;
}

export interface DataSystem {
  id: string;
  name: string;
  kind: string;
  status: string;
  recordCount: number;
  records: DataRecord[];
}

export interface ErasurePlan {
  hash: string;
  status: string;
  deleteCount: number;
  retainCount: number;
  anonymizeCount: number;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  type: string;
  message: string;
  system?: string;
  createdAt: string;
  hash: string;
}

export interface VerificationResult {
  status: string;
  checkedAt: string;
  deleted: number;
  retained: number;
  failures: number;
}

export interface MissionState {
  request: SubjectRequest;
  systems: DataSystem[];
  plan: ErasurePlan | null;
  audit: AuditEvent[];
  verification: VerificationResult | null;
}

export type ConnectionStatus = "connecting" | "live" | "preview" | "stale";
