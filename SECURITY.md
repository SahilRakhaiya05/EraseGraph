# Security policy

EraseGraph is a local hackathon prototype for synthetic data. Do not connect it to production systems or expose ports 5173, 8787, 8790, 54329, 59000, or 59001 to an untrusted network.

## Supported version

Only the latest commit on `main` is supported during the hackathon.

## Reporting

Do not open a public issue for a vulnerability that could affect someone running the demo. Send a private report to the repository owner through GitHub's private vulnerability reporting feature once the public repository enables it. Include reproduction steps, impact, and a suggested mitigation if available.

## Built-in boundaries

- Services bind to loopback addresses.
- Demo identities use the reserved `.example.test` namespace.
- The agent receives MCP tools, not database credentials.
- Destructive execution requires an exact plan hash, source-state match, idempotency key, and a TrueForge approval.
- Server policy overrides model proposals.
- Evidence explicitly disclaims legal certification.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the complete threat model and production gaps.
