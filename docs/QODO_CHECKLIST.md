# Qodo review checklist

Qodo review evidence is a submission requirement, not an optional polish item. Do this on the public repository before the deadline.

1. Push `feat/erasegraph-mvp` to the public GitHub repository.
2. Open a pull request into `main` titled `feat: build approval-gated consent erasure control plane`.
3. Run Qodo Merge on that pull request before merging.
4. Treat every actionable finding: fix it or explain why it is not applicable.
5. Re-run tests and Qodo after fixes.
6. Merge the reviewed pull request.
7. Replace the placeholders in the root README's **Qodo Code Review Evidence** section with:
   - public merged pull-request URL;
   - concise findings summary;
   - remediation commit(s);
   - any acknowledged follow-up.
8. Verify the evidence link in a logged-out/incognito browser.

Never fabricate a review URL or claim that Qodo ran locally. The repository history should make the sequence review → remediation → merge easy for judges to verify.
