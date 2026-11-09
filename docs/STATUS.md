# WHITEHAT — honest status

Last updated 2026-11-09, second pass. This is a straight account of what truly works end to end,
what is tested only locally, what needs your API keys, and what still blocks a safe launch. No
capability is claimed that isn't measured or tested.

## Audit of the first pass (what was real vs. not)

| Area | First-pass reality | Now |
|---|---|---|
| Contract scanner (own contracts) | Worked: bytecode, source, Slither, fork probes, grading, evidence levels | Same, plus a measured benchmark (below) |
| Oracle-manipulation detection | **Missing** — no detector existed | Added (Likely, source + bytecode); measured |
| v4 hook "blocks sells" | **Missed** — probe silently failed (selector with a leading zero byte wasn't extracted from bytecode) | Fixed; now Confirmed on fork |
| Reentrancy false positive | **Bug** — a reentrancy-safe vault was graded F (gas-refund inflated the "profit" measurement) | Fixed; clean vault now grades A |
| Quantum wallet exposure | Inferred weakly from explorer tx list | Now a definitive RPC determination (account nonce) + real public-key recovery from a signed tx |
| Privacy unsigned-request block | Logic existed, not tested at the API level | Added an API-level test proving an unsigned request gets 401 and builds no report |
| Live-network / testnet block | Enforced, tested for mainnet | Added explicit testnet + forge-broadcast tests |
| AI review | Code real, never executed (no key) | Still needs your key; budget gating is tested |
| Explorer (elyscan.live) | Tries two API shapes, never verified against the real endpoint | Still unverified — needs the real endpoint |

## Proven working, with real example output

Run `npm run benchmark` (regenerates `docs/benchmark.md`). Measured on WHITEHAT's own contracts on
a private local chain, latest run:

- **Detected 12/12** expected vulnerability classes; **10 reproduced Confirmed on fork**; **0 missed**; **0 false positives** on clean controls.
- Confirmed-on-fork classes: reentrancy, hidden mint, owner freeze (blacklist), stop-selling, 100% sell tax, ownership takeover, single-key upgrade, v4-hook any-caller, v4-hook owner-blocks-sells.
- Likely (static, not fork-confirmed): oracle manipulation (spot-reserve pricing), signature replay.
- Clean controls (PlainToken, SafeVault, CleanOwnableToken, CleanOracleLender) produced **no** confirmed or high/critical findings.
- Quantum demonstration: recovered the deployer's public key from a real signed transaction and confirmed it matches the address; nonce-based exposure determination correct.

`npm run demo` deploys the vulnerable suite and produces real reports you can open in the UI
(RugToken → F, OpenInitProxy → F, ReentrantVault → F, FeeHook → D, PlainToken → A).

Also proven:
- **Evidence levels** are enforced in code and visually distinct in the UI (Confirmed on fork / Likely / Review).
- **Live-network guard**: every state-changing RPC to mainnet *and testnet* is blocked; forge is limited to test/build and may only fork a private local Anvil. Tested.
- **Responsible disclosure**: human-gated state machine; summary-only publication after fix/deadline; exploit-code markers rejected; proofs encrypted. Tested.
- **Privacy gating**: a report requires a valid owner signature; unsigned/wrong-wallet/replayed requests are rejected (401) and build nothing. Tested at the API level.
- **Queue durability**: jobs persist in SQLite, are claimed with an expiring lease (crashed-worker jobs are reclaimed), ordered by value at risk, and give up after 3 attempts. Tested.
- 49 TypeScript tests + 15 Foundry proofs pass.

## Tested locally only (not against live Elysium)

- The scanner has only been run against our own contracts on a local chain. The **numbers above describe this suite, not a general accuracy rate** on arbitrary mainnet contracts.
- The watcher reads blocks and queues by value at risk; exercised locally, not yet against a live Elysium RPC.
- Quantum/privacy against a live chain need a working RPC and explorer; locally verified with real signatures and real tx key-recovery.
- Chain IDs: mainnet 99901 / testnet 99801 are set as expected values, but `getClient` still verifies them live with `eth_chainId` before running. Not yet run against the live RPCs (no RPC in this environment).

## Needs your API keys / endpoints (nothing runs these without you)

- `ANTHROPIC_API_KEY` — enables AI review (Review-level leads). Without it, scans still produce Likely/Confirmed findings. Daily budget + per-scan caps are enforced and tested.
- `ELYSIUM_RPC_URL` (mainnet) — to scan real contracts/wallets. `ELYSIUM_TESTNET_RPC_URL` is prefilled.
- `EXPLORER_API_URL` / `EXPLORER_API_KEY` — verified source and address history. The elyscan.live API shape is **unverified**; expect to adjust `src/lib/explorer.ts` once you point it at the real endpoint.
- `PROOF_ENCRYPTION_KEY`, `SESSION_SECRET`, `OPERATOR_TOKEN` — `openssl rand -hex 32`.

## What still blocks a safe launch

1. **Explorer integration is unverified.** Verified-source and history fetching need to be tested against the real elyscan.live (or chosen) API. Until then, real-contract scans fall back to bytecode-only and quantum/privacy history is limited.
2. **No live-RPC run yet.** Confirm `eth_chainId` returns 99901/99801 and that a real mainnet contract produces a report end to end before relying on it.
3. **AI review unexercised.** Once the key is set, run a few real scans to confirm cost and output quality; it only ever adds Review-level leads.
4. **Oracle manipulation is Likely-only.** We detect spot-reserve pricing but do not fork-confirm an oracle exploit (that PoC is contract-specific). Don't present oracle findings as confirmed.
5. **Detection is measured on our own suite.** Real contracts vary; treat grades as a triage signal, not a guarantee. The UI already never says "safe".
6. **Operator steps are yours.** Sending disclosures, paying bounties, moving funds, and launching the coin are deliberately manual. The launchpad creator-fee percentage still needs confirming against the launchpad's own docs (see `docs/economics.md`).
7. **security.txt placeholder.** Replace the contact in `public/.well-known/security.txt` before launch.

## How to reproduce

```bash
npm install
npm run chain:check      # verify tools + read chain IDs live
npm run benchmark        # measured detection matrix -> docs/benchmark.md
npm run demo             # deploy vulnerable suite, produce real reports
npm test                 # 49 unit tests
npm run test:contracts   # 15 Foundry proofs
npm run dev              # the site
```
