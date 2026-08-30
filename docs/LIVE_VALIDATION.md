# Live validation record

Validation date: 30 August 2026. All identities and records are synthetic.

This record separates three kinds of evidence: deterministic automated tests, a real Postgres/MinIO adapter run, and a live TrueForge orchestration run. A passing unit test is not presented as proof that the harness ran, and an agent message is not presented as proof that data changed.

## Result matrix

| Surface | Evidence | Result |
|---|---|---|
| Repository gate | TypeScript, ESLint, Vitest, production build, production dependency audit | Passed; 48 tests and zero known production dependency vulnerabilities |
| MCP transport | Official MCP SDK over stateless Streamable HTTP | Eight tools discovered and called through the wire protocol |
| Connector boundary | Direct unauthenticated MCP request | Rejected with HTTP 401 |
| Browser boundary | Hostile Origin and non-loopback Host tests | Rejected |
| Reset boundary | Reset without `X-EraseGraph-Demo: reset` | Rejected with HTTP 403 |
| Real stores | User-local PostgreSQL 18 and checksum-verified pinned MinIO release | Healthy and completed the full workflow |
| TrueForge | TrueForge 0.1.4, authenticated remote MCP, dynamic subagents, local sandbox | Reached exactly one native approval-required action |
| Destructive safety | State inspected while the TrueForge turn waited for approval | All ten resources remained present; no execution or destructive audit existed |

## Real Postgres and MinIO workflow

The production adapter was exercised outside Docker on isolated loopback ports so it did not interfere with the live TrueForge rehearsal:

- initial discovery: six Postgres records and four MinIO objects;
- server-validated rehearsal: four delete, six retain;
- execution: four physically deleted and six retained;
- same-key replay: identical idempotent receipt;
- fresh verification: four required absences, six required presences, zero failures;
- final independent counts: four Postgres subject rows and two MinIO objects;
- persistence: one plan, one execution receipt, one verification report, and nineteen audit events;
- evidence chain: valid, with `externallyAnchored: false` reported explicitly.

The run used the committed `PostgresMinioStore`, not the memory preview adapter. Temporary databases, objects, and logs were kept under ignored `.data/real-smoke`.

## Live TrueForge approval proof

TrueForge session `01m19d5s5177qqszznzfbj4wzb` (turn `01m19d5s5h622e0jzmdms6564j.local`) ran this sequence against the same real Postgres and MinIO stores:

1. `get_consent_request`
2. `get_retention_policy`
3. `search_postgres_records`
4. `search_minio_objects`
5. isolated, dependency-free Python sandbox reconciliation of all ten returned resources
6. `submit_erasure_rehearsal`
7. sandbox validation
8. `execute_approved_plan`

The discovery work appeared as the three named dynamic subagents `postgres-discovery`, `minio-discovery`, and `policy-discovery`. Their findings were independently re-read by the parent before sandbox reconciliation. The final call did not execute. The turn entered exactly one `tool.approval_required` action with the current plan hash `d7feef988b385c1af986f701348c764d11a52c0cf7369e833bf8163e0567663a`, a stable idempotency key, and four-delete/six-retain impact. No tool-approval response was sent.

Control-plane state at that pause:

- request and plan: `awaiting_approval`;
- resources still present: ten of ten;
- execution receipt: absent;
- verification report: absent;
- destructive audit events: zero;
- audit sequence: only reset and rehearsal submission, locally consistency-checked;
- browser console at the fully expanded native approval editor: zero errors and zero warnings.

This is the intended safety result: TrueForge, not a decorative application modal, owns the irreversible checkpoint. Because the final proof intentionally stops there, it is evidence of the integrated pre-approval path rather than a claim that this particular session performed the post-approval deletion. The separate real-store workflow above proves execution, idempotent replay, and fresh postcondition verification.

## Versions used for the harness proof

- TrueForge `0.1.4`
- TrueForge SDK `0.1.3`
- Node.js `22.23.2` in WSL2
- Python `3.12.3`
- bubblewrap `0.9.0`
- `@anthropic-ai/sandbox-runtime` `0.0.71`

The committed agent instructs sandbox reconciliation to use only built-in Python or Node APIs and to install no packages. Store credentials are never placed in the sandbox; it receives only MCP-returned JSON.

### Local Sandbox Runtime 0.0.71 compatibility finding

A clean, separate TrueForge 0.1.4 installation was tested with a Node-only generated command. Before that command ran, TrueForge unconditionally created a Python virtual environment, checked for Pydantic, and attempted its own one-time Pydantic installation. With `denyRead: ["/"]`, Sandbox Runtime's later filesystem tmpfs masked the filtered proxy sockets that had been bound earlier, causing sandbox initialization to fail closed.

The local WSL proof used a narrow argument-order fix: re-bind only the already-created HTTP and SOCKS Unix sockets after the filesystem arguments. Verification under the same root-deny policy showed:

- the explicitly allowlisted Pydantic index returned HTTP 200;
- an unlisted host remained blocked;
- no broad `/tmp` read grant was introduced;
- direct networking remained unavailable.

`scripts/run-trueforge-wsl.sh` makes this reproducible in a project-specific user-data runtime. `scripts/patch-trueforge-srt.mjs` refuses any package except exact Sandbox Runtime 0.0.71, verifies the pristine file SHA-256 and unique anchor, retains an exact backup, syntax-checks the result, and provides an explicit restore mode. This is a local demo-host compatibility patch, not a production sandbox policy.

## Re-run

Use the root quick start, then run:

```powershell
npm run configure:trueforge
npm run check
```

Reset only the synthetic demo, open EraseGraph, and send the prepared mission. Inspect the plan in TrueForge before approving. The real adapter can be reset and rerun repeatedly; destructive execution is idempotent per plan and key.
