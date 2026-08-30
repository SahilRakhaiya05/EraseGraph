import { RotateCcw, ShieldCheck } from "lucide-react";
import type { ConnectionStatus } from "../types";
import { BrandMark } from "./BrandMark";

interface AppHeaderProps {
  connection: ConnectionStatus;
  isResetting: boolean;
  onBack: () => void;
  onReset: () => void;
}

const connectionLabels: Record<ConnectionStatus, string> = {
  connecting: "MCP connecting",
  live: "MCP live",
  preview: "MCP preview",
  stale: "MCP stale",
};

export function AppHeader({ connection, isResetting, onBack, onReset }: AppHeaderProps) {
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
        <button className="secondary-button header-reset" type="button" onClick={onReset} disabled={isResetting} title="Reset demo data">
          <RotateCcw size={15} className={isResetting ? "spin" : undefined} />
          <span>{isResetting ? "Resetting" : "Reset"}</span>
        </button>
      </div>
    </header>
  );
}
