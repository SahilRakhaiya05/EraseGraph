import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  CheckCircle2,
  Database,
  FileKey2,
  Fingerprint,
  HardDrive,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MissionState, RecordAction } from "../types";
import { actionCounts, deriveMissionPhase, systemTone, titleCase } from "../utils";
import { StageTracker } from "./StageTracker";

const positions = [
  { x: 18, y: 23 },
  { x: 82, y: 23 },
  { x: 18, y: 76 },
  { x: 82, y: 76 },
] as const;

function SystemIcon({ kind, name }: { kind: string; name: string }) {
  const key = `${kind} ${name}`.toLowerCase();
  if (key.includes("minio") || key.includes("object") || key.includes("vault")) return <HardDrive size={20} />;
  if (key.includes("billing") || key.includes("invoice")) return <ReceiptText size={20} />;
  if (key.includes("evidence") || key.includes("sha")) return <FileKey2 size={20} />;
  return <Database size={20} />;
}

const actionIcons: Record<RecordAction, ReactNode> = {
  delete: <Trash2 size={13} />,
  retain: <LockKeyhole size={13} />,
  anonymize: <Fingerprint size={13} />,
  withdraw: <X size={13} />,
  none: <Box size={13} />,
};

interface DataGraphProps {
  state: MissionState;
}

export function DataGraph({ state }: DataGraphProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sheetCloseRef = useRef<HTMLButtonElement>(null);
  const sheetTriggerRef = useRef<HTMLButtonElement | null>(null);
  const phase = deriveMissionPhase(state);
  const systems = state.systems.slice(0, 4);
  const activePositions = systems.length === 1
    ? [{ x: 50, y: 22 }]
    : systems.length === 2
      ? [{ x: 18, y: 50 }, { x: 82, y: 50 }]
      : systems.length === 3
        ? [{ x: 18, y: 28 }, { x: 82, y: 28 }, { x: 50, y: 79 }]
        : positions;
  const selected = useMemo(
    () => systems.find((system) => system.id === selectedId) ?? null,
    [selectedId, systems],
  );

  const totalRecords = systems.reduce((sum, system) => sum + system.recordCount, 0);
  const plannedChanges = state.plan
    ? state.plan.deleteCount + state.plan.anonymizeCount
    : systems.reduce((sum, system) => {
        const counts = actionCounts(system);
        return sum + counts.delete + counts.anonymize + counts.withdraw;
      }, 0);

  useEffect(() => {
    if (selectedId === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedId(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => sheetCloseRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => sheetTriggerRef.current?.focus(), 0);
    };
  }, [selectedId]);

  return (
    <section className="graph-workspace" aria-labelledby="graph-title">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">Live purpose graph</span>
          <h1 id="graph-title">Trace every copy. Prove every action.</h1>
          <p>Withdrawal is scoped to <code>{state.request.purpose}</code>; unrelated account data stays untouched.</p>
        </div>
        <div className="case-metrics" aria-label="Case metrics">
          <div><span>Systems</span><strong>{systems.length}</strong></div>
          <div><span>Accounted</span><strong>{totalRecords}</strong></div>
          <div><span>In scope</span><strong>{plannedChanges}</strong></div>
        </div>
      </div>

      <StageTracker phase={phase} />

      <div className={`data-graph phase-${phase}`}>
        <div className="graph-grid" aria-hidden="true" />
        <svg className="graph-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {systems.map((system, index) => {
            const position = activePositions[index] ?? positions[0];
            return (
              <motion.line
                key={system.id}
                x1="50"
                y1="50"
                x2={position.x}
                y2={position.y}
                pathLength="1"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
                className={`edge-${systemTone(system)}`}
              />
            );
          })}
        </svg>

        <motion.div
          className="subject-node"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <span className="node-orbit" aria-hidden="true" />
          <span className="subject-icon"><UserRound size={22} /></span>
          <div><small>Data subject</small><strong>{state.request.subjectName}</strong><span>{state.request.subjectId}</span></div>
          <span className="verified-tick" title="Identity verified"><ShieldCheck size={15} /></span>
        </motion.div>

        {systems.map((system, index) => {
          const position = activePositions[index] ?? positions[0];
          const tone = systemTone(system);
          const counts = actionCounts(system);
          return (
            <motion.button
              type="button"
              key={system.id}
              className={`system-node tone-${tone} ${selectedId === system.id ? "is-selected" : ""}`}
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
              onClick={(event) => {
                sheetTriggerRef.current = event.currentTarget;
                setSelectedId(system.id);
              }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.1 + index * 0.08 }}
              aria-label={`${system.name}, ${system.recordCount} records`}
              aria-haspopup="dialog"
              aria-expanded={selectedId === system.id}
              aria-controls="record-details-sheet"
            >
              <span className="system-node-icon"><SystemIcon kind={system.kind} name={system.name} /></span>
              <span className="system-node-copy">
                <small>{system.kind}</small>
                <strong>{system.name}</strong>
                <span>{system.recordCount} {system.recordCount === 1 ? "record" : "records"}</span>
              </span>
              <span className="node-actions" aria-hidden="true">
                {counts.delete + counts.withdraw + counts.anonymize > 0 && (
                  <i className="action-delete">{counts.delete + counts.withdraw + counts.anonymize} act</i>
                )}
                {counts.retain > 0 && <i className="action-retain">{counts.retain} hold</i>}
              </span>
            </motion.button>
          );
        })}

        <div className="graph-legend" aria-label="Graph legend">
          <span><i className="legend-delete" /> Erase or withdraw</span>
          <span><i className="legend-retain" /> Policy retain</span>
          <span><i className="legend-verified" /> Verified</span>
        </div>

        <AnimatePresence>
          {selected && (
            <motion.div
              id="record-details-sheet"
              className="record-sheet"
              role="dialog"
              aria-modal="false"
              aria-labelledby="record-details-title"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: "spring", stiffness: 330, damping: 30 }}
            >
              <div className="record-sheet-header">
                <span className={`system-node-icon tone-${systemTone(selected)}`}><SystemIcon kind={selected.kind} name={selected.name} /></span>
                <div><small>{selected.kind}</small><strong id="record-details-title">{selected.name}</strong></div>
                <button ref={sheetCloseRef} type="button" onClick={() => setSelectedId(null)} aria-label="Close record details"><X size={18} /></button>
              </div>
              <div className="record-list">
                {selected.records.length === 0 ? (
                  <div className="empty-records"><CheckCircle2 size={18} /> No in-scope records remain</div>
                ) : selected.records.map((record) => (
                  <article key={record.id} className={`record-row action-${record.action}`}>
                    <span className="record-action-icon">{actionIcons[record.action]}</span>
                    <div><strong>{record.label}</strong><span>{titleCase(record.category)} · {record.id}</span></div>
                    <span className="record-decision">{titleCase(record.status === "present" ? record.action : record.status)}</span>
                    {record.reason && <p>{record.reason}</p>}
                  </article>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
