# Coin & economics

> Compiled 2026-11-09 from public, third-party sources. **Every figure here must be confirmed
> against the launchpad's own documentation before launch.** You launch the coin; the software
> does not. The in-app `/bounties` page shows the same recommendation and a real, initially-empty
> spending ledger.

## Recommended fee flow (confirm before launch)

1. Launch `$WHITEHAT` on the Elysium launchpad that **actually pays creator fees on mainnet** and
   pays the **largest verifiable share**. On current public information that points to **Navo**
   (claims 50% mainnet / 70% testnet) or a pad with a published split such as **Ascend** or
   **ElysPump**. Confirm the live rate from the launchpad's own docs first.
2. Route 100% of received creator fees to a single on-chain treasury address WHITEHAT controls.
3. Split treasury spending transparently: **compute** (fork infra + Claude API) first, then
   **bug bounties**. Publish every real inflow and outflow on the public ledger with a tx hash.
4. Never show projected or sample numbers as real. The ledger starts empty and fills only with
   actual recorded transactions.

## Launchpad options (unverified — confirm each)

| Launchpad | Creator share | Payout | Status | Source |
|---|---|---|---|---|
| [Navo](https://www.navo.family/) | 50% mainnet (site also says 70% testnet) | HYPE | Testnet confirmed; mainnet unverified | navo.family |
| [Project Elysium pad](https://www.projectelysium.xyz/) | 0.7% of each swap (~70% of pad fee) | not confirmed | unverified | projectelysium.xyz |
| Ascend | ~50% for recognised creators (25% devs) of a 1% fee | HYPE (unverified) | unverified | [elysium-hub](https://elysium-hub.xyz/en/categories/launchpad/) |
| [ElysPump](https://elysp.com/) | 50% of a 1% swap fee | HYPE (unverified) | unverified | elysp.com |

### Caveats

- No official **Kinetiq first-party launchpad** with a confirmed creator-fee rate was found as of
  2026-11-09.
- Kinetiq's **sequencer-fee** split (reported ~25% builders / 25% treasury / 50% KNTQ
  buyback-burn — [crypto.news](https://crypto.news/kinetiq-unveils-elysium-l2-with-hype-gas/)) is
  chain-level revenue, **not** a token-launch creator fee. Don't conflate them.
- **Ticker:** `$WHITEHAT` is not clearly taken on Elysium, but similar names exist elsewhere (a
  "White Hat" token on Base; a pump.fun "White-hat" on Solana). On-chain registries could not be
  queried from the build environment — confirm availability on the chosen Elysium launchpad at
  launch time.

## Elysium chain facts (verify at runtime)

- EVM-compatible; settles to HyperEVM; HYPE for gas; ~100ms blocks.
- **Testnet chain ID 99801** (confirmed by multiple providers); testnet RPC
  `https://testnet-rpc.elysium.kinetiq.xyz`.
- **Mainnet chain ID: not officially confirmed** as of 2026-11-09 (99901 is cited by third parties
  but unverified). WHITEHAT reads each network's chain ID live with `eth_chainId` and never
  hardcodes a mainnet id.
- Sources: [Chainstack](https://chainstack.com/what-is-elysium/),
  [Dwellir](https://www.dwellir.com/blog/what-is-elysium),
  [The Defiant](https://thedefiant.io/news/defi/kinetiq-opens-elysium-testnet-for-hyperliquid-focused-defi-apps).
