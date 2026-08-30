# Final submission runbook

Official deadline: **30 August 2026 at 19:00 UTC**, which is **31 August 2026 at 00:30 IST**. Recheck the [official schedule](https://www.wemakedevs.org/hackathons/trueforge/schedule) before submitting.

## 1. Publish the repository

This workspace is on `feat/erasegraph-mvp` and has no GitHub remote. Create a public repository, add it as `origin`, and push both `main` and the feature branch. Do not commit `.data`, environment files, tokens, database volumes, or local Playwright output.

## 2. Complete the required Qodo workflow

1. Open a substantive pull request from `feat/erasegraph-mvp` into `main`.
2. Run Qodo on that pull request before merge.
3. Address every actionable finding in the branch; document any explicitly non-blocking follow-up.
4. Re-run `npm run check`.
5. Ask Qodo to re-review the updated pull request.
6. Merge only after the review evidence is public.
7. Replace the placeholders under the root README's exact `## Qodo Code Review Evidence` heading with the merged PR URL, findings, remediation, and follow-up.

Do not fabricate this section locally: the public PR is the evidence. The detailed checklist is in `docs/QODO_CHECKLIST.md`.

## 3. Record the 2:50 demo

Use `docs/DEMO_SCRIPT.md`. Before recording:

- start Postgres and MinIO and confirm `/health` reports both `up`;
- start the control plane in default `real` mode;
- start TrueForge through the pinned Linux/WSL helper;
- run `npm run configure:trueforge`;
- start the web interface and reset only the synthetic demo;
- rehearse once, then reset again;
- hide unrelated tabs, notifications, terminals, and all secrets.

The central scene is the native `execute_approved_plan` pause. Hold long enough to show the immutable hash and four-delete/six-retain impact, approve it, then end on fresh verification with four absent, six present, and zero failures.

## 4. Use the prepared form copy

Copy the concise text from `docs/SUBMISSION.md`. Use:

- title: **EraseGraph — Right to erasure, with evidence**;
- repository: the public merged `main` URL;
- video: the public/unlisted demo URL accepted by the form;
- Qodo evidence: the merged reviewed PR URL;
- tracks: select **Best Use of TrueForge**, **Best Code Quality**, and **Best UI**.

Track emphasis:

- **TrueForge:** three discovery lanes, sandboxed reconciliation, eight MCP tools, native approval, same-session resume.
- **Code quality:** deterministic policy, exact state/hash binding, resumable idempotent deletion, fresh positive/negative verification, 48 tests, and pull-request CI.
- **UI:** functional editorial landing page, operational case story, purpose graph plus searchable decision ledger, live command bar/evidence, responsive desktop/iPad/phone layouts, and lazy official SDK console.

## 5. Submit and archive evidence

Complete the [registration form](https://forms.gle/dNHFh7wH8uJj4bZH8) if it is not already complete, then use the [submission form](https://forms.gle/PxGLsWW1HPyroQ5u9). Save the confirmation, final commit SHA, merged PR URL, video URL, and submission timestamp together.

## External items intentionally not fabricated in this workspace

- GitHub repository/remote URL
- public pull request and Qodo review
- merged commit on GitHub
- video URL
- registration/submission confirmation

Those steps require the entrant's GitHub identity, Qodo installation, video account, and form attestation.
