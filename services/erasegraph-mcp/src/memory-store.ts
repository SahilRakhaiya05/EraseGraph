import {
  auditEventSchema,
  consentRequestSchema,
  erasurePlanSchema,
  executionReceiptSchema,
  resourceSnapshotSchema,
  verificationReportSchema,
  type AuditEvent,
  type ConsentRequest,
  type DemoSeed,
  type ErasurePlan,
  type ExecutionReceipt,
  type HealthState,
  type ResourceSnapshot,
  type SystemId,
  type VerificationReport
} from "./domain.js";
import { canonicalJson } from "./hashing.js";
import type { ConditionalDeleteResult, EraseGraphStore } from "./store.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryEraseGraphStore implements EraseGraphStore {
  private requests = new Map<string, ConsentRequest>();
  protected resources = new Map<string, ResourceSnapshot>();
  private plans: ErasurePlan[] = [];
  private executions: ExecutionReceipt[] = [];
  private verifications: VerificationReport[] = [];
  private auditEvents: AuditEvent[] = [];

  async initialize(): Promise<void> {}

  async close(): Promise<void> {}

  async health(): Promise<HealthState> {
    return { postgres: "up", minio: "up" };
  }

  async resetDemo(seed: DemoSeed): Promise<void> {
    this.requests.clear();
    this.resources.clear();
    this.plans = [];
    this.executions = [];
    this.verifications = [];
    this.auditEvents = [];

    const request = consentRequestSchema.parse(seed.request);
    this.requests.set(request.id, clone(request));
    for (const resource of [...seed.postgresRecords, ...seed.minioObjects]) {
      const snapshot = resourceSnapshotSchema.parse(resource);
      this.resources.set(this.resourceKey(snapshot.system, snapshot.resourceId), clone(snapshot));
    }
  }

  async getRequest(requestId: string): Promise<ConsentRequest | null> {
    const request = this.requests.get(requestId);
    return request === undefined ? null : clone(request);
  }

  async updateRequest(request: ConsentRequest): Promise<void> {
    const parsed = consentRequestSchema.parse(request);
    this.requests.set(parsed.id, clone(parsed));
  }

  async listResources(subjectId: string, system?: SystemId): Promise<ResourceSnapshot[]> {
    return [...this.resources.values()]
      .filter((resource) => resource.subjectId === subjectId && (system === undefined || resource.system === system))
      .sort((left, right) => `${left.system}:${left.resourceId}`.localeCompare(`${right.system}:${right.resourceId}`))
      .map(clone);
  }

  async resourceExists(system: SystemId, resourceId: string): Promise<boolean> {
    return this.resources.has(this.resourceKey(system, resourceId));
  }

  async deleteResourceIfUnchanged(expected: ResourceSnapshot): Promise<ConditionalDeleteResult> {
    const parsedExpected = resourceSnapshotSchema.parse(expected);
    const key = this.resourceKey(parsedExpected.system, parsedExpected.resourceId);
    const current = this.resources.get(key);
    if (current === undefined) {
      return { status: "missing" };
    }
    if (canonicalJson(current) !== canonicalJson(parsedExpected)) {
      return { status: "changed" };
    }
    this.resources.delete(key);
    return { status: "deleted" };
  }

  async savePlan(plan: ErasurePlan): Promise<void> {
    this.plans.push(clone(erasurePlanSchema.parse(plan)));
  }

  async getLatestPlan(requestId: string): Promise<ErasurePlan | null> {
    const plan = this.plans.filter((entry) => entry.requestId === requestId).at(-1);
    return plan === undefined ? null : clone(plan);
  }

  async getPlan(requestId: string, planHash: string): Promise<ErasurePlan | null> {
    const plan = this.plans.find((entry) => entry.requestId === requestId && entry.planHash === planHash);
    return plan === undefined ? null : clone(plan);
  }

  async updatePlan(plan: ErasurePlan): Promise<void> {
    const parsed = erasurePlanSchema.parse(plan);
    const index = this.plans.findIndex((entry) => entry.id === parsed.id);
    if (index === -1) {
      this.plans.push(clone(parsed));
      return;
    }
    this.plans[index] = clone(parsed);
  }

  async getExecution(requestId: string, idempotencyKey: string): Promise<ExecutionReceipt | null> {
    const execution = this.executions.find(
      (entry) => entry.requestId === requestId && entry.idempotencyKey === idempotencyKey
    );
    return execution === undefined ? null : clone(execution);
  }

  async getLatestExecution(requestId: string): Promise<ExecutionReceipt | null> {
    const execution = this.executions.filter((entry) => entry.requestId === requestId).at(-1);
    return execution === undefined ? null : clone(execution);
  }

  async saveExecution(execution: ExecutionReceipt): Promise<void> {
    this.executions.push(clone(executionReceiptSchema.parse(execution)));
  }

  async getLatestVerification(requestId: string): Promise<VerificationReport | null> {
    const verification = this.verifications.filter((entry) => entry.requestId === requestId).at(-1);
    return verification === undefined ? null : clone(verification);
  }

  async saveVerification(verification: VerificationReport): Promise<void> {
    this.verifications.push(clone(verificationReportSchema.parse(verification)));
  }

  async listAuditEvents(requestId: string): Promise<AuditEvent[]> {
    return this.auditEvents
      .filter((entry) => entry.requestId === requestId)
      .sort((left, right) => left.sequence - right.sequence)
      .map(clone);
  }

  async saveAuditEvent(event: AuditEvent): Promise<void> {
    this.auditEvents.push(clone(auditEventSchema.parse(event)));
  }

  private resourceKey(system: SystemId, resourceId: string): string {
    return `${system}:${resourceId}`;
  }
}
