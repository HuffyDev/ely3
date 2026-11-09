# WHITEHAT threat model

This document states what WHITEHAT protects, what it deliberately does not do, the trust
boundaries, and how the hard safety rules are enforced in code rather than by convention.

## 1. What WHITEHAT is

A read-only analysis tool that produces security reports for Elysium contracts and wallets. It
runs static analysis, reproduces issues on **private local forks**, and uses the Claude API for
additional leads. It is **not** an auditor, custodian, signer, trading bot, or fund mover.

## 2. Assets to protect

| Asset | Risk if mishandled | Mitigation |
|---|---|---|
| Live user funds / contracts | A tool that tests exploits could damage real deployments | All proofs run on private forks; a guard blocks live state changes (§5) |
| Unfixed vulnerability details | Publishing them arms attackers | Withheld from public reports; stored encrypted; human-gated disclosure (§6) |
| API keys, wallet keys, secrets | Leakage drains budgets or funds | `.env` only (gitignored); redaction of logs/outputs; never printed |
| A wallet owner's privacy | A privacy tool could become a surveillance tool | Owner-gated by signature; never published/indexed; no address→identity (§7) |
| AI spend | Runaway cost | Hard daily cap + per-scan token limits, checked before each call |

## 3. Actors and trust

- **Anonymous web user.** Can scan any contract and any wallet's quantum readiness. Cannot obtain
  a privacy report for a wallet they don't control, cannot see withheld exploit detail, cannot
  touch the operator surface. Rate-limited per IP.
- **Wallet owner.** By signing a free challenge, proves control and unlocks the private privacy
  report for *their* wallet only.
- **Operator (you).** Holds `OPERATOR_TOKEN`, `PROOF_ENCRYPTION_KEY`. Approves and sends
  disclosures, decrypts proofs, records ledger entries, launches the coin, pays bounties. All
  outward or irreversible actions live here, behind a human.
- **The software itself.** Trusted to analyse and to *refuse* unsafe actions. Not trusted to send,
  publish, or pay anything on its own.

External data (RPC responses, verified source, explorer history, AI output) is **untrusted input**.
It is parsed defensively and never executed against a live network.

## 4. Trust boundaries

```
 Internet ─▶ Next.js API ─▶ job queue ─▶ worker
                                   │
             ┌─────────────────────┼─────────────────────┐
             ▼                     ▼                     ▼
      live RPC (READ ONLY)   private Anvil fork     Claude API
       via txguard           (state changes OK)     (REVIEW only,
                                                      budgeted)
                                   │
                         encrypted proofs (operator only)
                                   │
                    human-gated disclosure ─▶ public summary
```

The critical boundary is **live network vs. private fork**. It is enforced by a single choke point.

## 5. Live-network transaction guard (the core control)

`src/lib/safety/txguard.ts`. Properties:

- An **allow-list** of read-only RPC methods is the only thing permitted against a live network.
  Anything else (`eth_sendTransaction`, `eth_sendRawTransaction`, `anvil_*`, `evm_*`,
  `personal_sign`, …) is rejected.
- State-changing calls are allowed **only** against a loopback port that this process registered
  as a fork it started. Unregistered loopback ports are treated as live.
- A fork may never share the live chain's chain ID, so a signed payload could not be replayed on
  the live network. Registration refuses an equal chain ID.
- `forge` may only run `test`/`build`, may not carry broadcasting or key flags, and may only fork
  from a registered private fork URL.
- Child processes get a sanitised environment and `FOUNDRY_OFFLINE=true`, so a tool cannot pick up
  a live RPC or key by accident.

Tested in `tests/txguard.test.ts`.

## 6. Disclosure and proof handling

- Exploitable findings on contracts we don't own are replaced in public output by a withheld
  placeholder (`toPublicFindings`), keeping the evidence level but removing title, location,
  technical detail, and proof. Our own demo contracts are shown in full.
- Proofs are encrypted at rest with AES-256-GCM (`src/lib/crypto.ts`); without
  `PROOF_ENCRYPTION_KEY` they are not stored at all (never in the clear).
- The disclosure state machine requires a human action at every transition. Publication is
  blocked until a fix or the deadline, is summary-only, and rejects summaries containing
  exploit-code markers. Tested in `tests/disclosure.test.ts`.

## 7. Privacy report containment

- Generated only after `verifyChallenge` confirms an EIP-191 signature from the claimed owner over
  a single-use, time-limited nonce (`src/lib/privacy/auth.ts`). Tested in
  `tests/privacy-auth.test.ts`.
- Uses public on-chain data only; never attempts address→identity attribution.
- Stored (if at all) encrypted and keyed to the proven owner; never listed, searched, or indexed.
  A share link exists only if the owner creates one.

## 8. Evidence integrity

`makeFinding` is the only constructor for a finding and enforces the level ceiling: AI-only →
REVIEW; static → LIKELY; valid fork proof → CONFIRMED. Callers may downgrade, never upgrade. A
CONFIRMED claim without a valid private-fork proof throws. Tested in `tests/evidence.test.ts`.

## 9. Known limitations (honest scope)

- Heuristics (bytecode selector scan, source patterns, probe coverage) can miss issues and can
  mis-flag. That is why nothing is ever called "safe" and coverage is listed on every report.
- The watcher's value-at-risk is a cheap proxy (balance + creation value), used only for queue
  ordering.
- Reports depend on external services (RPC, explorer); when they're unavailable, coverage is
  reduced and the report says so rather than guessing.
- AI review quality varies; by design it only ever contributes REVIEW-level leads.

## 10. Out of scope by design

Draining, front-running, or exploiting live contracts; moving funds; sending disclosures or paying
bounties automatically; identifying wallet owners; publishing exploit code or unfixed details;
claiming a contract is safe or anything is quantum-proof.
