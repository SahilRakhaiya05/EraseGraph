import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoState } from "../demoState";
import { WorkspaceCommandBar } from "./WorkspaceCommandBar";

afterEach(cleanup);

describe("live workspace command bar", () => {
  it("surfaces real guardrails and wires sync and agent controls", async () => {
    const onRefresh = vi.fn(async () => undefined);
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
});
