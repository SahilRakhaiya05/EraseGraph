import type {
  AuditEvent,
  ConsentRequest,
  DemoSeed,
  ErasurePlan,
  ExecutionReceipt,
  HealthState,
  ResourceSnapshot,
  SystemId,
  VerificationReport
} from "./domain.js";

export type ConditionalDeleteResult =
  | { status: "deleted" }
  | { status: "missing" }
  | { status: "changed" };

export interface EraseGraphStore {
  initialize(): Promise<void>;
  close(): Promise<void>;
  health(): Promise<HealthState>;
  resetDemo(seed: DemoSeed): Promise<void>;

  getRequest(requestId: string): Promise<ConsentRequest | null>;
  updateRequest(request: ConsentRequest): Promise<void>;

  listResources(subjectId: string, system?: SystemId): Promise<ResourceSnapshot[]>;
  resourceExists(system: SystemId, resourceId: string): Promise<boolean>;
  deleteResourceIfUnchanged(expected: ResourceSnapshot): Promise<ConditionalDeleteResult>;

  savePlan(plan: ErasurePlan): Promise<void>;
  getLatestPlan(requestId: string): Promise<ErasurePlan | null>;
  getPlan(requestId: string, planHash: string): Promise<ErasurePlan | null>;
  updatePlan(plan: ErasurePlan): Promise<void>;

  getExecution(requestId: string, idempotencyKey: string): Promise<ExecutionReceipt | null>;
  getLatestExecution(requestId: string): Promise<ExecutionReceipt | null>;
  saveExecution(execution: ExecutionReceipt): Promise<void>;

  getLatestVerification(requestId: string): Promise<VerificationReport | null>;
  saveVerification(verification: VerificationReport): Promise<void>;

  listAuditEvents(requestId: string): Promise<AuditEvent[]>;
  saveAuditEvent(event: AuditEvent): Promise<void>;
}
