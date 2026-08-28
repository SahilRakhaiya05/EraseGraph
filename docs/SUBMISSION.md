# Submission-ready copy

Replace bracketed URLs after the public repository, video, and Qodo-reviewed pull request exist.

## Project name

**EraseGraph — Right to erasure, with evidence**

## One-line description

An approval-gated TrueForge control plane that discovers one person's purpose-scoped data across Postgres and MinIO, safely deletes only allowed copies, and independently proves the result.

## Short description

Withdrawing consent is easy to record and hard to propagate safely. EraseGraph turns a synthetic model-training consent withdrawal into a complete operational change. TrueForge delegates discovery across two live stores, uses an isolated sandbox to reconcile the findings, and pauses at the exact destructive MCP call. The server—not the model—enforces scope, retention, plan completeness, state freshness, and idempotency. After approval it physically deletes four training-only records, preserves six account/audit/billing/hold records, re-queries both stores, and exports a SHA-256-chained evidence packet.

## Problem

Personal data spreads across relational rows, object stores, derived artifacts, and records that cannot all be treated the same. An operator must find the copies, separate target-purpose data from unrelated or retained data, authorize an exact change, handle retries, and prove the postcondition. A ticket marked “done” or an agent saying “deleted” is insufficient.

## Solution

EraseGraph combines a polished purpose graph with a typed MCP control plane:

- parallel Postgres, MinIO, and policy discovery;
- sandboxed reconciliation of every resource;
- server-validated immutable rehearsal and plan hash;
- native TrueForge approval for `execute_approved_plan`;
- real, idempotent deletion through storage-native adapters;
- independent negative and positive verification;
- exportable request, plan, execution, verification, and audit evidence.

The demonstration uses only synthetic `.example.test` data and does not claim legal compliance.

## Why TrueForge is essential

TrueForge is the execution boundary: MCP carries every live read and write; dynamic subagents split independent investigations; the Linux sandbox reconciles untrusted outputs without data-store credentials; the session pauses and resumes around one configured irreversible tool; persistent session state and the UI SDK expose the complete operator journey. Removing TrueForge would remove the orchestration, isolation, human checkpoint, and auditable resume semantics—not just the chat box.

## Technical highlights

- Node 22 + TypeScript + Express + Zod + official MCP SDK
- React 19 + TypeScript + Vite + lazy-loaded TrueForge UI SDK
- Postgres 16 + MinIO production adapter; memory adapter only for tests/protocol preview
- Complete-plan and unique-resource validation
- Server-side purpose/retention decisions
- Source fingerprints, source-state hash, immutable plan hash
- Stale-plan and drift rejection
- Resumable idempotent destructive execution with immutable approval attribution
- Transactional Postgres compare-and-delete and exact-version MinIO deletion
- Fail-closed MinIO metadata/version-history discovery and recoverable reset markers
- Independent existence verification
- SHA-256 hash-linked audit trail with an explicit external-anchoring limitation
- 39 automated frontend/backend tests plus typecheck, lint, production build, and dependency audit

## Track statements

### Best Use of TrueForge

EraseGraph makes the harness the product's safety boundary. Three discovery lanes feed a sandboxed reconciliation; all effects go through eight typed MCP tools; TrueForge deterministically requires approval for the sole destructive tool; the same session resumes into verification and evidence export. The UI visibly exposes the work, the wait, and the proof.

### Best Code Quality

The agent never receives arbitrary database credentials and never gets final authority. Typed schemas guard every boundary, deterministic server rules override model proposals, stale plans and protected records fail closed, destructive retries are resumable and idempotent, and success requires postcondition checks. Tests cover invalid/incomplete plans, retention protection, compare-and-delete races, MinIO metadata and version-history failures, interrupted-saga and terminal-audit recovery, immutable approvals, retained snapshot/policy drift, stale hashes, idempotency, verification, audit-chain modification detection, configuration safety, accessibility, and real MCP HTTP transport.

### Best UI

The original editorial landing page is a working product surface: live case lookup, keyboard-operable workflow, safety-control bento, current evidence refresh, local setup copy, FAQ, and responsive navigation all connect to real state or actions. Inside the workspace, a spatial purpose graph shows every copy and its fate; the action dock changes from suggested mission to exact approval diff to verified terminal state; and the official TrueForge UI is embedded as the working console. Both views are designed for desktop, iPad, and phone without hiding the decision boundary.

## Links

- Public repository: `[PUBLIC_REPOSITORY_URL]`
- Demo video: `[DEMO_VIDEO_URL]`
- Live demo, if published: `[LIVE_DEMO_URL]`
- Qodo-reviewed merged PR: `[QODO_PR_URL]`

## AI assistance disclosure

AI assistance was used for research, design exploration, implementation, testing, and documentation. The submitted code was inspected, executed, and validated by the team; deterministic application code—not model assertions—controls policy and data mutation.

## Build period and assets

All project-specific design and code in this repository was created during the TrueForge Agent Harness Hackathon build window. Open-source dependencies and their licenses are listed through the package lockfiles. No pre-existing product code or private production data is included.
