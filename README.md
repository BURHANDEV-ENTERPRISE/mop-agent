# MOP-AGENT (monorepo)

Self-hostable AI **brain** (control plane) that remembers everything across all your
projects — a superset of Hermes/OpenClaw with a structured, federated, growing Brain.
Projects run **MOP-FLOW**, which dials out to MOP-AGENT to feed and use the Brain.

> Specs: see [`planning/MOP-AGENT-PRD.md`](../myney.core%20v2.0.0%20copy/planning/MOP-AGENT-PRD.md)
> and [`planning/MOP-FLOW-vNext.md`](../myney.core%20v2.0.0%20copy/planning/MOP-FLOW-vNext.md).

## Layout

```txt
mop-agent/
├── apps/
│   └── web/                 # MOP-AGENT — Next.js (UI + API + ws gateway)
├── packages/
│   ├── link-protocol/       # shared types (AGENT <-> FLOW message schemas)
│   └── flow-connector/      # MOP-FLOW vNext connector (dial-out client, dev here)
└── data/                    # runtime Brain + SQLite (gitignored)
```

Why FLOW is in this repo: MOP-AGENT only does anything once a FLOW node links to it.
Keeping the connector + shared protocol here lets us build and test the full
**learning loop** locally before the connector merges into the published `mop-flow`.

## Status

🟡 Scaffolding (Fasa 0 → 1). See the roadmap in the PRD.

## Dev

```bash
npm install
npm run typecheck
# web app + flow connector dev scripts come online as phases land
```

Cross-platform: Windows + Linux (Node ≥ 20, no bash-only scripts).
