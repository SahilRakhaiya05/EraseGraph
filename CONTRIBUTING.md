# Contributing

## Local checks

Use Node 22.14 or newer. Install each application independently:

```powershell
npm --prefix services/erasegraph-mcp ci
npm --prefix apps/web ci
npm run check
```

## Pull requests

- Keep effects behind the MCP control plane; UI code must never mutate a data store directly.
- Add a negative test for every new safety rule.
- Avoid claims of legal compliance in code, UI, or documentation.
- Use only synthetic identities and `.example.test` addresses.
- Run Qodo on every substantive pull request before merge and record addressed findings in the PR.
- Explain changes to plan hashing, policy, approval, or verification in the PR description.

## Commit style

Prefer small conventional commits such as `feat:`, `fix:`, `test:`, and `docs:`. Never commit `.env` files, API keys, generated evidence containing non-synthetic data, or local database volumes.
