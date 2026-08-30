import {
  ArrowRight,
  Bell,
  BookOpen,
  Boxes,
  Braces,
  Check,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  FileCheck2,
  FileJson,
  GitBranch,
  HardDrive,
  KeyRound,
  Layers,
  LockKeyhole,
  Menu,
  Network,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  Waypoints,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import type { ConnectionStatus, MissionState } from "../types";
import { deriveMissionPhase, formatDate, formatTimestamp, shortHash, titleCase } from "../utils";
import { BrandMark } from "./BrandMark";

interface LandingPageProps {
  state: MissionState;
  connection: ConnectionStatus;
  error: string | null;
  onLaunch: () => void;
  onLaunchAgent: () => void;
  onRefresh: () => Promise<boolean>;
}

const connectionLabels: Record<ConnectionStatus, string> = {
  connecting: "Connecting to control plane",
  live: "Live control plane",
  preview: "Safe preview seed",
  stale: "Last confirmed snapshot",
};

const QUICKSTART_COMMAND = "docker compose up -d && npm --prefix services/erasegraph-mcp ci && npm --prefix apps/web ci";

const NAV_ITEMS = [
  { href: "#use-case", label: "Use case" },
  { href: "#workflow", label: "Workflow" },
  { href: "#surfaces", label: "Surfaces" },
  { href: "#architecture", label: "Architecture" },
  { href: "#evidence", label: "Evidence" },
  { href: "#faq", label: "FAQ" },
] as const;

export function LandingPage({ state, connection, error, onLaunch, onLaunchAgent, onRefresh }: LandingPageProps) {
  const [caseId, setCaseId] = useState(state.request.id);
  const [lookupMessage, setLookupMessage] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [refreshing, setRefreshing] = useState(false);
  const phase = deriveMissionPhase(state);
  const previewStores = state.systems.slice(0, 2);
  const subjectInitials = state.request.subjectName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const isLive = connection === "live";
  const proofReady = phase === "verified";
  const gateActionLabel = proofReady ? "View proof" : phase === "executing" ? "Continue verification" : "Inspect gate";
  const runGateAction = proofReady ? onLaunch : onLaunchAgent;

  const totals = useMemo(() => {
    const records = state.systems.flatMap((system) => system.records);
    return {
      records: records.length,
      erase: state.plan?.deleteCount ?? records.filter((record) => ["delete", "withdraw", "anonymize"].includes(record.action)).length,
      retain: state.plan?.retainCount ?? records.filter((record) => record.action === "retain").length,
    };
  }, [state]);

  const workflowSteps = [
    {
      label: "Discover",
      eyebrow: "01 · Parallel discovery",
      title: `${state.systems.length} ${isLive ? "real stores" : "configured stores"}, one verified identity`,
      detail: "TrueForge delegates relational, object-store, and policy discovery without exposing store credentials to generated code.",
      metric: `${totals.records} resources`,
      icon: <Search size={20} />,
    },
    {
      label: "Reconcile",
      eyebrow: "02 · Isolated sandbox",
      title: `Every resource classified for ${state.request.purpose}`,
      detail: "Dependency-free sandbox code reconciles the complete inventory, while the server remains authoritative for purpose and retention policy.",
      metric: `${totals.erase} erase · ${totals.retain} retain`,
      icon: <Braces size={20} />,
    },
    {
      label: "Approve",
      eyebrow: "03 · Human checkpoint",
      title: state.plan ? `Plan ${shortHash(state.plan.hash, 12)} is sealed` : "The irreversible call cannot run silently",
      detail: "TrueForge pauses on the exact destructive MCP call. Edited, stale, incomplete, or drifted plans still fail closed at the server.",
      metric: state.plan ? titleCase(state.plan.status) : "Approval required",
      icon: <KeyRound size={20} />,
    },
    {
      label: "Verify",
      eyebrow: "04 · Independent proof",
      title: state.verification ? `${state.verification.deleted} absences and ${state.verification.retained} presences checked` : "Fresh reads—not an agent claim—decide success",
      detail: "The verifier re-queries both stores, proves required absences and retained presences, and exports the request, plan, receipt, checks, and local audit sequence.",
      metric: state.verification ? `${state.verification.failures} failures` : "Runs after approval",
      icon: <FileCheck2 size={20} />,
    },
  ];

  const operatorSurfaces = [
    {
      icon: <Network size={18} />,
      title: "Spatial graph",
      detail: "Map the subject to every store copy with live purpose, fingerprint, and retention metadata.",
      action: "Open graph",
      onClick: onLaunch,
    },
    {
      icon: <Layers size={18} />,
      title: "Decision ledger",
      detail: "Search and filter the complete erase/retain inventory with policy class and source fingerprints.",
      action: "Open ledger",
      onClick: onLaunch,
    },
    {
      icon: <KeyRound size={18} />,
      title: "Approval gate",
      detail: "Pause on the exact irreversible MCP call with the sealed plan hash and mutation diff.",
      action: "Open gate",
      onClick: onLaunchAgent,
    },
    {
      icon: <FileJson size={18} />,
      title: "Evidence packet",
      detail: "Export request, plan, receipt, verification checks, and the local hash-linked audit sequence.",
      action: "View evidence",
      onClick: onLaunch,
    },
    {
      icon: <GitBranch size={18} />,
      title: "Agent console",
      detail: "Run TrueForge with dynamic subagents, sandbox reconciliation, and native tool approval.",
      action: "Run agent",
      onClick: onLaunchAgent,
    },
    {
      icon: <BookOpen size={18} />,
      title: "Policy pack",
      detail: "Inspect purpose scope, protected classes, and fail-closed rules before any mutation.",
      action: "Inspect policy",
      onClick: onLaunch,
    },
  ];

  const closeMobileNav = (event: MouseEvent<HTMLAnchorElement>) => {
    const menu = event.currentTarget.closest("details");
    if (menu) menu.open = false;
  };

  const submitLookup = (event: FormEvent) => {
    event.preventDefault();
    if (caseId.trim().toUpperCase() !== state.request.id.toUpperCase()) {
      setLookupMessage(`This reproducible demo contains ${state.request.id}. Try that case ID.`);
      return;
    }
    setLookupMessage("");
    onLaunch();
  };

  const copyQuickstart = async () => {
    try {
      await navigator.clipboard.writeText(QUICKSTART_COMMAND);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    window.setTimeout(() => setCopyStatus("idle"), 1_600);
  };

  const refreshEvidence = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const moveWorkflowFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keyOffsets: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    let nextIndex: number | undefined;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = workflowSteps.length - 1;
    else if (event.key in keyOffsets) nextIndex = (index + keyOffsets[event.key] + workflowSteps.length) % workflowSteps.length;
    if (nextIndex === undefined) return;
    event.preventDefault();
    setActiveStep(nextIndex);
    window.requestAnimationFrame(() => document.getElementById(`workflow-tab-${nextIndex}`)?.focus());
  };

  return (
    <div className="landing-shell" id="top">
      <header className="landing-nav-wrap">
        <nav className="landing-nav" aria-label="Primary navigation">
          <a className="landing-brand" href="#top" aria-label="EraseGraph home"><BrandMark /></a>
          <div className="landing-links">
            {NAV_ITEMS.map((item) => (
              <a key={item.href} href={item.href}>{item.label}</a>
            ))}
          </div>
          <div className="landing-nav-actions">
            <span className={`landing-live connection-${connection}`}><i /> {connectionLabels[connection]}</span>
            <button className="landing-button landing-button-ghost" type="button" onClick={onLaunchAgent}>
              Run with agent
            </button>
            <button className="landing-button landing-button-dark" type="button" onClick={onLaunch}>
              Open workspace <ArrowRight size={16} />
            </button>
          </div>
          <details className="landing-mobile-menu">
            <summary aria-label="Open navigation"><Menu size={19} /></summary>
            <div>
              {NAV_ITEMS.map((item) => (
                <a key={item.href} href={item.href} onClick={closeMobileNav}>{item.label}</a>
              ))}
              <button
                type="button"
                onClick={(event) => {
                  const menu = event.currentTarget.closest("details");
                  if (menu) menu.open = false;
                  onLaunchAgent();
                }}
              >
                Run with agent
              </button>
              <button
                type="button"
                onClick={(event) => {
                  const menu = event.currentTarget.closest("details");
                  if (menu) menu.open = false;
                  onLaunch();
                }}
              >
                Open workspace
              </button>
            </div>
          </details>
        </nav>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="hero-beams" aria-hidden="true" />
          <div className="hero-content">
            <button className="hero-proof-pill" type="button" onClick={() => document.getElementById("evidence")?.scrollIntoView({ behavior: "smooth" })}>
              <ShieldCheck size={15} /> {isLive ? "Live synthetic case" : "Synthetic preview case"} <span>{state.request.id}</span> <ArrowRight size={14} />
            </button>
            <h1 id="landing-title">Public data spreads fast.<br /><span>Erasure still needs proof.</span></h1>
            <p>
              The all-in-one privacy operations workspace for purpose-scoped consent withdrawal.
              Discover copies, reconcile policy, pause for exact approval, and independently verify the outcome.
            </p>

            <form className="case-lookup" onSubmit={submitLookup}>
              <label className="sr-only" htmlFor="case-id">Synthetic case ID</label>
              <Search size={18} aria-hidden="true" />
              <input id="case-id" value={caseId} onChange={(event) => setCaseId(event.target.value)} autoComplete="off" spellCheck="false" aria-describedby="case-lookup-status" placeholder="Enter case ID" />
              <button type="submit">Start investigating <ArrowRight size={16} /></button>
            </form>
            <p id="case-lookup-status" className={`lookup-status ${lookupMessage || error ? "is-error" : ""}`} role="status">
              {lookupMessage || error || `${state.request.subjectName} · ${titleCase(state.request.purpose)} · synthetic data only`}
            </p>

            <div className="hero-cta-row">
              <button className="landing-button landing-button-dark" type="button" onClick={onLaunch}>
                Open live workspace <ArrowRight size={16} />
              </button>
              <button className="landing-button landing-button-outline" type="button" onClick={() => document.getElementById("architecture")?.scrollIntoView({ behavior: "smooth" })}>
                View architecture
              </button>
            </div>
          </div>

          <div className="hero-stage">
            <aside className="hero-float-card float-policy" aria-label="Policy analysis preview">
              <div className="float-card-head">
                <Radar size={15} />
                <strong>Policy analysis</strong>
                <span>Live</span>
              </div>
              <ul>
                <li><span>Training-only matches</span><strong>{totals.erase}</strong></li>
                <li><span>Retention protected</span><strong>{totals.retain}</strong></li>
                <li><span>Purpose bound</span><strong>100%</strong></li>
              </ul>
            </aside>

            <aside className="hero-float-card float-alerts" aria-label="Operator activity preview">
              <div className="float-card-head">
                <Bell size={15} />
                <strong>Case activity</strong>
              </div>
              <ol>
                <li><i /> Identity verified <small>ready</small></li>
                <li><i /> Inventory reconciled <small>{totals.records} resources</small></li>
                <li><i /> {state.plan ? "Plan sealed" : "Awaiting rehearsal"} <small>{state.plan ? shortHash(state.plan.hash, 8) : "pending"}</small></li>
              </ol>
            </aside>

            <aside className="hero-float-card float-team" aria-label="Operator roles preview">
              <div className="float-card-head">
                <Users size={15} />
                <strong>Operator roles</strong>
              </div>
              <ul className="float-team-list">
                <li><span>Privacy operator</span><em>Owner</em></li>
                <li><span>TrueForge harness</span><em>Executor</em></li>
                <li><span>Control plane</span><em>Policy</em></li>
              </ul>
            </aside>

            <div className="hero-product-frame" aria-label="Live EraseGraph case preview">
              <div className="product-frame-bar">
                <span><i className={`connection-${connection}`} /> {connectionLabels[connection]}</span>
                <code>{state.request.id}</code>
                <button type="button" onClick={onLaunch}>Explore workspace <ArrowRight size={14} /></button>
              </div>
              <div className="hero-graph-preview">
                <div className="hero-preview-copy">
                  <span className="eyebrow">Purpose map · {titleCase(phase)}</span>
                  <h2>{state.request.subjectName}</h2>
                  <p>{totals.records} resources reconciled against <code>{state.request.purpose}</code></p>
                </div>
                <div className="preview-map" aria-hidden="true">
                  <span className="preview-person">{subjectInitials}</span>
                  <i className="preview-line line-left" />
                  <i className="preview-line line-right" />
                  {previewStores[0] && <span className="preview-store preview-store-left"><Database size={20} /> {previewStores[0].name.replace("Customer Data ", "")} <small>{previewStores[0].recordCount} records</small></span>}
                  {previewStores[1] && <span className="preview-store preview-store-right"><HardDrive size={20} /> {previewStores[1].name.replace("Training Artifacts ", "")} <small>{previewStores[1].recordCount} objects</small></span>}
                </div>
                <div className="preview-decision">
                  <span><Trash2 size={15} /><strong>{totals.erase}</strong> erase</span>
                  <span><LockKeyhole size={15} /><strong>{totals.retain}</strong> retain</span>
                  <button type="button" onClick={runGateAction}>{proofReady ? <FileCheck2 size={15} /> : <KeyRound size={15} />} {gateActionLabel}</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <ul className="capability-ribbon" aria-label="Product capabilities">
          {["TrueForge 0.1.4", "8 typed MCP tools", "Dynamic subagents", "Linux sandbox", "Native approval", "Fresh verification", "Hash-linked evidence", "Postgres + MinIO"].map((item) => (
            <li key={item}><CheckCircle2 size={15} /> {item}</li>
          ))}
        </ul>

        <section className="landing-section philosophy-section" id="philosophy" aria-labelledby="philosophy-title">
          <div className="section-heading centered-heading">
            <span className="section-kicker">Built for real privacy workflows</span>
            <h2 id="philosophy-title">A deletion is only useful when the proof travels with it.</h2>
            <p>EraseGraph turns a verified request into case context, exact impact, and inspectable evidence—without handing store credentials to generated code.</p>
          </div>
          <div className="philosophy-grid">
            <article>
              <span><Search size={20} /></span>
              <h3>Follow the request</h3>
              <p>Start from a verified identity and a purpose-scoped consent withdrawal—not a blanket delete of the whole customer relationship.</p>
            </article>
            <article>
              <span><Boxes size={20} /></span>
              <h3>Build the inventory</h3>
              <p>Bring Postgres rows, MinIO objects, fingerprints, and retention decisions into one complete, reviewable case file.</p>
            </article>
            <article>
              <span><ShieldCheck size={20} /></span>
              <h3>Keep the proof</h3>
              <p>Seal the plan, pause for human approval, re-query both stores, and export an evidence packet that survives inspection.</p>
            </article>
          </div>
        </section>

        <section className="landing-section use-case-section" id="use-case" aria-labelledby="use-case-title">
          <div className="section-heading split-heading">
            <div><span className="section-kicker">A real operational case</span><h2 id="use-case-title">One request. Ten copies.<br />No blanket delete.</h2></div>
            <p>Maya withdrew one purpose—not her entire customer relationship. EraseGraph converts that narrow instruction into a reviewable change across relational and object storage.</p>
          </div>
          <div className="case-story-grid">
            <article className="case-file-card">
              <div className="case-file-header">
                <span><UserCheck size={22} /></span>
                <div><small>Verified data-subject request</small><h3>{state.request.id} · {state.request.subjectName}</h3></div>
                <i className={`connection-${connection}`}>{connectionLabels[connection]}</i>
              </div>
              <dl>
                <div><dt>Subject</dt><dd>{state.request.subjectId}</dd></div>
                <div><dt>Purpose withdrawn</dt><dd><code>{state.request.purpose}</code></dd></div>
                <div><dt>Received</dt><dd>{formatDate(state.request.receivedAt)}</dd></div>
                <div><dt>Target deadline</dt><dd>{formatDate(state.request.deadlineAt)}</dd></div>
              </dl>
              <div className="case-scope-map" aria-label="Current case scope">
                <div><span><Database size={17} /></span><strong>{state.systems[0]?.recordCount ?? 0}</strong><small>Postgres rows</small></div>
                <Waypoints size={22} />
                <div><span><HardDrive size={17} /></span><strong>{state.systems[1]?.recordCount ?? 0}</strong><small>MinIO objects</small></div>
              </div>
              <button className="landing-button landing-button-dark" type="button" onClick={onLaunch}>Inspect the complete case <ArrowRight size={16} /></button>
            </article>

            <div className="case-outcome-stack">
              <article className="outcome-card outcome-impact">
                <span className="section-kicker">Purpose-aware impact</span>
                <div><strong>{totals.erase}</strong><span>eligible to erase</span><i /> <strong>{totals.retain}</strong><span>must remain</span></div>
                <p>Training-only copies are eligible for removal; account service, billing, consent proof, and legal-hold records remain governed by deterministic policy.</p>
              </article>
              <article className="outcome-card outcome-journey">
                <div className={state.request.verified ? "is-complete" : ""}><span><UserCheck size={15} /></span><p><strong>Identity prerequisite</strong><small>{state.request.verified ? "Verified before the agent runs" : "Not verified"}</small></p></div>
                <div className={totals.records > 0 ? "is-complete" : ""}><span><Search size={15} /></span><p><strong>Cross-store inventory</strong><small>{totals.records} resources accounted</small></p></div>
                <div className={state.verification ? "is-complete" : state.plan ? "is-current" : ""}><span><KeyRound size={15} /></span><p><strong>Human decision</strong><small>{state.plan ? `${totals.erase} exact mutations awaiting approval` : "Rehearsal creates the exact diff"}</small></p></div>
                <div className={state.verification ? "is-complete" : ""}><span><FileCheck2 size={15} /></span><p><strong>Independent proof</strong><small>{state.verification ? `${state.verification.failures} verification failures` : "Fresh reads run after execution"}</small></p></div>
              </article>
              <div className="case-story-actions">
                <button className="landing-button landing-button-outline" type="button" onClick={() => void refreshEvidence()} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : undefined} size={15} /> {refreshing ? "Checking" : "Check live state"}</button>
                <button className="landing-button landing-button-dark" type="button" onClick={onLaunchAgent}><KeyRound size={15} /> Open human gate</button>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section workflow-section" id="workflow" aria-labelledby="workflow-title">
          <div className="section-heading centered-heading">
            <span className="section-kicker">A complete operator journey</span>
            <h2 id="workflow-title">From identity signal to verified outcome.</h2>
            <p>Each stage below maps to working code, live store reads, and inspectable evidence.</p>
          </div>
          <div className="workflow-showcase">
            <div className="workflow-tabs" role="tablist" aria-label="Erasure workflow stages">
              {workflowSteps.map((step, index) => (
                <button
                  key={step.label}
                  type="button"
                  role="tab"
                  id={`workflow-tab-${index}`}
                  aria-selected={activeStep === index}
                  aria-controls="workflow-panel"
                  tabIndex={activeStep === index ? 0 : -1}
                  className={activeStep === index ? "is-active" : ""}
                  onClick={() => setActiveStep(index)}
                  onKeyDown={(event) => moveWorkflowFocus(event, index)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>{step.label}
                </button>
              ))}
            </div>
            <div id="workflow-panel" className="workflow-panel" role="tabpanel" aria-labelledby={`workflow-tab-${activeStep}`}>
              <div className="workflow-panel-copy">
                <span className="workflow-icon">{workflowSteps[activeStep].icon}</span>
                <span className="eyebrow">{workflowSteps[activeStep].eyebrow}</span>
                <h3>{workflowSteps[activeStep].title}</h3>
                <p>{workflowSteps[activeStep].detail}</p>
                <strong className="workflow-metric">{workflowSteps[activeStep].metric}</strong>
                <button className="landing-button landing-button-dark" type="button" onClick={activeStep === 2 ? onLaunchAgent : onLaunch}>
                  {activeStep === 2 ? "Open native gate" : "Inspect in workspace"} <ArrowRight size={16} />
                </button>
              </div>
              <div className="workflow-terminal" aria-label="Workflow evidence preview">
                <div><span /> <span /> <span /><code>erasegraph / {workflowSteps[activeStep].label.toLowerCase()}</code></div>
                <ol>
                  <li>{state.request.verified ? <Check size={14} /> : <LockKeyhole size={14} />} request <code>{state.request.id}</code> identity {state.request.verified ? "verified" : "blocked"}</li>
                  <li><Check size={14} /> scope <code>{state.request.purpose}</code> bound server-side</li>
                  <li>{state.plan ? <Check size={14} /> : <Search size={14} />} plan hash {state.plan ? shortHash(state.plan.hash, 16) : "awaiting rehearsal"}</li>
                  <li className={activeStep >= 2 ? "is-current" : ""}><KeyRound size={14} /> irreversible boundary {state.plan ? titleCase(state.plan.status) : "armed"}</li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section surfaces-section" id="surfaces" aria-labelledby="surfaces-title">
          <div className="section-heading split-heading">
            <div>
              <span className="section-kicker">Everything you need in one workspace</span>
              <h2 id="surfaces-title">Operator surfaces built for signal-to-action speed.</h2>
            </div>
            <p>Every control opens a working product surface—not a static mock. Graph, ledger, gate, evidence, agent, and policy stay tied to the same live case.</p>
          </div>
          <div className="surfaces-grid">
            {operatorSurfaces.map((surface) => (
              <article key={surface.title} className="surface-card">
                <span className="surface-icon">{surface.icon}</span>
                <h3>{surface.title}</h3>
                <p>{surface.detail}</p>
                <button className="text-action" type="button" onClick={surface.onClick}>
                  {surface.action} <ArrowRight size={15} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section" id="safety" aria-labelledby="safety-title">
          <div className="section-heading split-heading">
            <div><span className="section-kicker">Control is a product feature</span><h2 id="safety-title">The model proposes.<br />The boundary decides.</h2></div>
            <p>Every destructive assumption is checked again by deterministic server code. The interface exposes the wait, the exact impact, and the proof.</p>
          </div>

          <div className="proof-bento">
            <article className="bento-card bento-stores">
              <div className="bento-title"><span><Database size={18} /></span><div><small>{isLive ? "Real connector boundary" : "Configured connector preview"}</small><h3>Two stores, one complete inventory</h3></div></div>
              <div className="store-list">
                {state.systems.map((system) => (
                  <div key={system.id}><span>{system.kind.includes("object") ? <HardDrive size={17} /> : <Database size={17} />}</span><div><strong>{system.name}</strong><small>{system.recordCount} {system.kind.includes("object") ? "objects" : "records"}</small></div><i>{isLive ? system.status : "preview"}</i></div>
                ))}
              </div>
              <button className="text-action" type="button" onClick={onLaunch}>Inspect every source record <ArrowRight size={15} /></button>
            </article>

            <article className="bento-card bento-approval">
              <div className="approval-orbit" aria-hidden="true"><span><KeyRound size={24} /></span></div>
              <span className="section-kicker">Native TrueForge approval</span>
              <h3>{proofReady ? "Fresh postconditions are verified" : phase === "executing" ? "Execution is recorded; verification is next" : state.plan ? `${totals.erase} exact deletions are waiting` : "No irreversible call can skip the gate"}</h3>
              <p>{proofReady ? `Independent reads completed with ${state.verification?.failures ?? 0} failures.` : state.plan ? `Plan ${shortHash(state.plan.hash, 18)} is bound to current source versions.` : "Run the rehearsal to seal an exact plan and source-state hash."}</p>
              <button className="landing-button landing-button-light" type="button" onClick={runGateAction}>{proofReady ? "View verification" : phase === "executing" ? "Continue run" : "Review approval"} <ArrowRight size={16} /></button>
            </article>

            <article className="bento-card bento-controls">
              <div className="bento-title"><span><ShieldCheck size={18} /></span><div><small>Fail-closed controls</small><h3>Safety that survives retries and races</h3></div></div>
              <div className="control-checks">
                {["Complete-plan validation", "Immutable approval attribution", "Postgres compare-and-delete", "Exact-version MinIO deletion", "Interrupted-saga recovery"].map((control) => (
                  <span key={control}><Check size={13} /> {control}</span>
                ))}
              </div>
              <details>
                <summary>What fails closed?</summary>
                <p>Unverified identity, unknown metadata, historical object versions, incomplete plans, stale hashes, data drift, concurrent executions, and audit-sequence inconsistency all block mutation.</p>
              </details>
            </article>

            <article className="bento-card bento-agents">
              <div className="bento-title"><span><GitBranch size={18} /></span><div><small>Visible orchestration</small><h3>Three independent discovery lanes</h3></div></div>
              <div className="agent-lane-list">
                <span><Database size={15} /> postgres-discovery {state.plan ? <Check size={13} /> : <i />}</span>
                <span><HardDrive size={15} /> minio-discovery {state.plan ? <Check size={13} /> : <i />}</span>
                <span><LockKeyhole size={15} /> policy-discovery {state.plan ? <Check size={13} /> : <i />}</span>
              </div>
              <button className="text-action" type="button" onClick={onLaunchAgent}>Open the live agent trace <ArrowRight size={15} /></button>
            </article>
          </div>
        </section>

        <section className="landing-section architecture-section" id="architecture" aria-labelledby="architecture-title">
          <div className="section-heading centered-heading">
            <span className="section-kicker">Final system diagram</span>
            <h2 id="architecture-title">Trust boundaries you can read at a glance.</h2>
            <p>The UI never talks to the stores directly. TrueForge orchestrates. The MCP control plane owns policy, mutation, and proof.</p>
          </div>
          <div className="architecture-board" aria-label="EraseGraph system architecture">
            <div className="arch-lane">
              <span className="arch-lane-label">Human</span>
              <div className="arch-node arch-human">Privacy operator</div>
            </div>
            <div className="arch-flow" aria-hidden="true">→</div>
            <div className="arch-lane">
              <span className="arch-lane-label">Product</span>
              <div className="arch-node">EraseGraph UI</div>
              <div className="arch-node arch-accent">TrueForge harness</div>
              <div className="arch-node">Linux sandbox</div>
            </div>
            <div className="arch-flow" aria-hidden="true">→</div>
            <div className="arch-lane">
              <span className="arch-lane-label">Control plane</span>
              <div className="arch-node arch-accent">8 MCP tools</div>
              <div className="arch-node">Policy + hashes</div>
              <div className="arch-node">Evidence export</div>
            </div>
            <div className="arch-flow" aria-hidden="true">→</div>
            <div className="arch-lane">
              <span className="arch-lane-label">Stores</span>
              <div className="arch-node"><Database size={14} /> Postgres 16</div>
              <div className="arch-node"><HardDrive size={14} /> MinIO</div>
            </div>
          </div>
          <div className="architecture-notes">
            <p><KeyRound size={15} /> Exact approval pause on <code>execute_approved_plan</code></p>
            <p><ShieldCheck size={15} /> Server recomputes policy before every mutation</p>
            <p><FileCheck2 size={15} /> Independent verification after execution</p>
          </div>
        </section>

        <section className="landing-section evidence-section" id="evidence" aria-labelledby="evidence-title">
          <div className="section-heading split-heading">
            <div><span className="section-kicker">{isLive ? "Live evidence, not a success toast" : "Evidence preview, clearly labeled"}</span><h2 id="evidence-title">See what the system can actually prove.</h2></div>
            <button className="landing-button landing-button-outline" type="button" onClick={() => void refreshEvidence()} disabled={refreshing}>
              <RefreshCw className={refreshing ? "spin" : undefined} size={16} /> {refreshing ? "Refreshing" : "Refresh evidence"}
            </button>
          </div>
          <div className="evidence-grid">
            <article className="live-ledger">
              <div className="ledger-heading"><div><span className="section-kicker">Control-plane ledger</span><h3>{state.audit.length} current events</h3></div><span className={`landing-live connection-${connection}`}><i /> {titleCase(connection)}</span></div>
              <ol>
                {[...state.audit].reverse().slice(0, 4).map((event, index) => (
                  <li key={event.id}><span>{index === 0 ? <Sparkles size={15} /> : <Check size={15} />}</span><div><strong>{event.message}</strong><small>{formatTimestamp(event.createdAt)} · {event.system ? `${titleCase(event.system)} · ` : ""}{shortHash(event.hash, 10)}</small></div></li>
                ))}
              </ol>
              <p><ShieldCheck size={15} /> Locally consistency-checked; the exported packet explicitly reports that this unkeyed sequence is not externally anchored.</p>
            </article>
            <aside className="evidence-summary" aria-label="Current case evidence summary">
              <span className="verification-mark"><ShieldCheck size={34} /></span>
              <span className="section-kicker">Current case posture</span>
              <h3>{state.verification ? titleCase(state.verification.status) : state.plan ? "Awaiting a person" : "Ready to rehearse"}</h3>
              <dl>
                <div><dt>Identity</dt><dd>{state.request.verified ? "Verified" : "Blocked"}</dd></div>
                <div><dt>Accounted resources</dt><dd>{totals.records}</dd></div>
                <div><dt>Planned impact</dt><dd>{totals.erase} erase · {totals.retain} retain</dd></div>
                <div><dt>Fresh verification</dt><dd>{state.verification ? `${state.verification.failures} failures` : "Not run"}</dd></div>
              </dl>
              <button className="landing-button landing-button-dark" type="button" onClick={onLaunch}>Open full evidence view <ArrowRight size={16} /></button>
            </aside>
          </div>
        </section>

        <section className="landing-section quickstart-section" id="run" aria-labelledby="quickstart-title">
          <div>
            <span className="section-kicker">Cloneable by design</span>
            <h2 id="quickstart-title">Run locally or deploy the hosted product.</h2>
            <p>
              One repository contains the UI, typed MCP control plane, deterministic seed, TrueForge manifest, tests, and submission evidence.
              Use Docker locally for the judging path, or deploy the SPA + memory-backed API to Vercel with <code>npx vercel --prod</code>.
              Only TrueForge needs your model-provider key.
            </p>
          </div>
          <div className="quickstart-command"><code>{QUICKSTART_COMMAND}</code><button type="button" onClick={() => void copyQuickstart()} aria-label="Copy local setup command">{copyStatus === "copied" ? <Check size={17} /> : <Copy size={17} />}{copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy setup"}</button></div>
        </section>

        <section className="landing-section faq-section" id="faq" aria-labelledby="faq-title">
          <div className="section-heading split-heading">
            <div><span className="section-kicker">Straight answers</span><h2 id="faq-title">Before you hand an agent a deletion.</h2></div>
            <p>The demo is designed to be inspected, reset, and challenged—not taken on faith.</p>
          </div>
          <div className="faq-list">
            <details open><summary>Is the data path real?</summary><p>Yes. The default adapter reads and mutates local Postgres and versioned MinIO through typed MCP tools. The identities and ten records are intentionally synthetic.</p></details>
            <details><summary>Can the model bypass approval?</summary><p>No. TrueForge owns the native pause on <code>execute_approved_plan</code>, and the control plane independently rejects unverified, incomplete, stale, changed, or policy-invalid requests.</p></details>
            <details><summary>Which API keys are required?</summary><p>EraseGraph and its frontend need no external API key. TrueForge needs a configured model provider; this repository's helper accepts <code>OPENAI_API_KEY</code>. The MCP bearer token stays local and is never shown in the UI.</p></details>
            <details><summary>Is the evidence a legal compliance certificate?</summary><p>No. It is operational evidence for a synthetic demonstration. The local SHA-256 sequence detects accidental or partial modification, but is explicitly not externally anchored.</p></details>
            <details><summary>What does EraseGraph delete?</summary><p>Only purpose-scoped training copies authorized by the sealed plan. Account-service, billing, consent-history, and legal-hold records are retained by deterministic policy.</p></details>
            <details><summary>How do I reset the demo safely?</summary><p>Use <code>POST /api/demo/reset</code> or the workspace reset control. Docker volumes stay local and are never removed by project scripts.</p></details>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div><BrandMark /><p>Right to erasure, with evidence.</p></div>
        <nav aria-label="Footer navigation">
          <a href="#use-case">Use case</a>
          <a href="#surfaces">Surfaces</a>
          <a href="#architecture">Architecture</a>
          <a href="#evidence">Evidence</a>
          <a href="#run">Run locally</a>
          <a href="#faq">FAQ</a>
          <a href="https://www.wemakedevs.org/hackathons/trueforge" target="_blank" rel="noreferrer">TrueForge hackathon <ExternalLink size={13} /></a>
        </nav>
        <span>Synthetic demonstration · not legal advice</span>
      </footer>
    </div>
  );
}
