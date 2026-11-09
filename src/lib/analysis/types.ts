export type EvidenceLevel = "CONFIRMED_ON_FORK" | "LIKELY" | "REVIEW";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Exposure = "privilege" | "exploitable" | "informational";
export type EvidenceSource = "fork" | "slither" | "bytecode" | "source-pattern" | "ai";

export type Category =
  | "access-control"
  | "upgradeability"
  | "hidden-mint"
  | "blacklist"
  | "sell-restriction"
  | "fees"
  | "reentrancy"
  | "oracle-manipulation"
  | "unsafe-external-call"
  | "uniswap-v4-hook"
  | "signatures"
  | "other";

export const CATEGORY_LABEL: Record<Category, string> = {
  "access-control": "Access control",
  upgradeability: "Upgradeability",
  "hidden-mint": "Minting",
  blacklist: "Blacklist / freezing",
  "sell-restriction": "Sell restrictions",
  fees: "Fees and taxes",
  reentrancy: "Reentrancy",
  "oracle-manipulation": "Oracle manipulation",
  "unsafe-external-call": "Unsafe external calls",
  "uniswap-v4-hook": "Uniswap v4 hook",
  signatures: "Signatures",
  other: "Other",
};

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  CONFIRMED_ON_FORK: "Confirmed on fork",
  LIKELY: "Likely",
  REVIEW: "Review",
};

export type ForkProof = {
  /** Chain ID of the private fork. Must differ from the live chain ID. */
  forkChainId: number;
  /** Live chain ID the fork was taken from (null for local demo chain without upstream). */
  liveChainId: number | null;
  forkBlock: number;
  /** Plain-language observations, e.g. "holder transfer reverted after owner call". Never exploit code. */
  observations: string[];
  /** Name of the reproducing test or probe. */
  test: string;
  passed: true;
  /** Encrypted proof id (operator only), when a generated test file exists. */
  proofId?: string;
};

export type Finding = {
  id: string;
  key: string;
  title: string;
  plain: string;
  severity: Severity;
  category: Category;
  exposure: Exposure;
  evidence: EvidenceLevel;
  sources: EvidenceSource[];
  technical: string;
  location?: string;
  recommendation: string;
  proof?: ForkProof;
  /** True when details are withheld from the public report pending disclosure. */
  withheld?: boolean;
};

export type CoverageItem = { check: string; status: "ran" | "skipped" | "partial"; note?: string };

export type ContractReport = {
  kind: "contract";
  version: 1;
  network: string;
  chainId: number;
  address: string;
  name?: string;
  generatedAt: string;
  isOwnDemoContract: boolean;
  summary: string;
  grade: Grade;
  facts: { label: string; value: string; mono?: boolean }[];
  findings: Finding[];
  coverage: CoverageItem[];
  quantum: QuantumContractSection;
  ai: { used: boolean; model?: string; note?: string; costUsd?: number };
  disclaimers: string[];
};

export type Grade = { letter: "A" | "B" | "C" | "D" | "F"; score: number; limitedCoverage: boolean; label: string };

export type QuantumContractSection = {
  grade: Grade;
  points: { title: string; detail: string; level: "exposed" | "note" | "ok" }[];
};
