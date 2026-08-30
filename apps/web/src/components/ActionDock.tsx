import { AlertTriangle, ArrowRight, Bot, CheckCircle2, Copy, FileDown, KeyRound, LoaderCircle, LockKeyhole, Trash2 } from "lucide-react";
import { useState } from "react";
import { evidencePacketUrl } from "../api";
import type { MissionState } from "../types";
import { deriveMissionPhase, shortHash } from "../utils";

export const RUN_PROMPT = `Process consent request ER-2048 end to end. Delegate Postgres, MinIO, and policy discovery to parallel subagents. Use only built-in Python or Node APIs in the sandbox—install no packages—then reconcile the returned records and build a purpose-scoped withdrawal plan for model_training only. Submit the erasure rehearsal, then call execute_approved_plan so TrueForge pauses for my approval. After approval, verify both stores and export the evidence packet.`;

interface ActionDockProps {
  state: MissionState;
  onOpenAgent: () => void;
}

export function ActionDock({ state, onOpenAgent }: ActionDockProps) {
  const phase = deriveMissionPhase(state);
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(RUN_PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  };

  if (phase === "verified" && state.verification) {
    return (
      <div className="action-dock completed-dock">
        <span className="dock-icon success"><CheckCircle2 size={22} /></span>
        <div><span className="eyebrow">Terminal state</span><strong>Consent withdrawal verified across every connected store</strong><small>The retained invoice remained unchanged and the local evidence sequence is internally consistent.</small></div>
        <a className="primary-button" href={evidencePacketUrl(state.request.id)} download>
          <FileDown size={17} /> Evidence packet
        </a>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="action-dock failure-dock">
        <span className="dock-icon danger"><AlertTriangle size={22} /></span>
        <div><span className="eyebrow">Verification blocked completion</span><strong>Residual or changed data was detected</strong><small>Do not re-approve this plan. Inspect the evidence, reset, and rehearse against fresh state.</small></div>
        <button className="approval-button" type="button" onClick={onOpenAgent}>Inspect in TrueForge <ArrowRight size={17} /></button>
      </div>
    );
  }

  if (phase === "executing") {
    return (
      <div className="action-dock execution-dock">
        <span className="dock-icon"><LoaderCircle className="spin" size={22} /></span>
        <div><span className="eyebrow">Approval consumed</span><strong>Execution recorded; independent verification is required</strong><small>Resume the same TrueForge session to check every deleted and retained resource.</small></div>
        <button className="primary-button" type="button" onClick={onOpenAgent}>Continue verification <ArrowRight size={17} /></button>
      </div>
    );
  }

  if (state.plan) {
    return (
      <div className="action-dock approval-dock">
        <span className="dock-icon warning"><KeyRound size={22} /></span>
        <div className="approval-copy">
          <span className="eyebrow">Human checkpoint · plan {shortHash(state.plan.hash, 9)}</span>
          <strong>Erase {state.plan.deleteCount} items only after you approve</strong>
          <small>The plan is immutable; any data drift invalidates this approval.</small>
        </div>
        <div className="approval-diff" aria-label="Planned action summary">
          <span className="diff-delete"><Trash2 size={14} /><strong>{state.plan.deleteCount}</strong> erase</span>
          <span className="diff-retain"><LockKeyhole size={14} /><strong>{state.plan.retainCount}</strong> retain</span>
        </div>
        <button className="approval-button" type="button" onClick={onOpenAgent}>
          Review in TrueForge <ArrowRight size={17} />
        </button>
      </div>
    );
  }

  return (
    <div className="action-dock command-dock ready-dock">
      <span className="dock-icon"><Bot size={21} /></span>
      <div>
        <span className="eyebrow">Suggested mission</span>
        <strong>Withdraw ML-training consent for {state.request.subjectId}</strong>
        <small>Copy the prompt, then press Open agent in the command bar.</small>
      </div>
      <button className="secondary-button" type="button" onClick={() => void copyPrompt()}>
        <Copy size={16} /> {copied ? "Copied" : "Copy prompt"}
      </button>
    </div>
  );
}
