# Why EraseGraph can win

Research snapshot: 30 August 2026. This is a decision memo, not a claim that every repository is complete or accurately described by its README.

## Decision

Build **EraseGraph**: an approval-gated control plane that withdraws one person's consent for one purpose across live data stores, preserves out-of-scope and policy-retained records, then independently proves the result.

The demo request is deliberately narrow:

> Withdraw Maya Chen's consent for model-training use across every connected store. Keep her active account and the billing record required by policy. Produce locally consistency-checked evidence of what changed and what did not, with the limits of an unkeyed, externally unanchored chain stated explicitly.

This gives judges one memorable sentence, an irreversible real-world action, a native TrueForge pause, deterministic safety checks, and a visual before/after outcome.

## What the judges actually reward

The official rules weight six criteria equally: potential impact, creativity, technical excellence, sponsor-tool use, control and safety, and presentation. A qualifying project must visibly run on TrueForge, expose a real MCP tool, execute generated code in an isolated sandbox, and require human approval before an irreversible action. The repository, setup guide, short write-up, approximately three-minute video, and Qodo-reviewed pull request are also part of the submission surface.

Sources: [event page](https://www.wemakedevs.org/hackathons/trueforge), [official rules](https://www.wemakedevs.org/hackathons/trueforge/rules), [schedule](https://www.wemakedevs.org/hackathons/trueforge/schedule), [TrueForge repository](https://github.com/truefoundry/trueforge), [sandbox documentation](https://trueforge.dev/sandbox), [MCP documentation](https://trueforge.dev/mcp-servers).

## Repository landscape

We queried GitHub for `trueforge` and the event phrase, then inspected the event-era union rather than trusting repository names alone.

- 173 candidate repositories
- 160 READMEs retrieved
- 143 repositories with descriptions
- 31 incident/SRE/DevOps projects
- 39 code, pull-request, migration, or dependency projects
- 50 governance, approval, or agent-observability projects
- 11 cybersecurity projects
- 7 creative/media/game projects
- 6 GPU/robotics/ML projects

The dominant lesson is that “MCP + sandbox + subagents + approval” is the starting line. The winning difference must be a coherent product in which those capabilities are necessary.

### Strongest patterns observed

| Entry | Strongest attribute | Gap EraseGraph exploits |
|---|---|---|
| [Airlock](https://github.com/Rohit-ATS/Airlock) | Deep policy gates, scope certificates, hash-chain ledger, broad tests | Its privacy slice computes scope from a local seed and mocked identifiers; it does not live-discover, execute, and independently re-query cross-store erasure |
| [TrueForge Android Operator](https://github.com/os-netizen/trueforge_android) | Unusual real-device action path with visible approvals | Different domain; validates that a physical, consequential effect demos well |
| [Licence to Patch](https://github.com/R3108/TrueForge-Hackathon) | Strong adversarial testing and repository-write controls | Crowded code-fixing category |
| [HEADCOUNT](https://github.com/sarthakagrawal927/headcount) | Memorable game/UI concept and simulation loop | Different domain; shows that a distinctive visual language matters |
| [Placebo](https://github.com/Hcoder10/placebo) | Treatment/control worlds and causal verification | Different domain; reinforces independent verification rather than agent self-report |
| [kernel-preflight](https://github.com/rycerzes/kernel-preflight) | Trusted measurement supervisor and anti-cheating gates | Strong technical benchmark, but specialized GPU audience |
| [DoneCornerAI](https://github.com/ss-pratapIIITB/DoneCornerAI) | Large, polished operational surface and Qodo discipline | Finance close is less open whitespace |
| [MCP Breaker](https://github.com/Muzzy5150/mcp-breaker) | Adversarial MCP testing and polished interface | Evaluates other tools rather than completing an end-user right |
| [ColdCall](https://github.com/Mulaydm10/ColdCall) | Deterministic calculations decide; the model orchestrates | Same architectural principle, different domain |

The closest adjacent privacy implementation is [Airlock's privacy agent](https://github.com/Rohit-ATS/Airlock/blob/main/agents/airlock-privacy.agent.json) and its [SQLite erasure-scope verifier](https://github.com/Rohit-ATS/Airlock/blob/main/scripts/verify-sqlite-erasure-scope.mjs). EraseGraph therefore does **not** pitch generic “AI GDPR deletion.” It demonstrates purpose-level consent propagation against real Postgres and MinIO, server-enforced retention, real deletion, re-query verification, idempotent retries, and an exportable evidence packet.

## Candidate scorecard

Scores are a weighted pre-build decision aid out of 100, based on official-criteria fit, event whitespace, seven-hour feasibility, demo reliability, and UI potential.

| Candidate | Score | Why it did or did not win |
|---|---:|---|
| Purpose-scoped consent operations | **88** | High impact, inherently approval-gated, visually legible, feasible with two real stores, and absent as a complete entry |
| Accessibility remediation operator | 81 | Strong impact/UI, but safe real-world execution and deterministic evaluation are harder to finish convincingly |
| Fraud evidence investigator | 77 | Clear commercial value, but crowded governance/risk territory and greater dataset credibility burden |
| Food rescue dispatcher | 77 | Empty event niche and social impact, but requires believable live logistics partners/data |
| Disaster response coordinator | 73 | Strong story, but real integrations and high-stakes safety are difficult within the deadline |

## Release readiness against the six judging criteria

This is a conservative internal red-team estimate of the finished local artifact, not an official score or a promise of placement. Public repository, authentic Qodo evidence, video quality, and the judges' own evaluation can materially change the result.

| Official criterion | Internal target readiness | Evidence in the artifact |
|---|---:|---|
| Potential impact | **91/100** | Turns a widely recognized privacy right into an inspectable operational change while keeping legal boundaries explicit |
| Creativity | **93/100** | Purpose-level erasure graph and evidence-first operator journey occupy a clear gap in the 173-repository landscape |
| Technical excellence | **94/100** | Real Postgres/MinIO path, exact-version mutation, resumable execution, drift rejection, fresh verification, 42 tests, and pull-request CI |
| Sponsor-tool use | **97/100** | Dynamic subagents, typed MCP, dependency-free sandbox reconciliation, native approval, persistent resume, and embedded TrueForge UI |
| Control and safety | **96/100** | Deterministic policy, complete-plan checks, state-bound approval, immutable attribution, idempotency, recovery, and honest evidence limits |
| Presentation | **94/100** | Functional editorial overview plus responsive decision workspace, live evidence, accessible interactions, and a timed demo story |

The remaining score risk is external execution: publish the repository, complete the real Qodo review/remediation/re-review cycle, record the approval-to-proof story cleanly, and submit before the deadline.

## Product thesis

Most privacy workflows stop at a ticket, an orchestration claim, or a deletion instruction. EraseGraph treats a right as an executable, reviewable, verifiable change:

1. Discover subject-linked records in each store using read-only connector tools.
2. Reconcile the requested purpose against a deterministic policy in the sandbox.
3. Submit a canonical plan and SHA-256 plan hash.
4. Pause in TrueForge with the exact delete/withdraw/retain diff.
5. Revalidate the approved hash and policy on the server, then execute idempotently.
6. Re-query the stores independently and emit a hash-chained evidence packet.

The model decides **how to investigate**. The control plane decides **what is allowed**. The human decides **whether the irreversible plan may run**.

## Track fit

### Best Use of TrueForge

- Dynamic subagents investigate Postgres, MinIO, and policy in parallel.
- MCP tools are the only route to live discovery and mutation.
- Sandbox/Code Mode reconciles results and produces a canonical candidate plan.
- `execute_approved_plan` is configured as a deterministic approval-required tool.
- Persistent sessions make the approval/resume moment visible and recoverable.

### Best Code Quality

- Typed domain boundaries and Zod validation
- Server-generated plan hashes; the model cannot authorize its own arbitrary plan
- Retained-record protection, stale-hash rejection, and idempotency
- Memory adapter for fast tests plus Postgres/MinIO production adapter
- MCP protocol integration tests, not only direct function tests
- Local audit-sequence consistency checks and fresh postcondition verification

### Best UI

- An iPad-responsive, light editorial control room instead of another dark log dashboard
- A spatial data-copy graph with clear delete, withdraw, retain, and verified states
- Exact approval impact adjacent to the native TrueForge console
- A “doing / waiting for you / proved” progression understandable without narration

## Honest boundaries

- The demo uses synthetic `.example.test` data only.
- It demonstrates technical controls; it does not claim legal compliance.
- It does not claim deletion from backups, downstream processors, or model weights.
- Identity verification is represented as a completed intake prerequisite, not performed by the agent.
- Production deployment would require authentication, connector-specific credentials, encrypted secret storage, multi-tenant isolation, recipient notification, backup lifecycle controls, and legal review.

The narrow scope makes the demo credible. The architecture leaves those next steps visible without pretending they are finished.
