import { describe, expect, it } from "vitest";
import { stateHash } from "../src/hashing.js";
import type { ResourceSnapshot } from "../src/domain.js";

const resource: ResourceSnapshot = {
  system: "minio",
  resourceId: "subjects/C-1842/model-training/example.txt",
  subjectId: "C-1842",
  label: "Example",
  category: "training_text",
  purposes: ["model_training"],
  retentionClass: "none",
  fingerprint: "a".repeat(64),
  sizeBytes: 7,
  createdAt: "2026-08-30T10:00:00.000Z",
  versionId: "version-a",
};

describe("stateHash", () => {
  it("binds approval to policy metadata and the object-store version", () => {
    expect(stateHash([resource])).not.toBe(stateHash([{ ...resource, versionId: "version-b" }]));
    expect(stateHash([resource])).not.toBe(stateHash([{ ...resource, retentionClass: "legal_hold" }]));
  });
});
