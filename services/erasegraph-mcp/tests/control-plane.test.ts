import { beforeEach, describe, expect, it } from "vitest";
import { EraseGraphControlPlane } from "../src/control-plane.js";
import {
  DEMO_REQUEST_ID,
  type ErasurePlan,
  type ProposedPlanItem,
  type ResourceSnapshot
} from "../src/domain.js";
import { verifyAuditChain } from "../src/hashing.js";
import { MemoryEraseGraphStore } from "../src/memory-store.js";
import { evaluatePolicy } from "../src/policy.js";

class MutableMemoryStore extends MemoryEraseGraphStore {
  restoreResource(resource: ResourceSnapshot): void {
    this.resources.set(`${resource.system}:${resource.resourceId}`, structuredClone(resource));
  }

  removeResource(resource: ResourceSnapshot): void {
    this.resources.delete(`${resource.system}:${resource.resourceId}`);
  }
}

class FailSecondDeletionOnceStore extends MutableMemoryStore {
  private deleteCalls = 0;
  private injected = false;

  override async deleteResourceIfUnchanged(expected: ResourceSnapshot) {
    this.deleteCalls += 1;
    if (this.deleteCalls === 2 && !this.injected) {
      this.injected = true;
      throw new Error("injected cross-store deletion failure");
    }
    return super.deleteResourceIfUnchanged(expected);
  }
}

class SwapToLegalHoldDuringDeleteStore extends MutableMemoryStore {
  swappedResource: ResourceSnapshot | null = null;
  conditionalDeleteResult: { status: "deleted" | "missing" | "changed" } | null = null;

  override async deleteResourceIfUnchanged(expected: ResourceSnapshot) {
    if (this.swappedResource === null) {
      this.swappedResource = { ...structuredClone(expected), retentionClass: "legal_hold" };
      this.restoreResource(this.swappedResource);
    }
    const result = await super.deleteResourceIfUnchanged(expected);
    if (
      this.swappedResource.system === expected.system &&
      this.swappedResource.resourceId === expected.resourceId
    ) {
      this.conditionalDeleteResult = result;
    }
    return result;
  }
}

class FailExecutionFinalizationOnceStore extends MutableMemoryStore {
  private failNextExecutedRequestUpdate = false;

  override async saveExecution(receipt: Parameters<MutableMemoryStore["saveExecution"]>[0]): Promise<void> {
    await super.saveExecution(receipt);
    this.failNextExecutedRequestUpdate = true;
  }

  override async updateRequest(request: Parameters<MutableMemoryStore["updateRequest"]>[0]): Promise<void> {
    if (this.failNextExecutedRequestUpdate && request.status === "executed") {
      this.failNextExecutedRequestUpdate = false;
      throw new Error("injected execution finalization failure");
    }
    await super.updateRequest(request);
  }
}

class FailTerminalAuditOnceStore extends MutableMemoryStore {
  private injected = false;

  override async saveAuditEvent(
    event: Parameters<MutableMemoryStore["saveAuditEvent"]>[0]
  ): Promise<void> {
    if (!this.injected && event.type === "plan_executed") {
      this.injected = true;
      throw new Error("injected terminal audit failure");
    }
    await super.saveAuditEvent(event);
  }
}

describe("EraseGraph control plane", () => {
  let store: MutableMemoryStore;
  let controlPlane: EraseGraphControlPlane;
  let id = 0;
  let now = Date.parse("2026-08-30T10:00:00.000Z");

  beforeEach(async () => {
    id = 0;
    now = Date.parse("2026-08-30T10:00:00.000Z");
    store = new MutableMemoryStore();
    controlPlane = new EraseGraphControlPlane({
      store,
      idGenerator: () => `test-${++id}`,
      clock: () => new Date((now += 1_000))
    });
    await controlPlane.initialize();
  });

  async function validProposal(): Promise<ProposedPlanItem[]> {
    const request = await controlPlane.getConsentRequest({ requestId: DEMO_REQUEST_ID });
    const resources = await store.listResources(request.subjectId);
    return resources.map((resource) => ({
      system: resource.system,
      resourceId: resource.resourceId,
      action: evaluatePolicy(request, resource).action
    }));
  }

  async function rehearse(): Promise<ErasurePlan> {
    return controlPlane.submitErasureRehearsal({
      requestId: DEMO_REQUEST_ID,
      items: await validProposal()
    });
  }

  async function execute(plan: ErasurePlan, idempotencyKey = "idem-test-001") {
    return controlPlane.executeApprovedPlan({
      requestId: DEMO_REQUEST_ID,
      planHash: plan.planHash,
      idempotencyKey,
      approved: true,
      approvedBy: "reviewer@example.test",
      approvalNote: "Reviewed exact resource diff."
    });
  }

  it("rejects an incomplete plan instead of trusting model output", async () => {
    const proposal = await validProposal();

    await expect(
      controlPlane.submitErasureRehearsal({ requestId: DEMO_REQUEST_ID, items: proposal.slice(0, 1) })
    ).rejects.toMatchObject({ code: "INCOMPLETE_PLAN" });

    expect((await store.getRequest(DEMO_REQUEST_ID))?.status).toBe("pending");
    expect((await store.listAuditEvents(DEMO_REQUEST_ID)).some((event) => event.type === "rehearsal_submitted"))
      .toBe(false);
  });

  it("blocks rehearsal when the consent request identity is not verified", async () => {
    const request = await store.getRequest(DEMO_REQUEST_ID);
    expect(request).not.toBeNull();
    await store.updateRequest({ ...request!, verified: false });

    await expect(
      controlPlane.submitErasureRehearsal({ requestId: DEMO_REQUEST_ID, items: await validProposal() })
    ).rejects.toMatchObject({ code: "IDENTITY_NOT_VERIFIED" });

    expect((await store.getRequest(DEMO_REQUEST_ID))?.status).toBe("pending");
    expect((await store.listAuditEvents(DEMO_REQUEST_ID)).some((event) => event.type === "rehearsal_submitted"))
      .toBe(false);
  });

  it("protects configured billing and legal-retention records", async () => {
    const proposal = await validProposal();
    const protectedItem = proposal.find((item) => item.resourceId === "pg-billing-C1842-2026-001");
    expect(protectedItem).toBeDefined();
    protectedItem!.action = "delete";

    await expect(
      controlPlane.submitErasureRehearsal({ requestId: DEMO_REQUEST_ID, items: proposal })
    ).rejects.toMatchObject({ code: "RETAINED_RESOURCE_PROTECTED" });

    expect(await store.resourceExists("postgres", "pg-billing-C1842-2026-001")).toBe(true);
    expect(await store.resourceExists("postgres", "pg-legal-hold-C1842")).toBe(true);
  });

  it("rejects a stale plan hash and source-state drift", async () => {
    const plan = await rehearse();

    await expect(
      controlPlane.executeApprovedPlan({
        requestId: DEMO_REQUEST_ID,
        planHash: "a".repeat(64),
        idempotencyKey: "idem-stale-hash",
        approved: true,
        approvedBy: "reviewer@example.test"
      })
    ).rejects.toMatchObject({ code: "PLAN_HASH_MISMATCH" });

    const firstDeletable = plan.items.find((item) => item.action === "delete");
    expect(firstDeletable).toBeDefined();
    const current = (await store.listResources(firstDeletable!.subjectId)).find(
      (resource) => resource.system === firstDeletable!.system && resource.resourceId === firstDeletable!.resourceId
    );
    expect(current).toBeDefined();
    await expect(store.deleteResourceIfUnchanged(current!)).resolves.toEqual({ status: "deleted" });

    await expect(execute(plan, "idem-state-drift")).rejects.toMatchObject({ code: "STALE_PLAN" });
  });

  it("makes destructive execution idempotent for the same plan and key", async () => {
    const plan = await rehearse();
    const first = await execute(plan);
    const auditAfterFirst = await store.listAuditEvents(DEMO_REQUEST_ID);

    const replay = await execute(plan);
    const auditAfterReplay = await store.listAuditEvents(DEMO_REQUEST_ID);

    expect(replay).toEqual(first);
    expect(auditAfterReplay).toHaveLength(auditAfterFirst.length);
    for (const item of plan.items.filter((entry) => entry.action === "delete")) {
      expect(await store.resourceExists(item.system, item.resourceId)).toBe(false);
    }
  });

  it("resumes a journaled partial deletion with the original idempotency key", async () => {
    const failingStore = new FailSecondDeletionOnceStore();
    const failingControlPlane = new EraseGraphControlPlane({ store: failingStore });
    await failingControlPlane.initialize();
    const request = await failingControlPlane.getConsentRequest({ requestId: DEMO_REQUEST_ID });
    const resources = await failingStore.listResources(request.subjectId);
    const plan = await failingControlPlane.submitErasureRehearsal({
      requestId: DEMO_REQUEST_ID,
      items: resources.map((resource) => ({
        system: resource.system,
        resourceId: resource.resourceId,
        action: evaluatePolicy(request, resource).action
      }))
    });
    const input = {
      requestId: DEMO_REQUEST_ID,
      planHash: plan.planHash,
      idempotencyKey: "idem-resumable-001",
      approved: true as const,
      approvedBy: "reviewer@example.test"
    };

    await expect(failingControlPlane.executeApprovedPlan(input)).rejects.toThrow("injected cross-store deletion failure");
    expect(await failingStore.getExecution(DEMO_REQUEST_ID, input.idempotencyKey)).toBeNull();

    const resourcesAfterInterruption = await failingStore.listResources(request.subjectId);
    await expect(
      failingControlPlane.submitErasureRehearsal({
        requestId: DEMO_REQUEST_ID,
        items: resourcesAfterInterruption.map((resource) => ({
          system: resource.system,
          resourceId: resource.resourceId,
          action: evaluatePolicy(request, resource).action
        }))
      })
    ).rejects.toMatchObject({ code: "EXECUTION_IN_PROGRESS" });
    await expect(failingStore.getPlan(DEMO_REQUEST_ID, plan.planHash)).resolves.toEqual(plan);

    await expect(
      failingControlPlane.executeApprovedPlan({ ...input, idempotencyKey: "idem-supersede-001" })
    ).rejects.toMatchObject({ code: "EXECUTION_IN_PROGRESS" });

    const receipt = await failingControlPlane.executeApprovedPlan(input);
    expect(receipt.deleted).toHaveLength(plan.deleteCount);
    const verification = await failingControlPlane.verifyPlanExecution({
      requestId: DEMO_REQUEST_ID,
      planHash: plan.planHash
    });
    expect(verification.status).toBe("passed");
  });

  it("keeps approver identity and approval note immutable across resume and replay", async () => {
    const failingStore = new FailSecondDeletionOnceStore();
    const failingControlPlane = new EraseGraphControlPlane({ store: failingStore });
    await failingControlPlane.initialize();
    const request = await failingControlPlane.getConsentRequest({ requestId: DEMO_REQUEST_ID });
    const resources = await failingStore.listResources(request.subjectId);
    const plan = await failingControlPlane.submitErasureRehearsal({
      requestId: DEMO_REQUEST_ID,
      items: resources.map((resource) => ({
        system: resource.system,
        resourceId: resource.resourceId,
        action: evaluatePolicy(request, resource).action
      }))
    });
    const input = {
      requestId: DEMO_REQUEST_ID,
      planHash: plan.planHash,
      idempotencyKey: "idem-approval-context-001",
      approved: true as const,
      approvedBy: "original-reviewer@example.test",
      approvalNote: "Original exact-diff approval."
    };

    await expect(failingControlPlane.executeApprovedPlan(input)).rejects.toThrow("injected cross-store deletion failure");
    await expect(
      failingControlPlane.executeApprovedPlan({ ...input, approvedBy: "replacement-reviewer@example.test" })
    ).rejects.toMatchObject({ code: "APPROVAL_CONTEXT_MISMATCH" });
    await expect(
      failingControlPlane.executeApprovedPlan({ ...input, approvalNote: "A different approval note." })
    ).rejects.toMatchObject({ code: "APPROVAL_CONTEXT_MISMATCH" });

    const receipt = await failingControlPlane.executeApprovedPlan(input);
    await expect(
      failingControlPlane.executeApprovedPlan({ ...input, approvedBy: "replacement-reviewer@example.test" })
    ).rejects.toMatchObject({ code: "APPROVAL_CONTEXT_MISMATCH" });
    await expect(
      failingControlPlane.executeApprovedPlan({ ...input, approvalNote: "A different approval note." })
    ).rejects.toMatchObject({ code: "APPROVAL_CONTEXT_MISMATCH" });
    await expect(failingControlPlane.executeApprovedPlan(input)).resolves.toEqual(receipt);

    const executionStarted = (await failingStore.listAuditEvents(DEMO_REQUEST_ID)).find(
      (event) => event.type === "execution_started"
    );
    expect(executionStarted?.details).toMatchObject({
      approvedBy: input.approvedBy,
      approvalNote: input.approvalNote
    });
  });

  it("blocks deletion when the store atomically observes a legal-hold policy change", async () => {
    const swappingStore = new SwapToLegalHoldDuringDeleteStore();
    const swappingControlPlane = new EraseGraphControlPlane({ store: swappingStore });
    await swappingControlPlane.initialize();
    const request = await swappingControlPlane.getConsentRequest({ requestId: DEMO_REQUEST_ID });
    const resources = await swappingStore.listResources(request.subjectId);
    const plan = await swappingControlPlane.submitErasureRehearsal({
      requestId: DEMO_REQUEST_ID,
      items: resources.map((resource) => ({
        system: resource.system,
        resourceId: resource.resourceId,
        action: evaluatePolicy(request, resource).action
      }))
    });

    await expect(
      swappingControlPlane.executeApprovedPlan({
        requestId: DEMO_REQUEST_ID,
        planHash: plan.planHash,
        idempotencyKey: "idem-policy-swap-001",
        approved: true,
        approvedBy: "reviewer@example.test",
        approvalNote: "Approved before the retention change."
      })
    ).rejects.toMatchObject({ code: "STALE_PLAN" });

    expect(swappingStore.conditionalDeleteResult).toEqual({ status: "changed" });
    expect(swappingStore.swappedResource).not.toBeNull();
    expect(
      await swappingStore.resourceExists(
        swappingStore.swappedResource!.system,
        swappingStore.swappedResource!.resourceId
      )
    ).toBe(true);
    expect(
      (await swappingStore.listResources(request.subjectId)).find(
        (resource) =>
          resource.system === swappingStore.swappedResource!.system &&
          resource.resourceId === swappingStore.swappedResource!.resourceId
      )?.retentionClass
    ).toBe("legal_hold");
  });

  it("journals same-named resources in different systems independently", async () => {
    const request = await controlPlane.getConsentRequest({ requestId: DEMO_REQUEST_ID });
    const resources = await store.listResources(request.subjectId);
    const postgresTarget = resources.find(
      (resource) => resource.system === "postgres" && evaluatePolicy(request, resource).action === "delete"
    );
    const minioTarget = resources.find(
      (resource) => resource.system === "minio" && evaluatePolicy(request, resource).action === "delete"
    );
    expect(postgresTarget).toBeDefined();
    expect(minioTarget).toBeDefined();

    store.removeResource(minioTarget!);
    store.restoreResource({ ...minioTarget!, resourceId: postgresTarget!.resourceId });
    const plan = await rehearse();
    await execute(plan, "idem-cross-system-name-001");

    const audit = await store.listAuditEvents(DEMO_REQUEST_ID);
    for (const type of ["resource_deletion_started", "resource_deleted"]) {
      const matchingEvents = audit.filter(
        (event) => event.type === type && event.details.resourceId === postgresTarget!.resourceId
      );
      expect(matchingEvents).toHaveLength(2);
      expect(new Set(matchingEvents.map((event) => event.system))).toEqual(new Set(["postgres", "minio"]));
    }
    expect(await store.resourceExists("postgres", postgresTarget!.resourceId)).toBe(false);
    expect(await store.resourceExists("minio", postgresTarget!.resourceId)).toBe(false);
  });

  it("recovers request status when receipt persistence outlives finalization", async () => {
    const failingStore = new FailExecutionFinalizationOnceStore();
    const failingControlPlane = new EraseGraphControlPlane({ store: failingStore });
    await failingControlPlane.initialize();
    const request = await failingControlPlane.getConsentRequest({ requestId: DEMO_REQUEST_ID });
    const resources = await failingStore.listResources(request.subjectId);
    const plan = await failingControlPlane.submitErasureRehearsal({
      requestId: DEMO_REQUEST_ID,
      items: resources.map((resource) => ({
        system: resource.system,
        resourceId: resource.resourceId,
        action: evaluatePolicy(request, resource).action
      }))
    });
    const input = {
      requestId: DEMO_REQUEST_ID,
      planHash: plan.planHash,
      idempotencyKey: "idem-finalize-001",
      approved: true as const,
      approvedBy: "reviewer@example.test"
    };

    await expect(failingControlPlane.executeApprovedPlan(input)).rejects.toThrow("injected execution finalization failure");
    expect(await failingStore.getExecution(DEMO_REQUEST_ID, input.idempotencyKey)).not.toBeNull();
    expect((await failingStore.getRequest(DEMO_REQUEST_ID))?.status).toBe("awaiting_approval");

    await expect(failingControlPlane.executeApprovedPlan(input)).resolves.toMatchObject({
      idempotencyKey: input.idempotencyKey,
      planHash: plan.planHash
    });
    expect((await failingStore.getRequest(DEMO_REQUEST_ID))?.status).toBe("executed");
    expect((await failingStore.listAuditEvents(DEMO_REQUEST_ID)).some((event) => event.type === "execution_recovered"))
      .toBe(true);
  });

  it("repairs a missing terminal audit event from the durable receipt exactly once", async () => {
    const failingStore = new FailTerminalAuditOnceStore();
    const failingControlPlane = new EraseGraphControlPlane({ store: failingStore });
    await failingControlPlane.initialize();
    const request = await failingControlPlane.getConsentRequest({ requestId: DEMO_REQUEST_ID });
    const resources = await failingStore.listResources(request.subjectId);
    const plan = await failingControlPlane.submitErasureRehearsal({
      requestId: DEMO_REQUEST_ID,
      items: resources.map((resource) => ({
        system: resource.system,
        resourceId: resource.resourceId,
        action: evaluatePolicy(request, resource).action
      }))
    });
    const input = {
      requestId: DEMO_REQUEST_ID,
      planHash: plan.planHash,
      idempotencyKey: "idem-terminal-audit-001",
      approved: true as const,
      approvedBy: "reviewer@example.test"
    };

    await expect(failingControlPlane.executeApprovedPlan(input)).rejects.toThrow("injected terminal audit failure");
    const persisted = await failingStore.getExecution(DEMO_REQUEST_ID, input.idempotencyKey);
    expect(persisted).not.toBeNull();
    expect((await failingStore.getPlan(DEMO_REQUEST_ID, plan.planHash))?.status).toBe("executed");
    expect((await failingStore.getRequest(DEMO_REQUEST_ID))?.status).toBe("executed");
    expect(
      (await failingStore.listAuditEvents(DEMO_REQUEST_ID)).filter(
        (event) => event.type === "plan_executed" || event.type === "execution_recovered"
      )
    ).toHaveLength(0);

    await expect(failingControlPlane.executeApprovedPlan(input)).resolves.toEqual(persisted);
    const repairedAudit = await failingStore.listAuditEvents(DEMO_REQUEST_ID);
    expect(repairedAudit.filter((event) => event.type === "execution_recovered")).toHaveLength(1);
    expect(repairedAudit.find((event) => event.type === "execution_recovered")?.details).toMatchObject({
      planHash: plan.planHash,
      idempotencyKey: input.idempotencyKey
    });
    expect(verifyAuditChain(repairedAudit)).toBe(true);

    await expect(failingControlPlane.executeApprovedPlan(input)).resolves.toEqual(persisted);
    expect(await failingStore.listAuditEvents(DEMO_REQUEST_ID)).toHaveLength(repairedAudit.length);
  });

  it("verifies deleted targets are absent while retained records remain", async () => {
    const plan = await rehearse();
    await execute(plan);

    const verification = await controlPlane.verifyPlanExecution({
      requestId: DEMO_REQUEST_ID,
      planHash: plan.planHash
    });
    const state = await controlPlane.getState();

    expect(verification.status).toBe("passed");
    expect(verification.failures).toEqual([]);
    expect(verification.deleted).toHaveLength(plan.deleteCount);
    expect(verification.retained).toHaveLength(plan.retainCount);
    expect(state.request).toMatchObject({ status: "verified", verified: true });
    expect(state.verification?.status).toBe("passed");
  });

  it("fails verification when retained policy metadata drifts without changing bytes", async () => {
    const request = await controlPlane.getConsentRequest({ requestId: DEMO_REQUEST_ID });
    const retainedBefore = (await store.listResources(request.subjectId)).find(
      (resource) => resource.retentionClass === "legal_hold"
    );
    expect(retainedBefore).toBeDefined();
    const plan = await rehearse();
    await execute(plan, "idem-retained-policy-drift-001");

    const changed = { ...retainedBefore!, retentionClass: "none" as const };
    expect(changed.fingerprint).toBe(retainedBefore!.fingerprint);
    expect(evaluatePolicy(request, changed).action).toBe("delete");
    store.restoreResource(changed);

    const verification = await controlPlane.verifyPlanExecution({
      requestId: DEMO_REQUEST_ID,
      planHash: plan.planHash
    });
    expect(verification.status).toBe("failed");
    expect(verification.retained).not.toContain(`${changed.system}:${changed.resourceId}`);
    expect(verification.failures).toContainEqual({
      system: changed.system,
      resourceId: changed.resourceId,
      expected: "approved_snapshot_and_retain_policy",
      actual: "snapshot_changed"
    });
    expect((await store.getPlan(DEMO_REQUEST_ID, plan.planHash))?.status).toBe("verification_failed");
    expect((await store.getRequest(DEMO_REQUEST_ID))?.status).toBe("verification_failed");
  });

  it("rechecks live state and detects resurrection after an earlier pass", async () => {
    const resources = await store.listResources("C-1842");
    const request = await controlPlane.getConsentRequest({ requestId: DEMO_REQUEST_ID });
    const resurrected = resources.find((resource) => evaluatePolicy(request, resource).action === "delete");
    expect(resurrected).toBeDefined();
    const plan = await rehearse();
    await execute(plan);
    await expect(controlPlane.verifyPlanExecution({ requestId: DEMO_REQUEST_ID, planHash: plan.planHash }))
      .resolves.toMatchObject({ status: "passed" });

    store.restoreResource(resurrected!);
    const rechecked = await controlPlane.verifyPlanExecution({ requestId: DEMO_REQUEST_ID, planHash: plan.planHash });
    expect(rechecked.status).toBe("failed");
    expect(rechecked.failures).toContainEqual(expect.objectContaining({ resourceId: resurrected!.resourceId }));
  });

  it("detects a new in-scope copy that was not present in the approved plan", async () => {
    const resources = await store.listResources("C-1842");
    const request = await controlPlane.getConsentRequest({ requestId: DEMO_REQUEST_ID });
    const template = resources.find((resource) => evaluatePolicy(request, resource).action === "delete");
    expect(template).toBeDefined();
    const plan = await rehearse();
    await execute(plan);
    await controlPlane.verifyPlanExecution({ requestId: DEMO_REQUEST_ID, planHash: plan.planHash });

    const unexpected = { ...template!, resourceId: `${template!.resourceId}-new-copy` };
    store.restoreResource(unexpected);
    const rechecked = await controlPlane.verifyPlanExecution({ requestId: DEMO_REQUEST_ID, planHash: plan.planHash });
    expect(rechecked.status).toBe("failed");
    expect(rechecked.failures).toContainEqual(expect.objectContaining({
      resourceId: unexpected.resourceId,
      actual: "unexpected_in_scope_copy"
    }));
  });

  it("detects a partial edit in the local SHA-256 audit chain", async () => {
    const plan = await rehearse();
    await execute(plan);
    await controlPlane.verifyPlanExecution({ requestId: DEMO_REQUEST_ID, planHash: plan.planHash });

    const evidence = await controlPlane.exportEvidencePacket({ requestId: DEMO_REQUEST_ID });
    expect(evidence.auditChain.valid).toBe(true);
    expect(verifyAuditChain(evidence.audit)).toBe(true);
    expect(evidence.audit.length).toBeGreaterThan(5);

    const tampered = structuredClone(evidence.audit);
    const target = tampered[1];
    expect(target).toBeDefined();
    target!.message = `${target!.message} tampered`;
    expect(verifyAuditChain(tampered)).toBe(false);
  });
});
