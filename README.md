# WHITEHAT

**Everything on-chain is exposed. See where.**

WHITEHAT is a defensive security product for [Elysium](https://chainstack.com/what-is-elysium/), Kinetiq's Layer 2 on Hyperliquid. One interface: paste a contract or connect a wallet, and get one security report covering **smart-contract breach risk**, **quantum readiness**, and **wallet privacy**. AI agents continuously test newly deployed contracts on a private fork. Creator fees from the `$WHITEHAT` coin fund compute and bug bounties.

> It is not an audit. It never says a contract is "safe". It never sends a transaction to a live network. It never publishes working exploit code.

---

## What it does

| Report | Input | Output |
|---|---|---|
| **Contract** | A contract address | Breach-risk findings with strict evidence levels, a shareable grade, and a quantum section. |
| **Quantum (wallet)** | A wallet address | Whether the public key is exposed on-chain, balance at risk, and a migration checklist. |
| **Privacy (wallet)** | A wallet **you prove you own** (free signature) | Funding links, address reuse, exchange deposit links, approvals, traceable patterns — with steps to reduce them. Private to you. |

### Evidence levels (enforced in code)

- **CONFIRMED ON FORK** — a test reproduced it on a private local fork of the contract.
- **LIKELY** — strong static evidence (verified source or bytecode, incl. Slither).
- **REVIEW** — an AI reviewer flagged it. A lead for a human, never shown as a confirmed bug.

AI suspicion can **never** be promoted above REVIEW. See `src/lib/analysis/evidence.ts`.

---

## Hard safety rules (enforced, not just documented)

1. **No live-network state changes.** Every RPC call and every Foundry invocation passes through a guard (`src/lib/safety/txguard.ts`). Only read-only methods are allowed against live networks; anything that changes state is allowed only on a private local Anvil fork that this process started. The fork always uses a different chain ID than the live network.
2. **No published exploits.** Exploitable findings on contracts we don't own are withheld from public reports. Proofs are stored **encrypted** (AES-256-GCM), readable only by the operator.
3. **Human-gated disclosure.** A documented workflow (`src/lib/disclosure/workflow.ts`): private notice → waiting period → summary-only publication after a fix or deadline. Every step needs a human. Summaries are scanned to reject anything that looks like exploit code.
4. **No draining/front-running features.** Demos use contracts **we deploy ourselves on a local fork**.
5. **Never "safe".** A clean report says *"no issues found by these checks"* and lists what was covered.
6. **Keys stay in `.env`** (gitignored). A daily AI budget cap and per-scan token limits are enforced before any API call.
7. **The software writes and tests code. It does not move funds, pay bounties, send disclosures, or launch the coin.** Those are manual operator steps.

---

## Quick start

```bash
npm install
cp .env.example .env     # fill in keys yourself; .env is gitignored
```

Confirm your toolchain and chain access:

```bash
npm run chain:check
```

Run the demo — deploys WHITEHAT's own intentionally vulnerable contracts to a **private local chain** and produces real reports (no mock data):

```bash
npm run demo
```

Run the site:

```bash
npm run dev          # http://localhost:3000
```

Run the test suites:

```bash
npm test             # TypeScript unit tests (evidence, guard, signatures, disclosure, quantum, budget)
npm run test:contracts   # Foundry fuzz + invariant proofs on the demo contracts
```

### Foundry / Slither

`forge` and `anvil` come from Foundry; `slither` from `pip install slither-analyzer`. Point `FORGE_PATH`, `ANVIL_PATH`, `SLITHER_PATH`, `SOLC_PATH` in `.env` at your binaries if they aren't on `PATH`. Slither is optional — without it, source-pattern checks and fork probes still run.

---

## Architecture

```
Next.js (App Router, TS)
 ├─ /api/scan, /api/wallet         → queue a job
 ├─ /api/report/[id]               → poll status / fetch report
 ├─ /api/privacy/challenge|verify  → signature-gated privacy report
 └─ pages: Scan, Report, Disclosures, Research, Bounties, Docs, Privacy

src/lib
 ├─ safety/txguard.ts      live-network guard (the core safety primitive)
 ├─ analysis/              bytecode, source, Slither, fork probes, reentrancy probe,
 │                         AI review (REVIEW-only), evidence rules, grade
 ├─ quantum/               wallet + contract quantum readiness
 ├─ privacy/               signature auth + privacy report (owner-gated, encrypted)
 ├─ disclosure/            encrypted proofs + human-gated workflow
 ├─ watcher/               new-deployment watcher (value-at-risk priority)
 ├─ queue.ts, reports.ts   SQLite-backed job queue and report store
 ├─ budget.ts              daily AI cap, per-scan limits, rate limits
 └─ ledger.ts              public spending ledger (real entries only)

contracts/                Foundry project: demo vulnerable contracts + proofs
scripts/                  chain-check, demo, worker, watcher, operator (CLI)
```

Storage is SQLite (`better-sqlite3`) by default; swap for Postgres by reimplementing `src/lib/db.ts`.

### Operator console

Disclosures, the ledger, and proof decryption are driven from a CLI gated by `OPERATOR_TOKEN`:

```bash
OPERATOR_TOKEN_ARG=$OPERATOR_TOKEN npm run operator -- disclosures
OPERATOR_TOKEN_ARG=$OPERATOR_TOKEN npm run operator -- create-disclosure <reportId> elysium 0x.. high "Reentrancy in withdraw"
OPERATOR_TOKEN_ARG=$OPERATOR_TOKEN npm run operator -- approve-notice <id>
OPERATOR_TOKEN_ARG=$OPERATOR_TOKEN npm run operator -- mark-notified <id>
OPERATOR_TOKEN_ARG=$OPERATOR_TOKEN npm run operator -- mark-fixed <id>
OPERATOR_TOKEN_ARG=$OPERATOR_TOKEN npm run operator -- publish <id> "Plain-language summary only."
```

---

## Coin & economics

Creator fees from `$WHITEHAT` fund compute and bounties, with a public ledger of real spending (`/bounties`). The recommended fee flow and launchpad options — with the figures that still need confirming before launch — are in [`docs/economics.md`](docs/economics.md). **You launch the coin; the software doesn't.**

## Docs

- [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) — what WHITEHAT defends, the trust boundaries, and the safety guarantees.
- [`docs/costs.md`](docs/costs.md) — AI pricing and budget behaviour.
- [`docs/economics.md`](docs/economics.md) — coin fee flow and launchpad research.
- [`docs/research-sources.md`](docs/research-sources.md) — citations for the Research page.
- In-app methodology: `/docs`.

## What needs your keys (see the end of `.env.example`)

- `ANTHROPIC_API_KEY` — enables AI review (otherwise skipped; findings stay LIKELY/CONFIRMED only).
- `ELYSIUM_RPC_URL` — mainnet RPC (chain ID is read live, never hardcoded). `ELYSIUM_TESTNET_RPC_URL` is prefilled.
- `EXPLORER_API_URL` / `EXPLORER_API_KEY` — verified source and address history.
- `PROOF_ENCRYPTION_KEY`, `SESSION_SECRET`, `OPERATOR_TOKEN` — generate with `openssl rand -hex 32`.

The app runs without any of these against local demo contracts.
