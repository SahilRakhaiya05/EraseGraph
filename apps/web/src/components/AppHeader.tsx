import { Bot, RotateCcw, ShieldCheck } from "lucide-react";
import type { ConnectionStatus } from "../types";
import { BrandMark } from "./BrandMark";

interface AppHeaderProps {
  connection: ConnectionStatus;
  isResetting: boolean;
  onBack: () => void;
  onOpenAgent: () => void;
  onReset: () => void;
}

const connectionLabels: Record<ConnectionStatus, string> = {
  connecting: "Connecting",
  live: "Control plane live",
  preview: "Preview data",
  stale: "Last live snapshot",
};

export function AppHeader({ connection, isResetting, onBack, onOpenAgent, onReset }: AppHeaderProps) {
  return (
    <header className="app-header">
      <button className="brand-home" type="button" onClick={onBack} aria-label="Back to EraseGraph overview"><BrandMark /></button>
      <div className="runtime-strip" aria-label="Runtime capabilities">
        <span><ShieldCheck size={14} /> Purpose-scoped</span>
        <span><i className="runtime-dot" /> Postgres + MinIO</span>
        <span><i className="runtime-dot" /> SHA-256 ledger</span>
      </div>
      <div className="header-actions">
        <span className={`connection-pill connection-${connection}`}>
          <i /> {connectionLabels[connection]}
        </span>
        <button className="icon-button" type="button" onClick={onReset} disabled={isResetting} title="Reset demo data">
          <RotateCcw size={17} className={isResetting ? "spin" : undefined} />
          <span className="sr-only">Reset demo data</span>
        </button>
        <button className="primary-button" type="button" onClick={onOpenAgent}>
          <Bot size={17} /> Open agent
        </button>
      </div>
    </header>
  );
}
