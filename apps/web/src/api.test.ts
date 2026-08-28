import { afterEach, describe, expect, it, vi } from "vitest";
import { evidencePacketUrl, fallbackMissionState, fetchMissionState, resetMission } from "./api";
import { demoState } from "./demoState";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("control-plane API", () => {
  it("normalizes missing optional state fields", async () => {
    const payload = { ...demoState, plan: undefined, verification: undefined };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })));

    const state = await fetchMissionState();
    expect(state.plan).toBeNull();
    expect(state.verification).toBeNull();
    expect(state.systems[0].recordCount).toBe(6);
  });

  it("unwraps reset payloads and fails closed on invalid responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: demoState }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resetMission()).resolves.toMatchObject({ request: { id: "ER-2048" } });
    await expect(fetchMissionState()).rejects.toThrow("returned invalid state");
  });

  it("returns an isolated fallback and encodes evidence identifiers", () => {
    const fallback = fallbackMissionState();
    fallback.request.status = "changed";
    expect(demoState.request.status).toBe("pending");
    expect(evidencePacketUrl("ER/2048")).toContain("ER%2F2048");
  });
});
