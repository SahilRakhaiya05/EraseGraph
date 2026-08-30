import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoState } from "../demoState";
import { AgentConsole } from "./AgentConsole";
import { DataGraph } from "./DataGraph";
import { StageTracker } from "./StageTracker";

vi.mock("@truefoundry/trueforge-ui", () => ({
  TrueForgeUI: () => <button type="button">Mock TrueForge action</button>,
}));

afterEach(cleanup);

function ConsoleHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open operator</button>
      {open && <AgentConsole open onClose={() => setOpen(false)} />}
    </div>
  );
}

describe("keyboard and assistive-technology behavior", () => {
  it("makes background controls inert and restores the modal opener", async () => {
    render(<ConsoleHarness />);
    const opener = screen.getByRole("button", { name: "Open operator" });
    opener.focus();
    fireEvent.click(opener);

    const close = await screen.findByRole("button", { name: "Close agent console" });
    await waitFor(() => expect(close).toHaveFocus());
    expect(opener.inert).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Erasure operator" })).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    expect(opener.inert).toBe(false);
  });

  it("names record details, closes on Escape, and restores the system trigger", async () => {
    render(<DataGraph state={demoState} />);
    const trigger = screen.getByRole("button", { name: /Customer Data Postgres/i });
    fireEvent.click(trigger);

    expect(await screen.findByRole("dialog", { name: "Customer Data Postgres" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Close record details" })).toHaveFocus());

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Customer Data Postgres" })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("announces the workflow phase and exposes the current step", () => {
    render(<StageTracker phase="approval" />);
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for human approval");
    expect(screen.getByRole("listitem", { name: "Approve: current" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("listitem", { name: "Rehearse: completed" })).toBeInTheDocument();
  });

  it("switches to a searchable decision ledger and filters real policy outcomes", () => {
    render(<DataGraph state={demoState} />);
    fireEvent.click(screen.getByRole("button", { name: "Ledger" }));
    expect(screen.getByRole("heading", { name: "Decision ledger" })).toBeInTheDocument();
    expect(screen.getByText(/10 resources shown/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search decision ledger" }), { target: { value: "billing" } });
    expect(screen.getByText("Billing invoice record")).toBeInTheDocument();
    expect(screen.getByText("Billing invoice artifact")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Erase" }));
    expect(screen.getByText("No matching resources")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retain" }));
    expect(document.querySelector(".ledger-count")).toHaveTextContent("2 of 10 resources shown");
  });
});
