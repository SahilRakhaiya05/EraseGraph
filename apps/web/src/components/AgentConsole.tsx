import { Check, Copy, ExternalLink, LoaderCircle, X } from "lucide-react";
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { TRUEFORGE_BASE_URL } from "../api";
import { RUN_PROMPT } from "./ActionDock";
import { BrandMark } from "./BrandMark";

const TrueForgeUI = lazy(() =>
  import("@truefoundry/trueforge-ui").then((module) => ({ default: module.TrueForgeUI })),
);

interface AgentConsoleProps {
  open: boolean;
  onClose: () => void;
}

class AgentErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="agent-error-state" role="alert">
          <strong>The embedded harness could not initialize.</strong>
          <span>EraseGraph remains safe. Confirm TrueForge is running, then close and reopen this panel.</span>
          <a className="primary-button" href={TRUEFORGE_BASE_URL} target="_blank" rel="noreferrer">
            Open TrueForge directly <ExternalLink size={16} />
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AgentConsole({ open, onClose }: AgentConsoleProps) {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = backdropRef.current;
    const background = backdrop === null
      ? []
      : [...(backdrop.parentElement?.children ?? [])].filter((element) => element !== backdrop);
    for (const element of background) {
      if (element instanceof HTMLElement) element.inert = true;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => !element.inert && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
        closeRef.current?.focus();
      } else if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.classList.add("dialog-open");
    document.addEventListener("keydown", onKeyDown, true);
    window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      for (const element of background) {
        if (element instanceof HTMLElement) element.inert = false;
      }
      document.body.classList.remove("dialog-open");
      document.removeEventListener("keydown", onKeyDown, true);
      window.setTimeout(() => openerRef.current?.focus(), 0);
    };
  }, [open]);

  if (!open) return null;

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(RUN_PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  };

  return (
    <div ref={backdropRef} className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="agent-console" role="dialog" aria-modal="true" aria-labelledby="agent-console-title">
        <header className="agent-console-header">
          <BrandMark />
          <div className="agent-console-title">
            <span className="eyebrow">Powered by the TrueForge harness</span>
            <h2 id="agent-console-title">Erasure operator</h2>
          </div>
          <span className="harness-pill"><i /> localhost:8790</span>
          <a className="icon-button" href={TRUEFORGE_BASE_URL} target="_blank" rel="noreferrer" title="Open TrueForge in a new tab"><ExternalLink size={17} /><span className="sr-only">Open TrueForge in a new tab</span></a>
          <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="Close agent console"><X size={19} /></button>
        </header>

        <div className="mission-prompt">
          <div><span className="eyebrow">Paste this deterministic demo mission</span><p>{RUN_PROMPT}</p></div>
          <button type="button" onClick={() => void copyPrompt()}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}</button>
        </div>

        <div className="trueforge-frame">
          <AgentErrorBoundary>
            <Suspense
              fallback={(
                <div className="agent-loading-state" role="status">
                  <LoaderCircle className="spin" size={24} />
                  <strong>Connecting to the TrueForge harness</strong>
                  <span>Loading the approval-aware agent console…</span>
                </div>
              )}
            >
              <TrueForgeUI
                server={{ type: "trueforge", baseUrl: TRUEFORGE_BASE_URL }}
                layout="drawer"
                agentConfig={{ mode: "SingleAgent", name: "erasegraph-operator" }}
                theme={{
                  preset: "trueforge",
                  mode: "light",
                  brand: {
                    name: "EraseGraph",
                    logo: "/erasegraph-mark.svg",
                  },
                }}
              />
            </Suspense>
          </AgentErrorBoundary>
        </div>
      </section>
    </div>
  );
}
