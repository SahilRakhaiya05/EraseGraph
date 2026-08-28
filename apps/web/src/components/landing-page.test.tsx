import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoState } from "../demoState";
import { LandingPage } from "./LandingPage";
import { RequestRail } from "./RequestRail";

afterEach(cleanup);

function renderLanding(overrides: Partial<ComponentProps<typeof LandingPage>> = {}) {
  const props: ComponentProps<typeof LandingPage> = {
    state: demoState,
    connection: "live",
    error: null,
    onLaunch: vi.fn(),
    onLaunchAgent: vi.fn(),
    onRefresh: vi.fn(async () => undefined),
    ...overrides,
  };
  render(<LandingPage {...props} />);
  return props;
}

describe("functional product overview", () => {
  it("rejects unknown case IDs and opens the real synthetic case", () => {
    const props = renderLanding();
    const input = screen.getByRole("textbox", { name: "Synthetic case ID" });

    fireEvent.change(input, { target: { value: "ER-9999" } });
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByRole("status")).toHaveTextContent("contains ER-2048");
    expect(props.onLaunch).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "er-2048" } });
    fireEvent.submit(input.closest("form")!);
    expect(props.onLaunch).toHaveBeenCalledOnce();
  });

  it("supports tab clicks, arrow keys, and the approval action", async () => {
    const props = renderLanding();
    const discover = screen.getByRole("tab", { name: /Discover/ });
    expect(discover).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /Reconcile/ })).toHaveAttribute("tabindex", "-1");
    discover.focus();
    fireEvent.keyDown(discover, { key: "ArrowRight" });

    const reconcile = screen.getByRole("tab", { name: /Reconcile/ });
    expect(reconcile).toHaveAttribute("aria-selected", "true");
    expect(reconcile).toHaveAttribute("tabindex", "0");
    expect(discover).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(reconcile).toHaveFocus());

    fireEvent.click(screen.getByRole("tab", { name: /Approve/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open native gate" }));
    expect(props.onLaunchAgent).toHaveBeenCalledOnce();
  });

  it("refreshes the evidence from the live-state callback", async () => {
    const onRefresh = vi.fn(async () => undefined);
    renderLanding({ onRefresh });
    fireEvent.click(screen.getByRole("button", { name: "Refresh evidence" }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
  });

  it("shows one honest queue item and expands its real policy pack", () => {
    render(<RequestRail state={demoState} />);
    expect(screen.getByText("ER-2048")).toBeInTheDocument();
    expect(screen.queryByText("ER-2047")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Purpose withdrawal policy pack")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Policy pack/ }));
    expect(screen.getByLabelText("Purpose withdrawal policy pack")).toHaveTextContent("Protected classes");
  });
});
