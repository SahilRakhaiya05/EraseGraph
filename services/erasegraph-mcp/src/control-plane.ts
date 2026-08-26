import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AsyncMutex } from "./async-mutex.js";
import { createDemoSeed } from "./demo-seed.js";
import {
  DEMO_REQUEST_ID,
  erasurePlanSchema,
  executionReceiptSchema,
  proposedPlanItemSchema,
  resourceSnapshotSchema,
  verificationReportSchema,
  type AuditEvent,
  type AuditEventInput,
  type ConsentRequest,
  type ErasurePlan,
  type EvidencePacket,
  type ExecutionReceipt,
  type PlanItem,
  type ProposedPlanItem,
  type ResourceSnapshot,
  type SystemId,
  type UiState,
  type VerificationReport
} from "./domain.js";
import { DomainError } from "./errors.js";
import { canonicalJson, createAuditEvent, sha256, stateHash, verifyAuditChain } from "./hashing.js";
import { EVIDENCE_DISCLAIMER, evaluatePolicy, retentionPolicyView } from "./policy.js";
import type { EraseGraphStore } from "./store.js";

function auditDetail(event: AuditEvent, key: string): unknown {
  return event.details[key];
}

function auditMatches(
  event: AuditEvent,
  type: string,
  details: Record<string, string>,
): boolean {
  return event.type === type && Object.entries(details).every(([key, value]) => auditDetail(event, key) === value);
}

const requestInputSchema = z.object({
  requestId: z.string().min(1).default(DEMO_REQUEST_ID)
});

export const rehearsalInputSchema = z.object({
  requestId: z.string().min(1).default(DEMO_REQUEST_ID),
  items: z.array(proposedPlanItemSchema).min(1).max(100)
});
export type RehearsalInput = z.input<typeof rehearsalInputSchema>;

export const executeInputSchema = z.object({
  requestId: z.string().min(1).default(DEMO_REQUEST_ID),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().min(8).max(128),
  approved: z.literal(true),
  approvedBy: z.string().min(2).max(120),
  approvalNote: z.string().min(3).max(500).optional()
});
export type ExecuteInput = z.input<typeof executeInputSchema>;

export const verifyInputSchema = z.object({
  requestId: z.string().min(1).default(DEMO_REQUEST_ID),
  planHash: z.string().regex(/^[a-f0-9]{64}$/)
});
export type VerifyInput = z.input<typeof verifyInputSchema>;

interface ControlPlaneOptions {
  store: EraseGraphStore;
  clock?: () => Date;
  idGenerator?: () => string;
}

export class EraseGraphControlPlane {
  private readonly store: EraseGraphStore;
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;
  private readonly mutex = new AsyncMutex();

  constructor(options: ControlPlaneOptions) {
    this.store = options.store;
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? randomUUID;
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
    if ((await this.store.getRequest(DEMO_REQUEST_ID)) === null) {
      await this.resetDemo();
    }
  }

  async close(): Promise<void> {
    await this.store.close();
  }

  async health(): Promise<{ status: "ok" | "degraded"; dependencies: Awaited<ReturnType<EraseGraphStore["health"]>> }> {
    const dependencies = await this.store.health();
    const status = dependencies.postgres === "up" && dependencies.minio === "up" ? "ok" : "degraded";
    return { status, dependencies };
  }

  async resetDemo(): Promise<UiState> {
    return this.mutex.runExclusive(async () => {
      const seed = createDemoSeed(this.clock());
      await this.store.resetDemo(seed);
      await this.appendAudit({
        requestId: seed.request.id,
        type: "demo_reset",
        message: "Synthetic C-1842 model-training consent demo was reset.",
        details: {
          syntheticOnly: true,
          postgresRecords: seed.postgresRecords.length,
          minioObjects: seed.minioObjects.length
        }
      });
      return this.getState(seed.request.id);
    });
  }

  async getConsentRequest(input: unknown): Promise<ConsentRequest> {
    const { requestId } = requestInputSchema.parse(input);
    return this.requireRequest(requestId);
  }

  async searchResources(input: unknown, system: SystemId): Promise<{
    requestId: string;
    subjectId: string;
    purpose: string;
    records: Array<ResourceSnapshot & { policyAction: string; policyReason: string }>;
  }> {
    const { requestId } = requestInputSchema.parse(input);
    const request = await this.requireRequest(requestId);
    const resources = await this.store.listResources(request.subjectId, system);
    return {
      requestId,
      subjectId: request.subjectId,
      purpose: request.purpose,
      records: resources.map((resource) => {
        const decision = evaluatePolicy(request, resource);
        return { ...resource, policyAction: decision.action, policyReason: decision.reason };
      })
    };
  }

  async getRetentionPolicy(input: unknown): Promise<Record<string, unknown>> {
    const { requestId } = requestInputSchema.parse(input);
    return retentionPolicyView(await this.requireRequest(requestId));
  }

  async submitErasureRehearsal(input: RehearsalInput | unknown): Promise<ErasurePlan> {
    const parsed = rehearsalInputSchema.parse(input);
    return this.mutex.runExclusive(async () => {
      const request = await this.requireRequest(parsed.requestId);
      this.assertIdentityVerified(request);
      if (["executed", "verified", "verification_failed"].includes(request.status)) {
        throw new DomainError(
          "REQUEST_ALREADY_EXECUTED",
          "Reset the synthetic demo before creating another plan for this request.",
          409
        );
      }

      const existingJournal = await this.store.listAuditEvents(request.id);
      if (existingJournal.some((event) => event.type === "execution_started")) {
        throw new DomainError(
          "EXECUTION_IN_PROGRESS",
          "An approved execution has already started; resume it with its original plan and idempotency key.",
          409
        );
      }

      const resources = await this.store.listResources(request.subjectId);
      const items = this.validateProposal(request, resources, parsed.items);
      const createdAt = this.clock().toISOString();
      const id = `plan-${this.idGenerator()}`;
      const sourceStateHash = stateHash(resources);
      const planHash = sha256({ id, requestId: request.id, purpose: request.purpose, sourceStateHash, createdAt, items });
      const plan = erasurePlanSchema.parse({
        id,
        requestId: request.id,
        purpose: request.purpose,
        sourceStateHash,
        planHash,
        status: "awaiting_approval",
        deleteCount: items.filter((item) => item.action === "delete").length,
        retainCount: items.filter((item) => item.action === "retain").length,
        anonymizeCount: items.filter((item) => item.action === "anonymize").length,
        items,
        createdAt
      });

      await this.store.savePlan(plan);
      await this.store.updateRequest({ ...request, status: "awaiting_approval" });
      await this.appendAudit({
        requestId: request.id,
        type: "rehearsal_submitted",
        message: "Non-destructive erasure rehearsal passed server-side policy validation and awaits approval.",
        details: {
          planHash,
          sourceStateHash,
          deleteCount: plan.deleteCount,
          retainCount: plan.retainCount,
          anonymizeCount: plan.anonymizeCount
        }
      });
      return plan;
    });
  }

  async executeApprovedPlan(input: ExecuteInput | unknown): Promise<ExecutionReceipt> {
    const parsed = executeInputSchema.parse(input);
    return this.mutex.runExclusive(async () => {
      const replay = await this.store.getExecution(parsed.requestId, parsed.idempotencyKey);
      if (replay !== null) {
        if (replay.planHash !== parsed.planHash) {
          throw new DomainError(
            "IDEMPOTENCY_KEY_CONFLICT",
            "This idempotency key was already used for a different plan hash.",
            409,
            { existingPlanHash: replay.planHash }
          );
        }
        if (replay.approvedBy !== parsed.approvedBy) {
          throw new DomainError(
            "APPROVAL_CONTEXT_MISMATCH",
            "An idempotent replay must use the original approver identity.",
            409
          );
        }
        const replayPlan = await this.requirePlan(parsed.requestId, replay.planHash);
        const replayRequest = await this.requireRequest(parsed.requestId);
        const replayEvents = await this.store.listAuditEvents(parsed.requestId);
        const replayStarted = replayEvents.find((event) =>
          auditMatches(event, "execution_started", {
            planHash: replay.planHash,
            idempotencyKey: replay.idempotencyKey
          })
        );
        if (
          replayStarted !== undefined &&
          (auditDetail(replayStarted, "approvalNote") ?? null) !== (parsed.approvalNote ?? null)
        ) {
          throw new DomainError(
            "APPROVAL_CONTEXT_MISMATCH",
            "An idempotent replay must preserve the original approval note.",
            409
          );
        }
        const planNeedsRecovery = replayPlan.status === "awaiting_approval";
        const requestNeedsRecovery = replayRequest.status === "awaiting_approval";
        if (planNeedsRecovery || requestNeedsRecovery) {
          if (planNeedsRecovery) {
            await this.store.updatePlan({ ...replayPlan, status: "executed" });
          }
          if (requestNeedsRecovery) {
            await this.store.updateRequest({ ...replayRequest, status: "executed" });
          }
        }
        const terminalDetails = { planHash: replay.planHash, idempotencyKey: replay.idempotencyKey };
        const hasTerminalEvent = replayEvents.some(
          (event) => auditMatches(event, "plan_executed", terminalDetails) ||
            auditMatches(event, "execution_recovered", terminalDetails)
        );
        if (!hasTerminalEvent) {
          await this.appendAudit({
            requestId: parsed.requestId,
            type: "execution_recovered",
            message: "Recovered execution finalization from the durable idempotency receipt after an interruption.",
            details: terminalDetails
          });
        }
        return replay;
      }

      const request = await this.requireRequest(parsed.requestId);
      this.assertIdentityVerified(request);
      let journal = await this.store.listAuditEvents(request.id);
      const executionDetails = { planHash: parsed.planHash, idempotencyKey: parsed.idempotencyKey };
      let executionStarted = journal.find((event) => auditMatches(event, "execution_started", executionDetails));
      const latestPlan = await this.requireLatestPlan(parsed.requestId);
      if (executionStarted === undefined && latestPlan.planHash !== parsed.planHash) {
        throw new DomainError(
          "PLAN_HASH_MISMATCH",
          "Approval references a stale or unknown plan hash; rehearse again before executing.",
          409,
          { latestPlanHash: latestPlan.planHash }
        );
      }
      const plan = await this.requirePlan(parsed.requestId, parsed.planHash);
      if (plan.status !== "awaiting_approval") {
        throw new DomainError(
          "PLAN_ALREADY_EXECUTED",
          "The plan has already been executed; reuse the original idempotency key to retrieve its receipt.",
          409
        );
      }

      const otherExecution = journal.find(
        (event) =>
          event.type === "execution_started" &&
          auditDetail(event, "planHash") === plan.planHash &&
          auditDetail(event, "idempotencyKey") !== parsed.idempotencyKey
      );
      if (executionStarted === undefined && otherExecution !== undefined) {
        throw new DomainError(
          "EXECUTION_IN_PROGRESS",
          "This plan has an interrupted execution under a different idempotency key; resume with the original key.",
          409,
          { idempotencyKey: auditDetail(otherExecution, "idempotencyKey") }
        );
      }

      const currentResources = await this.store.listResources(request.subjectId);
      const currentByKey = new Map(currentResources.map((resource) => [this.resourceKey(resource), resource]));
      const currentStateHash = stateHash(currentResources);
      if (executionStarted === undefined) {
        if (currentStateHash !== plan.sourceStateHash) {
          throw new DomainError(
            "STALE_PLAN",
            "Source data changed after rehearsal; destructive execution was blocked.",
            409,
            { rehearsedStateHash: plan.sourceStateHash, currentStateHash }
          );
        }
        this.validateProposal(
          request,
          currentResources,
          plan.items.map((item) => ({ system: item.system, resourceId: item.resourceId, action: item.action }))
        );
        const approvalRecordedAt = this.clock().toISOString();
        executionStarted = await this.appendAudit({
          requestId: request.id,
          type: "execution_started",
          message: "Recorded the approved immutable plan before beginning its resumable deletion saga.",
          details: {
            ...executionDetails,
            approvedBy: parsed.approvedBy,
            approvedAt: approvalRecordedAt,
            approvalNote: parsed.approvalNote ?? null
          }
        });
        journal = [...journal, executionStarted];
      } else {
        const originalApprover = auditDetail(executionStarted, "approvedBy");
        if (originalApprover !== parsed.approvedBy) {
          throw new DomainError(
            "APPROVAL_CONTEXT_MISMATCH",
            "An interrupted execution must resume with its original approver identity.",
            409
          );
        }
        const originalApprovalNote = auditDetail(executionStarted, "approvalNote") ?? null;
        if (originalApprovalNote !== (parsed.approvalNote ?? null)) {
          throw new DomainError(
            "APPROVAL_CONTEXT_MISMATCH",
            "An interrupted execution must preserve its original approval note.",
            409
          );
        }

        const planKeys = new Set(plan.items.map((item) => this.resourceKey(item)));
        const unexpected = currentResources.filter((resource) => !planKeys.has(this.resourceKey(resource)));
        if (unexpected.length > 0) {
          throw new DomainError("STALE_PLAN", "New resources appeared after the approved rehearsal.", 409, {
            unexpected: unexpected.map((resource) => this.resourceKey(resource))
          });
        }
        for (const item of plan.items) {
          const key = this.resourceKey(item);
          const current = currentByKey.get(key);
          const deletionWasJournaled = journal.some((event) =>
            auditMatches(event, "resource_deletion_started", {
              ...executionDetails,
              system: item.system,
              resourceId: item.resourceId
            })
          );
          if (current === undefined) {
            if (item.action !== "delete" || !deletionWasJournaled) {
              throw new DomainError("STALE_PLAN", `Unjournaled source-state drift detected for ${key}.`, 409);
            }
            continue;
          }
          if (!this.sameResourceSnapshot(current, item) || evaluatePolicy(request, current).action !== item.action) {
            throw new DomainError("STALE_PLAN", `Content or policy drift detected for ${key}.`, 409);
          }
        }
      }

      const deleted: string[] = [];
      const retained: string[] = [];
      const anonymized: string[] = [];
      for (const item of plan.items) {
        const locator = `${item.system}:${item.resourceId}`;
        if (item.action === "delete") {
          const intentDetails = { ...executionDetails, system: item.system, resourceId: item.resourceId };
          let deletionStarted = journal.find((event) => auditMatches(event, "resource_deletion_started", intentDetails));
          const intentPredatedAttempt = deletionStarted !== undefined;
          const expectedSnapshot = currentByKey.get(this.resourceKey(item));
          if (expectedSnapshot === undefined && deletionStarted === undefined) {
            throw new DomainError("EXECUTION_CONFLICT", `Resource ${locator} disappeared before its deletion was journaled.`, 409);
          }
          if (deletionStarted === undefined) {
            deletionStarted = await this.appendAudit({
              requestId: request.id,
              type: "resource_deletion_started",
              message: `Journaled deletion intent for ${item.label}.`,
              system: item.system,
              details: intentDetails
            });
            journal = [...journal, deletionStarted];
          }
          const deletionResult =
            expectedSnapshot === undefined
              ? { status: "missing" as const }
              : await this.store.deleteResourceIfUnchanged(resourceSnapshotSchema.parse(item));
          if (deletionResult.status === "changed") {
            throw new DomainError(
              "STALE_PLAN",
              `Resource ${locator} changed at the destructive boundary; execution stopped without deleting any replacement.`,
              409
            );
          }
          if (deletionResult.status === "missing" && !intentPredatedAttempt) {
            throw new DomainError(
              "EXECUTION_CONFLICT",
              `Resource ${locator} disappeared after intent was journaled; retry to reconcile the durable saga.`,
              409
            );
          }
          deleted.push(locator);
          if (!journal.some((event) => auditMatches(event, "resource_deleted", intentDetails))) {
            const completed = await this.appendAudit({
              requestId: request.id,
              type: "resource_deleted",
              message: deletionResult.status === "deleted"
                ? `Deleted ${item.label} after explicit approval.`
                : `Confirmed the journaled deletion intent for ${item.label} is already satisfied.`,
              system: item.system,
              details: { ...intentDetails, resumed: deletionResult.status === "missing" }
            });
            journal = [...journal, completed];
          }
        } else if (item.action === "retain") {
          if (!(await this.store.resourceExists(item.system, item.resourceId))) {
            throw new DomainError("EXECUTION_CONFLICT", `Protected resource ${locator} is unexpectedly missing.`, 409);
          }
          retained.push(locator);
          const retainDetails = { ...executionDetails, system: item.system, resourceId: item.resourceId };
          if (!journal.some((event) => auditMatches(event, "resource_retained", retainDetails))) {
            const retainedEvent = await this.appendAudit({
              requestId: request.id,
              type: "resource_retained",
              message: `Retained ${item.label} under the configured server policy.`,
              system: item.system,
              details: { ...retainDetails, reason: item.reason }
            });
            journal = [...journal, retainedEvent];
          }
        } else {
          anonymized.push(locator);
          throw new DomainError(
            "UNSUPPORTED_POLICY_ACTION",
            "The current server policy does not emit anonymize actions.",
            500
          );
        }
      }

      const timestamp = this.clock().toISOString();
      const originalApprovedAt = auditDetail(executionStarted, "approvedAt");
      const originalApprovalNote = auditDetail(executionStarted, "approvalNote") ?? null;
      const receipt = executionReceiptSchema.parse({
        id: `execution-${this.idGenerator()}`,
        requestId: request.id,
        planHash: plan.planHash,
        idempotencyKey: parsed.idempotencyKey,
        approvedBy: parsed.approvedBy,
        approvedAt: typeof originalApprovedAt === "string" ? originalApprovedAt : executionStarted.createdAt,
        executedAt: timestamp,
        deleted,
        retained,
        anonymized
      });
      await this.store.saveExecution(receipt);
      await this.store.updatePlan({ ...plan, status: "executed" });
      await this.store.updateRequest({ ...request, status: "executed" });
      await this.appendAudit({
        requestId: request.id,
        type: "plan_executed",
        message: "Approved purpose-scoped plan executed; independent verification is still required.",
        details: {
          planHash: plan.planHash,
          idempotencyKey: parsed.idempotencyKey,
          approvedBy: parsed.approvedBy,
          approvalNote: originalApprovalNote,
          deletedCount: deleted.length,
          retainedCount: retained.length
        }
      });
      return receipt;
    });
  }

  async verifyPlanExecution(input: VerifyInput | unknown): Promise<VerificationReport> {
    const parsed = verifyInputSchema.parse(input);
    return this.mutex.runExclusive(async () => {
      const request = await this.requireRequest(parsed.requestId);
      const plan = await this.requirePlan(parsed.requestId, parsed.planHash);
      const execution = await this.store.getLatestExecution(parsed.requestId);
      if (execution === null || execution.planHash !== plan.planHash) {
        throw new DomainError("PLAN_NOT_EXECUTED", "The plan must be executed before it can be verified.", 409);
      }

      const deleted: string[] = [];
      const retained: string[] = [];
      const failures: VerificationReport["failures"] = [];
      const currentResources = await this.store.listResources(request.subjectId);
      const currentByKey = new Map(currentResources.map((resource) => [this.resourceKey(resource), resource]));
      const plannedKeys = new Set(plan.items.map((item) => this.resourceKey(item)));
      for (const item of plan.items) {
        const current = currentByKey.get(this.resourceKey(item));
        const exists = current !== undefined;
        const locator = `${item.system}:${item.resourceId}`;
        if (item.action === "delete") {
          if (exists) {
            failures.push({
              system: item.system,
              resourceId: item.resourceId,
              expected: "absent",
              actual: "present"
            });
          } else {
            deleted.push(locator);
          }
        } else if (item.action === "retain") {
          if (!exists) {
            failures.push({
              system: item.system,
              resourceId: item.resourceId,
              expected: "present",
              actual: "absent"
            });
          } else if (!this.sameResourceSnapshot(current, item)) {
            failures.push({
              system: item.system,
              resourceId: item.resourceId,
              expected: "approved_snapshot_and_retain_policy",
              actual: "snapshot_changed"
            });
          } else if (evaluatePolicy(request, current).action !== "retain") {
            failures.push({
              system: item.system,
              resourceId: item.resourceId,
              expected: "approved_snapshot_and_retain_policy",
              actual: `policy:${evaluatePolicy(request, current).action}`
            });
          } else {
            retained.push(locator);
          }
        }
      }

      for (const resource of currentResources) {
        if (!plannedKeys.has(this.resourceKey(resource)) && evaluatePolicy(request, resource).action === "delete") {
          failures.push({
            system: resource.system,
            resourceId: resource.resourceId,
            expected: "absent_or_in_approved_plan",
            actual: "unexpected_in_scope_copy"
          });
        }
      }

      const report = verificationReportSchema.parse({
        id: `verification-${this.idGenerator()}`,
        requestId: request.id,
        planHash: plan.planHash,
        status: failures.length === 0 ? "passed" : "failed",
        checkedAt: this.clock().toISOString(),
        deleted,
        retained,
        failures
      });
      await this.store.saveVerification(report);
      const nextPlanStatus = report.status === "passed" ? "verified" : "verification_failed";
      await this.store.updatePlan({ ...plan, status: nextPlanStatus });
      await this.store.updateRequest({
        ...request,
        status: nextPlanStatus
      });
      await this.appendAudit({
        requestId: request.id,
        type: report.status === "passed" ? "verification_passed" : "verification_failed",
        message:
          report.status === "passed"
            ? "Independent existence checks confirmed deleted targets and protected retained records."
            : "Independent verification found one or more unexpected resource states.",
        details: {
          planHash: plan.planHash,
          deletedCount: deleted.length,
          retainedCount: retained.length,
          failureCount: failures.length
        }
      });
      return report;
    });
  }

  async exportEvidencePacket(input: unknown): Promise<EvidencePacket> {
    const { requestId } = requestInputSchema.parse(input);
    const [request, plan, execution, verification, audit] = await Promise.all([
      this.requireRequest(requestId),
      this.store.getLatestPlan(requestId),
      this.store.getLatestExecution(requestId),
      this.store.getLatestVerification(requestId),
      this.store.listAuditEvents(requestId)
    ]);
    return {
      schemaVersion: "1.0",
      generatedAt: this.clock().toISOString(),
      disclaimer: EVIDENCE_DISCLAIMER,
      request,
      plan,
      execution,
      verification,
      audit,
      auditChain: {
        valid: verifyAuditChain(audit),
        eventCount: audit.length,
        headHash: audit.at(-1)?.hash ?? "0".repeat(64),
        externallyAnchored: false,
        limitation: "This unkeyed local hash chain catches accidental or partial edits only. A writer who can replace the log can recompute the chain, and without an external anchor a valid suffix can also be truncated."
      }
    };
  }

  async getState(requestId = DEMO_REQUEST_ID): Promise<UiState> {
    const [request, plan, verification, audit, health] = await Promise.all([
      this.requireRequest(requestId),
      this.store.getLatestPlan(requestId),
      this.store.getLatestVerification(requestId),
      this.store.listAuditEvents(requestId),
      this.store.health()
    ]);
    const resources = plan?.items ?? (await this.store.listResources(request.subjectId));
    const recordsBySystem = new Map<SystemId, UiState["systems"][number]["records"]>([
      ["postgres", []],
      ["minio", []]
    ]);

    await Promise.all(
      resources.map(async (resource) => {
        const policyDecision = evaluatePolicy(request, resource);
        const action = plan === null ? policyDecision.action : (resource as PlanItem).action;
        const reason = plan === null ? policyDecision.reason : (resource as PlanItem).reason;
        const exists = await this.store.resourceExists(resource.system, resource.resourceId);
        let status = "found";
        if (plan !== null && plan.status === "awaiting_approval") {
          status = "planned";
        } else if (plan !== null) {
          status = action === "delete" ? (exists ? "deletion_failed" : "deleted") : exists ? "retained" : "missing";
        }
        recordsBySystem.get(resource.system)?.push({
          id: resource.resourceId,
          label: resource.label,
          category: resource.category,
          action,
          status,
          reason
        });
      })
    );
    for (const records of recordsBySystem.values()) {
      records.sort((left, right) => left.id.localeCompare(right.id));
    }

    return {
      request,
      systems: [
        {
          id: "postgres",
          name: "Customer Data Postgres",
          kind: "database",
          status: health.postgres === "up" ? "connected" : "error",
          recordCount: recordsBySystem.get("postgres")?.length ?? 0,
          records: recordsBySystem.get("postgres") ?? []
        },
        {
          id: "minio",
          name: "Training Artifacts MinIO",
          kind: "object_store",
          status: health.minio === "up" ? "connected" : "error",
          recordCount: recordsBySystem.get("minio")?.length ?? 0,
          records: recordsBySystem.get("minio") ?? []
        }
      ],
      plan:
        plan === null
          ? null
          : {
              hash: plan.planHash,
              status: plan.status,
              deleteCount: plan.deleteCount,
              retainCount: plan.retainCount,
              anonymizeCount: plan.anonymizeCount,
              createdAt: plan.createdAt
            },
      audit: audit.map((event) => ({
        id: event.id,
        type: event.type,
        message: event.message,
        ...(event.system === undefined ? {} : { system: event.system }),
        createdAt: event.createdAt,
        hash: event.hash
      })),
      verification:
        verification === null
          ? null
          : {
              status: verification.status,
              checkedAt: verification.checkedAt,
              deleted: verification.deleted.length,
              retained: verification.retained.length,
              failures: verification.failures.length
            }
    };
  }

  private validateProposal(
    request: ConsentRequest,
    resources: ResourceSnapshot[],
    proposedItems: ProposedPlanItem[]
  ): PlanItem[] {
    if (resources.length === 0) {
      throw new DomainError("NO_RESOURCES", "No current resources were found for this request.", 409);
    }
    const resourcesByKey = new Map(resources.map((resource) => [this.resourceKey(resource), resource]));
    const seen = new Set<string>();
    const validatedItems: PlanItem[] = [];

    for (const proposal of proposedItems) {
      const key = `${proposal.system}:${proposal.resourceId}`;
      if (seen.has(key)) {
        throw new DomainError("DUPLICATE_RESOURCE", `Plan contains duplicate resource ${key}.`, 400);
      }
      seen.add(key);
      const resource = resourcesByKey.get(key);
      if (resource === undefined) {
        throw new DomainError("UNKNOWN_RESOURCE", `Plan references unknown or out-of-scope resource ${key}.`, 400);
      }
      const decision = evaluatePolicy(request, resource);
      if (proposal.action !== decision.action) {
        if (decision.action === "retain" && proposal.action !== "retain") {
          throw new DomainError(
            "RETAINED_RESOURCE_PROTECTED",
            `Server policy protects ${key}; proposed action ${proposal.action} was rejected.`,
            409,
            { requiredAction: decision.action, reason: decision.reason, ruleId: decision.ruleId }
          );
        }
        throw new DomainError(
          "POLICY_ACTION_MISMATCH",
          `Server policy requires ${decision.action} for ${key}; proposed ${proposal.action} was rejected.`,
          409,
          { requiredAction: decision.action, reason: decision.reason, ruleId: decision.ruleId }
        );
      }
      validatedItems.push({ ...resource, action: decision.action, reason: decision.reason });
    }

    const missing = [...resourcesByKey.keys()].filter((key) => !seen.has(key));
    if (missing.length > 0) {
      throw new DomainError(
        "INCOMPLETE_PLAN",
        "A rehearsal must account for every discovered resource, including records that will be retained.",
        400,
        { missing }
      );
    }

    return validatedItems.sort((left, right) => this.resourceKey(left).localeCompare(this.resourceKey(right)));
  }

  private resourceKey(resource: Pick<ResourceSnapshot, "system" | "resourceId">): string {
    return `${resource.system}:${resource.resourceId}`;
  }

  private async requireRequest(requestId: string): Promise<ConsentRequest> {
    const request = await this.store.getRequest(requestId);
    if (request === null) {
      throw new DomainError("REQUEST_NOT_FOUND", `Consent request ${requestId} was not found.`, 404);
    }
    return request;
  }

  private async requireLatestPlan(requestId: string): Promise<ErasurePlan> {
    const plan = await this.store.getLatestPlan(requestId);
    if (plan === null) {
      throw new DomainError("PLAN_NOT_FOUND", "No rehearsed plan exists for this request.", 404);
    }
    return plan;
  }

  private async requirePlan(requestId: string, planHash: string): Promise<ErasurePlan> {
    const plan = await this.store.getPlan(requestId, planHash);
    if (plan === null) {
      throw new DomainError("PLAN_NOT_FOUND", "No rehearsed plan exists for this request and hash.", 404);
    }
    return plan;
  }

  private assertIdentityVerified(request: ConsentRequest): void {
    if (!request.verified) {
      throw new DomainError(
        "IDENTITY_NOT_VERIFIED",
        "The consent request identity must be verified before rehearsal or execution.",
        409
      );
    }
  }

  private sameResourceSnapshot(current: ResourceSnapshot, planned: PlanItem): boolean {
    return canonicalJson(current) === canonicalJson(resourceSnapshotSchema.parse(planned));
  }

  private async appendAudit(input: AuditEventInput): Promise<AuditEvent> {
    const events = await this.store.listAuditEvents(input.requestId);
    if (!verifyAuditChain(events)) {
      throw new DomainError("AUDIT_CHAIN_INVALID", "Audit chain integrity check failed; writes are blocked.", 500);
    }
    const event = createAuditEvent({
      input,
      previous: events.at(-1),
      id: `audit-${this.idGenerator()}`,
      createdAt: this.clock().toISOString()
    });
    await this.store.saveAuditEvent(event);
    return event;
  }
}
