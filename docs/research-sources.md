# Research sources

Citations for the incidents shown on `/research` (`src/lib/content/research.ts`). Every item is a
real, publicly reported event. Figures are "as reported" and rounded; where sources disagree, the
range is noted in the content. Compiled 2026-11-09. If a link ever fails to load, treat that item
as unverified and remove it rather than presenting it as fact.

| Incident | Date | Loss (reported) | Root cause | Sources |
|---|---|---|---|---|
| Bybit cold-wallet theft | 2025-02-21 | ~$1.46B | UI / supply-chain compromise | [The Block](https://www.theblock.co/post/343530/lazarus-appears-to-compromise-safe-developer-machine-in-lead-up-to-1-5-billion-bybit-hack-report), [BleepingComputer](https://www.bleepingcomputer.com/news/security/lazarus-hacked-bybit-via-a-breached-safe-wallet-developer-machine/) |
| Cetus (Sui) | 2025-05-22 | ~$223M | Rounding / precision | [BlockSec](https://blocksec.com/blog/blog-4cetus-incident-one-unchecked-shift-drains-223m-in-the-largest-defi-hack-of-2025), [crypto.news](https://crypto.news/cetus-hack-post-mortem-reveals-overflow-bug-behind-223m-exploit/) |
| Balancer V2 | 2025-11-03 | ~$128M | Rounding / precision | [The Block](https://www.theblock.co/post/377863/balancer-identifies-rounding-error-as-root-cause-of-multi-chain-defi-exploit), [Check Point](https://research.checkpoint.com/2025/how-an-attacker-drained-128m-from-balancer-through-rounding-error-exploitation/) |
| KiloEx | 2025-04-14 | ~$7.5M (returned) | Oracle manipulation via weak access control | [Rekt](https://rekt.news/kiloex-rekt), [Halborn](https://www.halborn.com/blog/post/explained-the-kiloex-hack-april-2025) |
| Hyperdrive (HyperEVM) | 2025-09-27 | ~$782K | Unsafe arbitrary call in router | [The Block](https://www.theblock.co/post/372662/hyperliquid-based-hyperdrive-loses-782000-after-smart-contract-exploit), [Cryptonews](https://cryptonews.com.au/news/hyperdrive-exploit-drains-us782k-in-third-major-hyperliquid-security-breach-131037/) |
| Hyperliquid JELLY | 2025-03-26 | HLP unrealised ~$12M; vault reportedly ended in profit | **Market manipulation, not a contract bug** | [The Block](https://www.theblock.co/post/348314/hyperliquid-delists-jellyjelly-memecoin-amid-whale-manipulation-fiasco), [Arkham](https://info.arkm.com/research/jellyjelly-exploit-on-hyperliquid) |
| Radiant Capital | 2024-10-16 | ~$50M | Private-key compromise (signer malware) | [Rekt](https://rekt.news/radiant-capital-rekt2), [Radiant post-mortem](https://medium.com/@RadiantCapital/radiant-post-mortem-fecd6cd38081) |
| Penpie | 2024-09-03 | ~$27M | Reentrancy | [Rekt](https://rekt.news/penpie-rekt), [Halborn](https://halborn.com/blog/post/explained-the-penpie-hack-september-2024) |

## Aggregate statistics

- **>$3.4B stolen in 2025** — Chainalysis, via [The Block](https://www.theblock.co/post/382477/crypto-hack-2025-chainalysis).
- **$3.35B across 630 incidents in 2025** — [CertiK Hack3d 2025](https://certik.com/blog/hack3d-the-web3-security-report-2025).

## Methodology note

Research was gathered from WebSearch result summaries tied to these URLs; full pages were not all
opened from the build environment. Before publishing or citing externally, a human should open the
key URLs (especially the 2026 items and anything about Elysium) and confirm each figure. Nothing
here was invented; items that could not be confirmed were excluded.

## Items seen but intentionally excluded (unverified)

HyperVault (~$3.6M, described as a rug pull) and Hypurr NFT wallet drains (~$400K, Sept 2025) —
single-source only, not included. Several 2026 incidents (Kelp DAO rsETH bridge, Drift, Purrlend)
were found but are kept out of the shipped content pending a human opening the primary sources.
