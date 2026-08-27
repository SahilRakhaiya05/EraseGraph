import { Check, ChevronDown, Clock3, Fingerprint } from "lucide-react";
import { useState } from "react";
import type { MissionState } from "../types";
import { deriveMissionPhase, formatDate, titleCase } from "../utils";

interface RequestRailProps {
  state: MissionState;
}

export function RequestRail({ state }: RequestRailProps) {
  const [policyOpen, setPolicyOpen] = useState(false);
  const phase = deriveMissionPhase(state);
  const completed = phase === "verified";
  const initials = state.request.subjectName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <aside className="request-rail" aria-label="Privacy request queue">
      <div className="rail-heading">
        <div>
          <span className="eyebrow">Operations queue</span>
          <h2>Requests</h2>
        </div>
        <span className="queue-count">1</span>
      </div>

      <nav className="request-list" aria-label="Requests">
        <article className="request-card is-active" aria-label={`Current request ${state.request.id}`}>
          <div className="request-card-top">
            <span className="request-id">{state.request.id}</span>
            <span className={`request-state state-${phase}`}>{titleCase(phase)}</span>
          </div>
          <strong>{state.request.subjectName}</strong>
          <span className="request-purpose">Withdraw · {titleCase(state.request.purpose)}</span>
          <div className="request-progress" aria-hidden="true"><i style={{ width: completed ? "100%" : state.plan ? "72%" : "24%" }} /></div>
        </article>
      </nav>

      <section className="subject-card" aria-labelledby="subject-title">
        <div className="subject-avatar" aria-hidden="true">{initials}</div>
        <div className="subject-copy">
          <span className="eyebrow" id="subject-title">Verified subject</span>
          <strong>{state.request.subjectName}</strong>
          <span>{state.request.email}</span>
        </div>
        <Fingerprint size={20} />
        <dl>
          <div><dt>Subject ID</dt><dd>{state.request.subjectId}</dd></div>
          <div><dt>Received</dt><dd>{formatDate(state.request.receivedAt)}</dd></div>
          <div><dt>Response by</dt><dd>{formatDate(state.request.deadlineAt)}</dd></div>
        </dl>
      </section>

      <button className="policy-link" type="button" onClick={() => setPolicyOpen((open) => !open)} aria-expanded={policyOpen} aria-controls="policy-pack-details">
        <Clock3 size={16} />
        <span><strong>Policy pack</strong><small>Purpose withdrawal · v1.2</small></span>
        <ChevronDown size={16} className={policyOpen ? "is-open" : undefined} />
      </button>
      {policyOpen && (
        <section className="policy-details" id="policy-pack-details" aria-label="Purpose withdrawal policy pack">
          <div><Check size={12} /><span><strong>Target purpose</strong><small>Delete unless retained</small></span></div>
          <div><Check size={12} /><span><strong>Outside scope</strong><small>Retain unchanged</small></span></div>
          <div><Check size={12} /><span><strong>Protected classes</strong><small>Legal hold, billing, consent proof</small></span></div>
          <p>Demo policy only; it does not determine legal compliance.</p>
        </section>
      )}
    </aside>
  );
}
