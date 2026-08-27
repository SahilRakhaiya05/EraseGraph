import { Check } from "lucide-react";
import type { MissionPhase } from "../utils";

const stages = [
  { id: "identity", label: "Identity" },
  { id: "discovering", label: "Discover" },
  { id: "rehearsal", label: "Rehearse" },
  { id: "approval", label: "Approve" },
  { id: "verified", label: "Verify" },
] as const;

const phaseIndex: Record<MissionPhase, number> = {
  ready: 0,
  discovering: 1,
  approval: 3,
  executing: 4,
  verified: 5,
  failed: 4,
};

const phaseAnnouncements: Record<MissionPhase, string> = {
  ready: "Identity ready",
  discovering: "Discovering connected records",
  approval: "Waiting for human approval",
  executing: "Executing and independently verifying",
  verified: "Verification complete",
  failed: "Verification failed",
};

interface StageTrackerProps {
  phase: MissionPhase;
}

export function StageTracker({ phase }: StageTrackerProps) {
  const currentIndex = phaseIndex[phase];
  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">Workflow status: {phaseAnnouncements[phase]}.</span>
      <ol className="stage-tracker" aria-label="Erasure workflow progress">
        {stages.map((stage, index) => {
          const done = index < currentIndex || phase === "verified";
          const active = index === currentIndex || (phase === "approval" && stage.id === "approval");
          const state = phase === "failed" && active ? "failed" : done ? "completed" : active ? "current" : "not started";
          return (
            <li
              key={stage.id}
              className={`${done ? "is-done" : ""} ${active ? "is-active" : ""} ${phase === "failed" && active ? "is-failed" : ""}`}
              aria-current={active ? "step" : undefined}
              aria-label={`${stage.label}: ${state}`}
            >
              <span className="stage-marker" aria-hidden="true">{done ? <Check size={12} /> : index + 1}</span>
              <span aria-hidden="true">{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
