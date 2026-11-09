# Costs

## AI (Claude API)

AI review is optional (needs `ANTHROPIC_API_KEY`). Every finding it produces is **REVIEW** level.

### Model pricing (USD per million tokens)

Rates used by `src/lib/budget.ts`, from Anthropic pricing as of 2026-10. Confirm current rates
before relying on them.

| Model | Input | Output |
|---|---|---|
| `claude-opus-5-5` (default) | $4 | $20 |
| `claude-sonnet-5-5` | $2 | $10 |
| `claude-haiku-5-5` | $0.10 | $0.50 |
| `claude-fable-5-1` | $10 | $50 |

Unknown model ids are priced at the most expensive tier as a safety default.

### Controls (enforced before any call)

- `AI_DAILY_BUDGET_USD` — hard daily cap. Once reached (or once a scan's worst-case cost would
  exceed it), scans skip AI review instead of spending. Default **$5**.
- `AI_MAX_INPUT_TOKENS_PER_SCAN` — source larger than this (estimated) is not sent. Default 60k.
- `AI_MAX_OUTPUT_TOKENS_PER_SCAN` — caps `max_tokens`. Default 8k.
- `AI_EFFORT` — `output_config.effort` (default `high`).

Spend is metered per call into the `ai_usage` table and surfaced on `/bounties` ("AI spent today").

### Rough per-scan cost

A typical verified-source contract is 5k–30k input tokens. At `claude-opus-5-5` that is roughly
**$0.02–$0.12** input plus up to **$0.16** output per scan with AI enabled — well within a $5/day
cap for dozens of scans. Bytecode-only scans send a compact summary and cost less. Contracts
without an API key configured cost **$0** (AI simply doesn't run).

## Compute

- Forks are local Anvil processes; cost is CPU/RAM on your host, not a paid service.
- The watcher reads blocks from your RPC provider; cost depends on that provider's plan.

The public ledger (`/bounties`) records real creator-fee income and real spend only. Nothing on it
is simulated.
