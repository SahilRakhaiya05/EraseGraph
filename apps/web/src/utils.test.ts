import { describe, expect, it } from "vitest";
import { demoState } from "./demoState";
import { actionCounts, deriveMissionPhase, shortHash, systemTone, titleCase } from "./utils";

describe("deriveMissionPhase", () => {
  it("moves through approval and verified states deterministically", () => {
    const approvalState = structuredClone(demoState);
    approvalState.plan = {
      hash: "abc123",
      status: "pending_approval",
      deleteCount: 4,
      retainCount: 2,
      anonymizeCount: 0,
      createdAt: "2026-08-30T09:00:00.000Z",
    };
    expect(deriveMissionPhase(approvalState)).toBe("approval");

    approvalState.verification = {
      status: "verified",
      checkedAt: "2026-08-30T09:01:00.000Z",
      deleted: 4,
      retained: 2,
      failures: 0,
    };
    expect(deriveMissionPhase(approvalState)).toBe("verified");
  });

  it("treats an active audit trail as discovery", () => {
    const discovering = structuredClone(demoState);
    discovering.audit.push({
      id: "evt-discovery",
      type: "search.started",
      message: "Searching live systems",
      createdAt: "2026-08-30T08:43:00.000Z",
      hash: "def456",
    });
    expect(deriveMissionPhase(discovering)).toBe("discovering");
  });

  it("never sends failed or executed plans back to approval", () => {
    const executed = structuredClone(demoState);
    executed.request.status = "executed";
    executed.plan = {
      hash: "abc123", status: "executed", deleteCount: 4, retainCount: 6, anonymizeCount: 0,
      createdAt: "2026-08-30T09:00:00.000Z",
    };
    expect(deriveMissionPhase(executed)).toBe("executing");

    executed.request.status = "verification_failed";
    executed.verification = { status: "failed", checkedAt: "2026-08-30T09:01:00.000Z", deleted: 3, retained: 6, failures: 1 };
    expect(deriveMissionPhase(executed)).toBe("failed");
  });
});

describe("presentation helpers", () => {
  it("counts every record action and derives a risk tone", () => {
    const counts = actionCounts(demoState.systems[0]);
    expect(counts).toEqual({ delete: 2, retain: 4, anonymize: 0, withdraw: 0, none: 0 });
    expect(systemTone(demoState.systems[0])).toBe("danger");
  });

  it("formats machine labels and hashes", () => {
    expect(titleCase("model_training.withdrawn")).toBe("Model Training Withdrawn");
    expect(shortHash("0123456789abcdef", 8)).toBe("01234567…");
    expect(shortHash("")).toBe("pending");
  });
});
