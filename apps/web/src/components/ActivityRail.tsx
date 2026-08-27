import {
  Braces,
  Check,
  CircleDashed,
  Clock3,
  Database,
  FileCheck2,
  GitBranch,
  HardDrive,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { AuditEvent, MissionState } from "../types";
import { deriveMissionPhase, formatTimestamp, shortHash, titleCase } from "../utils";

interface ActivityRailProps {
  state: MissionState;
}

function EventIcon({ event }: { event: AuditEvent }) {
  const key = `${event.type} ${event.system ?? ""}`.toLowerCase();
  if (key.includes("minio") || key.includes("object")) return <HardDrive size={14} />;
  if (key.includes("postgres") || key.includes("record")) return <Database size={14} />;
  if (key.includes("plan") || key.includes("rehears")) return <Braces size={14} />;
  if (key.includes("approval") || key.includes("gate")) return <KeyRound size={14} />;
  if (key.includes("verify") || key.includes("evidence")) return <FileCheck2 size={14} />;
  return <Check size={14} />;
}

export function ActivityRail({ state }: ActivityRailProps) {
  const phase = deriveMissionPhase(state);
  const latestEvents = [...state.audit].reverse().slice(0, 7);

  return (
    <aside className="activity-rail" aria-labelledby="activity-title">
      <div className="activity-heading">
        <div>
          <span className="eyebrow">TrueForge flight recorder</span>
          <h2 id="activity-title">Agent run</h2>
        </div>
        <span className={`phase-badge phase-${phase}`}><i /> {titleCase(phase)}</span>
      </div>

      <section className="agent-crew" aria-label="Agent crew">
        <div className="crew-title"><GitBranch size={15} /><strong>Parallel discovery crew</strong><span>3 lanes</span></div>
        <div className="crew-lanes">
          <div className={state.audit.some((event) => event.system?.toLowerCase().includes("postgres")) ? "is-done" : ""}>
            <span><Database size={14} /></span><p><strong>Relational scout</strong><small>Postgres identity joins</small></p><Check size={13} />
          </div>
          <div className={state.audit.some((event) => event.system?.toLowerCase().match(/minio|object/)) ? "is-done" : ""}>
            <span><HardDrive size={14} /></span><p><strong>Object scout</strong><small>MinIO metadata search</small></p><Check size={13} />
          </div>
          <div className={state.plan ? "is-done" : ""}>
            <span><LockKeyhole size={14} /></span><p><strong>Policy scout</strong><small>Purpose + retention rules</small></p>{state.plan ? <Check size={13} /> : <CircleDashed size={13} />}
          </div>
        </div>
      </section>

      <section className="sandbox-card" aria-label="Sandbox status">
        <div className="sandbox-icon"><Braces size={18} /></div>
        <div>
          <span className="eyebrow">Isolated rehearsal</span>
          <strong>{state.plan ? "Plan compiled and sealed" : "Waiting for discovery bundles"}</strong>
          <small>{state.plan ? `SHA-256 ${shortHash(state.plan.hash, 12)}` : "TrueForge sandbox · no data-store credentials exposed"}</small>
        </div>
        <span className={state.plan ? "sandbox-status is-ready" : "sandbox-status"}>{state.plan ? <Check size={13} /> : <Clock3 size={13} />}</span>
      </section>

      <div className="activity-log-heading">
        <span>Evidence stream</span>
        <span>{state.audit.length} events</span>
      </div>
      <ol className="activity-log">
        {latestEvents.map((event, index) => (
          <li key={event.id} className={index === 0 ? "is-latest" : ""}>
            <span className="event-icon"><EventIcon event={event} /></span>
            <div>
              <strong>{event.message}</strong>
              <span>{event.system ? `${titleCase(event.system)} · ` : ""}{formatTimestamp(event.createdAt)}</span>
            </div>
            <code>{shortHash(event.hash, 7)}</code>
          </li>
        ))}
        {state.audit.length === 1 && (
          <li className="is-pending">
            <span className="event-icon"><Sparkles size={14} /></span>
            <div><strong>Discovery ready to begin</strong><span>Open the agent and run the case</span></div>
          </li>
        )}
      </ol>

      {state.verification && (
        <section className={`verification-card ${state.verification.failures === 0 ? "is-passed" : "is-failed"}`}>
          <span className="verification-seal"><ShieldCheck size={24} /></span>
          <div><span className="eyebrow">Independent verifier</span><strong>{state.verification.failures === 0 ? "Purpose withdrawal proven" : "Residual copies detected"}</strong><small>{state.verification.deleted} removed · {state.verification.retained} policy-held · {state.verification.failures} failures</small></div>
        </section>
      )}
    </aside>
  );
}
