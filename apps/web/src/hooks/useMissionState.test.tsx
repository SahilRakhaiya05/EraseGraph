import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMissionState } from "../api";
import { demoState } from "../demoState";
import { useMissionState } from "./useMissionState";

vi.mock("../api", () => ({
  fallbackMissionState: () => demoState,
  fetchMissionState: vi.fn(),
  resetMission: vi.fn(),
}));

const mockedFetchMissionState = vi.mocked(fetchMissionState);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("mission state refresh outcomes", () => {
  it("returns false when a refresh fails so controls cannot report success", async () => {
    mockedFetchMissionState.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useMissionState());

    await waitFor(() => expect(result.current.connection).toBe("preview"));
    let refreshed = true;
    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(refreshed).toBe(false);
    expect(result.current.error).toBe("offline");
  });

  it("joins an in-flight poll instead of creating a competing manual refresh", async () => {
    let resolveRequest: ((state: typeof demoState) => void) | undefined;
    mockedFetchMissionState.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    const { result } = renderHook(() => useMissionState());

    const first = result.current.refresh();
    const second = result.current.refresh();
    expect(second).toBe(first);
    expect(mockedFetchMissionState).toHaveBeenCalledOnce();

    resolveRequest?.(demoState);
    await act(async () => {
      expect(await first).toBe(true);
    });
    expect(result.current.connection).toBe("live");
  });
});
