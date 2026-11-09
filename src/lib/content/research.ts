/**
 * Research content for the public Research page.
 *
 * Every incident below is a REAL, publicly reported event with at least one citation. None of
 * these numbers, dates, or names are invented. Figures are "as reported" and rounded; where
 * sources disagree, the range is noted. If you cannot open a citation, treat the item as
 * unverified and remove it rather than presenting it as fact.
 *
 * Compiled 2026-11-09 from public reporting (Rekt.news, project post-mortems, Halborn,
 * BlockSec, Check Point, The Block, Chainalysis, CertiK). See docs/research-sources.md.
 */

export type Incident = {
  name: string;
  date: string;
  lossUsd: string;
  category: string;
  chain?: string;
  summary: string;
  lesson: string;
  sources: { label: string; url: string }[];
};

export const INCIDENTS: Incident[] = [
  {
    name: "Bybit cold-wallet theft",
    date: "2025-02-21",
    lossUsd: "~$1.46B",
    category: "UI / supply-chain compromise",
    summary:
      "Attackers compromised a Safe{Wallet} developer machine and injected malicious JavaScript into the signing front end. Bybit's signers approved a transaction that looked legitimate but drained the ETH cold wallet. The contract itself was not flawed; the interface that produced the signature was.",
    lesson: "A contract can be sound while the thing that signs for it is not. Verify what you sign, independent of the UI.",
    sources: [
      { label: "The Block", url: "https://www.theblock.co/post/343530/lazarus-appears-to-compromise-safe-developer-machine-in-lead-up-to-1-5-billion-bybit-hack-report" },
      { label: "BleepingComputer", url: "https://www.bleepingcomputer.com/news/security/lazarus-hacked-bybit-via-a-breached-safe-wallet-developer-machine/" },
    ],
  },
  {
    name: "Cetus (Sui)",
    date: "2025-05-22",
    lossUsd: "~$223M",
    category: "Rounding / precision bug",
    chain: "Sui",
    summary:
      "A faulty overflow check in fixed-point math let the attacker add enormous liquidity for a tiny token input, then drain the pools. Validators later froze a large part of the funds.",
    lesson: "Precision and overflow checks in AMM math are high-value targets. Invariant and fuzz testing around liquidity math matters.",
    sources: [
      { label: "BlockSec", url: "https://blocksec.com/blog/blog-4cetus-incident-one-unchecked-shift-drains-223m-in-the-largest-defi-hack-of-2025" },
      { label: "crypto.news", url: "https://crypto.news/cetus-hack-post-mortem-reveals-overflow-bug-behind-223m-exploit/" },
    ],
  },
  {
    name: "Balancer V2 composable stable pools",
    date: "2025-11-03",
    lossUsd: "~$128M",
    category: "Rounding / precision bug",
    summary:
      "A rounding error in the upscale step of exact-out batch swaps was exploited repeatedly across several chains to drain V2 composable stable pools. V3 pools were unaffected.",
    lesson: "Rounding direction is a security property. A long-lived, audited protocol can still carry a precision bug.",
    sources: [
      { label: "The Block", url: "https://www.theblock.co/post/377863/balancer-identifies-rounding-error-as-root-cause-of-multi-chain-defi-exploit" },
      { label: "Check Point Research", url: "https://research.checkpoint.com/2025/how-an-attacker-drained-128m-from-balancer-through-rounding-error-exploitation/" },
    ],
  },
  {
    name: "KiloEx",
    date: "2025-04-14",
    lossUsd: "~$7.5M (later returned)",
    category: "Oracle manipulation (via weak access control)",
    chain: "Base / opBNB / BSC",
    summary:
      "The price-setting path lacked proper access control, letting the attacker open positions at an artificial ~$100 and close at ~$10,000. Funds were later returned under a bounty arrangement.",
    lesson: "An oracle is only as safe as the access control around who can push a price.",
    sources: [
      { label: "Rekt.news", url: "https://rekt.news/kiloex-rekt" },
      { label: "Halborn", url: "https://www.halborn.com/blog/post/explained-the-kiloex-hack-april-2025" },
    ],
  },
  {
    name: "Hyperdrive (HyperEVM)",
    date: "2025-09-27",
    lossUsd: "~$782K",
    category: "Unsafe external call (arbitrary call in router)",
    chain: "HyperEVM",
    summary:
      "Users had approved the router as an operator. The attacker abused an arbitrary call in the router to drain the Primary USDT0 and Treasury markets. One of several security incidents in the Hyperliquid ecosystem in 2025.",
    lesson: "Arbitrary-call helpers combined with broad approvals are a recurring drain pattern. WHITEHAT flags arbitrary-call selectors specifically.",
    sources: [
      { label: "The Block", url: "https://www.theblock.co/post/372662/hyperliquid-based-hyperdrive-loses-782000-after-smart-contract-exploit" },
      { label: "Cryptonews", url: "https://cryptonews.com.au/news/hyperdrive-exploit-drains-us782k-in-third-major-hyperliquid-security-breach-131037/" },
    ],
  },
  {
    name: "Hyperliquid JELLY market",
    date: "2025-03-26",
    lossUsd: "HLP unrealised loss reported ~$12M; the vault reportedly ended in profit after validators settled the market",
    category: "Market manipulation (not a contract bug)",
    chain: "Hyperliquid",
    summary:
      "A trader self-liquidated a large short on the thinly traded JELLY perpetual onto the HLP vault, then pushed the spot price. Validators voted to delist and settle the market. This was market manipulation and a governance response, not a smart-contract vulnerability — we include it because it is often miscategorised.",
    lesson: "Not every loss is a contract bug. Classifying the root cause honestly is part of good security reporting.",
    sources: [
      { label: "The Block", url: "https://www.theblock.co/post/348314/hyperliquid-delists-jellyjelly-memecoin-amid-whale-manipulation-fiasco" },
      { label: "Arkham", url: "https://info.arkm.com/research/jellyjelly-exploit-on-hyperliquid" },
    ],
  },
  {
    name: "Radiant Capital",
    date: "2024-10-16",
    lossUsd: "~$50M",
    category: "Private-key compromise (signer malware)",
    summary:
      "Malware made the signing UI show legitimate transactions while hardware wallets signed malicious ones, giving the attacker control of the lending pools through 3 of 11 multisig keys.",
    lesson: "Multisig is not a cure-all if several signers share the same compromised toolchain.",
    sources: [
      { label: "Rekt.news", url: "https://rekt.news/radiant-capital-rekt2" },
      { label: "Radiant post-mortem", url: "https://medium.com/@RadiantCapital/radiant-post-mortem-fecd6cd38081" },
    ],
  },
  {
    name: "Penpie",
    date: "2024-09-03",
    lossUsd: "~$27M",
    category: "Reentrancy",
    summary:
      "The attacker registered a fake Pendle market and re-entered an unguarded reward-harvest function to inflate and claim rewards.",
    lesson: "Reentrancy is far from dead. Checks-effects-interactions and reentrancy guards still matter — and are reproducible on a fork, which is how WHITEHAT confirms them.",
    sources: [
      { label: "Rekt.news", url: "https://rekt.news/penpie-rekt" },
      { label: "Halborn", url: "https://halborn.com/blog/post/explained-the-penpie-hack-september-2024" },
    ],
  },
];

export const AGGREGATES: { stat: string; detail: string; source: { label: string; url: string } }[] = [
  {
    stat: "More than $3.4B stolen in crypto hacks in 2025",
    detail: "Chainalysis reporting (through early December 2025). The top three incidents accounted for roughly 69% of losses.",
    source: { label: "Chainalysis via The Block", url: "https://www.theblock.co/post/382477/crypto-hack-2025-chainalysis" },
  },
  {
    stat: "$3.35B lost across 630 incidents in 2025",
    detail: "CertiK Hack3d 2025 annual report, up about 37% from a restated 2024.",
    source: { label: "CertiK Hack3d", url: "https://certik.com/blog/hack3d-the-web3-security-report-2025" },
  },
];

/** Shown on the Research page to be explicit about sourcing. */
export const RESEARCH_NOTE =
  "Every incident here is a real, publicly reported event with at least one linked source. Figures are as reported and rounded; where sources disagree we say so. We do not publish exploit details. If a link ever fails to load, treat that item as unverified.";
