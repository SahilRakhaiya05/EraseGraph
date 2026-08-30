import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoState } from "../demoState";
import { WorkspaceCommandBar } from "./WorkspaceCommandBar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("live workspace command bar", () => {
  it("surfaces real guardrails and wires sync and agent controls", async () => {
    const onRefresh = vi.fn(async () => true);
    const onOpenAgent = vi.fn();
    render(
      <WorkspaceCommandBar
        state={demoState}
        connection="live"
        onOpenAgent={onOpenAgent}
        onRefresh={onRefresh}
      />
    );

    expect(screen.getByText(/ER-2048 · Maya Chen/)).toBeInTheDocument();
    expect(screen.getByText("Identity verified")).toBeInTheDocument();
    expect(screen.getByLabelText(/Workflow 12 percent complete/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Checked" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open agent" }));
    expect(onOpenAgent).toHaveBeenCalledOnce();
  });

  it("does not claim an unverified identity passed its prerequisite", () => {
    const unverifiedState = {
      ...demoState,
      request: { ...demoState.request, verified: false },
    };
    render(
      <WorkspaceCommandBar
        state={unverifiedState}
        connection="live"
        onOpenAgent={vi.fn()}
        onRefresh={vi.fn(async () => true)}
      />
    );

    expect(screen.getByText("Identity unverified")).toBeInTheDocument();
    expect(screen.queryByText("Identity verified")).not.toBeInTheDocument();
  });

  it("reports a failed refresh as retryable instead of checked", async () => {
    render(
      <WorkspaceCommandBar
        state={demoState}
        connection="stale"
        onOpenAgent={vi.fn()}
        onRefresh={vi.fn(async () => false)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(await screen.findByRole("button", { name: "Retry sync" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Checked" })).not.toBeInTheDocument();
  });

  it("cancels the previous reset timer when a newer sync starts", async () => {
    vi.useFakeTimers();
    render(
      <WorkspaceCommandBar
        state={demoState}
        connection="live"
        onOpenAgent={vi.fn()}
        onRefresh={vi.fn(async () => true)}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Checked" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_000));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Checked" }));
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByRole("button", { name: "Checked" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(900));
    expect(screen.getByRole("button", { name: "Sync now" })).toBeInTheDocument();
  });
});
