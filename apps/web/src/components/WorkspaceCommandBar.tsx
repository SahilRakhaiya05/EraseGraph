import { AlertTriangle, Bot, CalendarClock, Check, RefreshCw, ShieldCheck, Waypoints } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionStatus, MissionState } from "../types";
import { deriveMissionPhase, shortHash, titleCase } from "../utils";

interface WorkspaceCommandBarProps {
  state: MissionState;
  connection: ConnectionStatus;
  onOpenAgent: () => void;
  onRefresh: () => Promise<boolean>;
}

const progressByPhase = {
  ready: 12,
  discovering: 34,
  approval: 62,
  executing: 82,
  verified: 100,
  failed: 82,
} as const;

export function WorkspaceCommandBar({ state, connection, onOpenAgent, onRefresh }: WorkspaceCommandBarProps) {
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "checked" | "failed">("idle");
  const resetTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const phase = deriveMissionPhase(state);
  const daysRemaining = useMemo(() => {
    const deadline = new Date(state.request.deadlineAt).getTime();
    if (!Number.isFinite(deadline)) return null;
    return Math.max(0, Math.ceil((deadline - Date.now()) / 86_400_000));
  }, [state.request.deadlineAt]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
  }, []);

  const sync = async () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setSyncState("syncing");
    try {
      const refreshed = await onRefresh();
      if (!mountedRef.current) return;
      setSyncState(refreshed ? "checked" : "failed");
    } catch {
      if (!mountedRef.current) return;
      setSyncState("failed");
    }
    resetTimerRef.current = window.setTimeout(() => {
      setSyncState("idle");
      resetTimerRef.current = null;
    }, 1_500);
  };

  return (
    <section className="workspace-command-bar" aria-label="Live case command bar">
      <div className="command-case">
        <span className="command-case-icon"><Waypoints size={18} /></span>
        <div><small>Active privacy operation</small><strong>{state.request.id} · {state.request.subjectName}</strong></div>
      </div>

      <div className="command-progress" aria-label={`Workflow ${progressByPhase[phase]} percent complete`}>
        <div><span>{titleCase(phase)}</span><strong>{progressByPhase[phase]}%</strong></div>
        <i><span style={{ width: `${progressByPhase[phase]}%` }} /></i>
      </div>

      <div className="command-signals" aria-label="Case guardrails">
        <span className={state.request.verified ? "signal-verified" : "signal-unverified"}>
          {state.request.verified ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
          Identity {state.request.verified ? "verified" : "unverified"}
        </span>
        <span><CalendarClock size={14} /> {daysRemaining === null ? "Deadline recorded" : `${daysRemaining} days left`}</span>
        <span className={`signal-${connection}`}><i /> {titleCase(connection)}</span>
        {state.plan && <code title={state.plan.hash}>plan {shortHash(state.plan.hash, 8)}</code>}
      </div>

      <div className="command-actions">
        <button type="button" className="secondary-button" onClick={() => void sync()} disabled={syncState === "syncing"}>
          {syncState === "syncing" ? <RefreshCw className="spin" size={15} /> : syncState === "checked" ? <Check size={15} /> : syncState === "failed" ? <AlertTriangle size={15} /> : <RefreshCw size={15} />}
          {syncState === "syncing" ? "Syncing" : syncState === "checked" ? "Checked" : syncState === "failed" ? "Retry sync" : "Sync now"}
        </button>
        <button type="button" className="primary-button" onClick={onOpenAgent}><Bot size={15} /> Open agent</button>
      </div>
    </section>
  );
}
