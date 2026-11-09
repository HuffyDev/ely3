/**
 * Coin & economics content. All claims here are either (a) explicitly marked as unverified /
 * to-be-confirmed-by-the-operator, or (b) carry a source. No launch has happened — the operator
 * launches the coin, not this app. Fee percentages below are drawn from third-party launchpad
 * sites and MUST be confirmed against the launchpad's own docs before the coin launches.
 *
 * Compiled 2026-11-09. See docs/economics.md.
 */

export type LaunchpadOption = {
  name: string;
  url: string;
  creatorShare: string;
  payout: string;
  status: string;
  note: string;
};

export const LAUNCHPADS: LaunchpadOption[] = [
  {
    name: "Navo",
    url: "https://www.navo.family/",
    creatorShare: "50% of trading fees (planned mainnet); its site also cites 70% on testnet",
    payout: "HYPE",
    status: "Testnet confirmed; mainnet unverified",
    note: "Highest headline creator share of the pads reviewed, but the 50% vs 70% figures conflict on its own site. Confirm before relying on either.",
  },
  {
    name: "Project Elysium pad (Ultima Thule)",
    url: "https://www.projectelysium.xyz/",
    creatorShare: "0.7% of each swap (of up to 1%), i.e. ~70% of the pad fee",
    payout: "Not confirmed (likely HYPE)",
    status: "Unverified",
    note: "Concrete per-swap split published on its site; payout asset and live status not confirmed.",
  },
  {
    name: "Ascend",
    url: "https://elysium-hub.xyz/en/categories/launchpad/",
    creatorShare: "Reported 50% for recognised active creators (25% for devs) of a 1% trade fee",
    payout: "HYPE (unverified)",
    status: "Unverified",
    note: "Described in secondary coverage as a flagship pad; verify terms directly.",
  },
  {
    name: "ElysPump",
    url: "https://elysp.com/",
    creatorShare: "50% of a 1% swap fee",
    payout: "HYPE (unverified)",
    status: "Unverified",
    note: "Simple 50/50 split per its listing.",
  },
];

export const FEE_FLOW_RECOMMENDATION = {
  headline: "Recommended fee flow (to confirm before launch)",
  body: [
    "Launch $WHITEHAT on the Elysium launchpad that (a) actually pays creator fees on mainnet and (b) pays the largest verifiable share — on current public information that points to Navo (claims 50% mainnet / 70% testnet) or a pad with a published split like Ascend/ElysPump. The operator must confirm the live rate from the launchpad's own documentation before launching.",
    "Route 100% of received creator fees to a single on-chain treasury address that WHITEHAT controls.",
    "Split treasury spending transparently: compute (fork infrastructure + Claude API usage) first, then bug bounties. Publish every real inflow and outflow on the public ledger with a tx hash.",
    "Never show projected or sample numbers as if they were real. The ledger starts empty and only fills with actual transactions the operator records.",
  ],
  caveats: [
    "No official Kinetiq first-party launchpad with a confirmed creator-fee rate was found as of 2026-11-09.",
    "Kinetiq's own sequencer-fee split (reported as roughly 25% builders / 25% treasury / 50% KNTQ buyback-burn) is chain-level revenue, not a token-launch creator fee — don't conflate the two.",
    "The $WHITEHAT ticker is not clearly taken on Elysium, but similar names exist on other chains (a 'White Hat' token on Base, a pump.fun 'White-hat' on Solana). Confirm availability on the chosen Elysium launchpad at launch time; on-chain registries could not be queried from the build environment.",
  ],
};

export const ECONOMICS_NOTE =
  "These figures come from third-party launchpad sites and secondary reporting, gathered 2026-11-09. They are starting points for the operator, not confirmed terms. Confirm every rate against the launchpad's own documentation before launching anything.";
