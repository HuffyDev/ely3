import { makeFinding } from "./evidence";
import type { Finding, CoverageItem } from "./types";
import type { VerifiedSource } from "../explorer";

/**
 * Lightweight source-pattern checks. These give LIKELY evidence (static) and act as a
 * fallback when Slither is not available. Every pattern is conservative; the fork probes
 * are what upgrade an issue to CONFIRMED.
 */

type Pattern = {
  key: string;
  test: RegExp;
  title: string;
  plain: string;
  severity: Finding["severity"];
  category: Finding["category"];
  exposure: Finding["exposure"];
  technical: string;
  recommendation: string;
};

const PATTERNS: Pattern[] = [
  {
    key: "static:tx-origin",
    test: /require\s*\(\s*tx\.origin\s*==|tx\.origin\s*==\s*owner/,
    title: "Authorisation uses tx.origin",
    plain: "The contract checks tx.origin for permission, which phishing contracts can abuse.",
    severity: "medium",
    category: "access-control",
    exposure: "exploitable",
    technical: "Found a tx.origin comparison used for authorisation. Use msg.sender instead.",
    recommendation: "Replace tx.origin checks with msg.sender.",
  },
  {
    key: "static:delegatecall-var",
    test: /\.delegatecall\s*\(/,
    title: "Uses delegatecall",
    plain: "The contract runs other code in its own context with delegatecall. If the target can be changed, the whole contract can be taken over.",
    severity: "low",
    category: "upgradeability",
    exposure: "informational",
    technical: "delegatecall is present. Confirm the target address cannot be influenced by callers.",
    recommendation: "Ensure delegatecall targets are fixed or tightly controlled.",
  },
  {
    key: "static:selfdestruct",
    test: /\bselfdestruct\s*\(|\bsuicide\s*\(/,
    title: "Contract can self-destruct",
    plain: "The contract contains code that can destroy it, which would break anything depending on it.",
    severity: "medium",
    category: "access-control",
    exposure: "informational",
    technical: "selfdestruct present. Confirm it is unreachable or strictly owner-gated.",
    recommendation: "Remove selfdestruct or guard it behind strong access control.",
  },
  {
    key: "static:assembly-sstore-impl",
    test: /sstore\s*\(\s*(_?IMPL(EMENTATION)?_?SLOT|0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc)/i,
    title: "Writes the proxy implementation slot directly",
    plain: "The contract can change the code it runs by writing the implementation slot. Check who can trigger that.",
    severity: "low",
    category: "upgradeability",
    exposure: "informational",
    technical: "Direct write to the EIP-1967 implementation slot found in assembly.",
    recommendation: "Gate upgrades behind a multisig and timelock.",
  },
  {
    key: "static:blacklist",
    test: /mapping\s*\(\s*address\s*=>\s*bool\s*\)\s*(public\s+)?(is)?(blacklist|blocked|bots?|frozen|banned)/i,
    title: "Has a blacklist mapping",
    plain: "The contract keeps a list of blocked addresses. The owner may be able to freeze holders.",
    severity: "low",
    category: "blacklist",
    exposure: "informational",
    technical: "A blacklist-style mapping is declared. The fork probe checks whether it actually blocks transfers.",
    recommendation: "Prefer no blacklist, or constrain it with a timelock and published criteria.",
  },
  {
    key: "static:ecrecover",
    test: /\becrecover\s*\(/,
    title: "Relies on ECDSA signatures (ecrecover)",
    plain: "Admin or user actions are approved with signatures. This is normal today, and is covered in the quantum-readiness section.",
    severity: "info",
    category: "signatures",
    exposure: "informational",
    technical: "ecrecover is used. If there is no nonce, signatures may be replayable.",
    recommendation: "Include a nonce and domain separator (EIP-712) in signed messages.",
  },
];

export function runStaticSource(source: VerifiedSource): { findings: Finding[]; coverage: CoverageItem } {
  const text = source.files.map((f) => f.content).join("\n");
  const findings: Finding[] = [];
  for (const p of PATTERNS) {
    if (p.test.test(text)) {
      findings.push(
        makeFinding({
          key: p.key,
          title: p.title,
          plain: p.plain,
          severity: p.severity,
          category: p.category,
          exposure: p.exposure,
          sources: ["source-pattern"],
          technical: p.technical,
          recommendation: p.recommendation,
          evidence: "LIKELY",
        }),
      );
    }
  }
  // Genuinely unchecked low-level call: a `.call{...}("")` statement whose boolean return is not
  // assigned (so success is ignored). Assigned calls like `(bool ok, ) = x.call{...}("")` are fine.
  for (const m of text.matchAll(/([^\n;{}]*)\.call\{[^}]*\}\s*\(\s*(?:""|"")?\s*\)\s*;/g)) {
    const lhs = m[1];
    const assigned = /=\s*$/.test(lhs.trimEnd().slice(-40)) || /\)\s*=\s*[\w.\[\]]*$/.test(lhs) || /=\s*[\w.\[\]]*$/.test(lhs);
    if (!assigned) {
      findings.push(
        makeFinding({
          key: "static:unchecked-call",
          title: "Low-level call return value is ignored",
          plain: "The contract makes a raw call and does not check whether it succeeded, so a silent failure could go unnoticed.",
          severity: "low",
          category: "unsafe-external-call",
          exposure: "informational",
          sources: ["source-pattern"],
          technical: "A low-level .call(...) statement was found whose boolean success value is not captured. Capture and check it.",
          recommendation: "Assign and require the returned success boolean, or use a safe wrapper.",
          evidence: "LIKELY",
        }),
      );
      break;
    }
  }

  // Spot-price oracle used for lending/pricing: a single trade can move it.
  const usesSpot = /\.getReserves\s*\(|\.slot0\s*\(|getAmountsOut\s*\(/.test(text);
  const usesFeed = /latestAnswer\s*\(|latestRoundData\s*\(/.test(text);
  const pricesAndLends = /function\s+(price|getPrice|currentPrice)\b/i.test(text) || /function\s+(borrow|openPosition|leverage)\b/i.test(text);
  if (usesSpot && pricesAndLends) {
    findings.push(
      makeFinding({
        key: "static:spot-oracle",
        title: "Prices from a spot AMM pool a trade can move",
        plain:
          "Collateral or asset value is read from a pool's live reserves. A large swap (often a flash loan) can move that price within one transaction, letting someone borrow or mint far more than they should.",
        severity: "high",
        category: "oracle-manipulation",
        exposure: "exploitable",
        sources: ["source-pattern"],
        technical:
          "The contract reads a spot price source (getReserves / slot0 / getAmountsOut) inside a pricing or borrowing path. Spot reserves are manipulable in a single transaction. A time-weighted (TWAP) or independent feed oracle resists this." +
          (usesFeed ? " Note: a feed oracle is also referenced — check which one actually gates borrowing." : ""),
        recommendation: "Price from a TWAP or an independent feed (e.g. Chainlink), and sanity-check against a second source. Do not use raw spot reserves for solvency decisions.",
        evidence: "LIKELY",
      }),
    );
  }

  // Signature replay: ecrecover without a nonce reference nearby
  if (/\becrecover\s*\(/.test(text) && !/nonce/i.test(text)) {
    findings.push(
      makeFinding({
        key: "static:sig-replay",
        title: "Signatures may be replayable",
        plain: "Signed actions do not appear to track a nonce, so the same signature might be used more than once.",
        severity: "medium",
        category: "signatures",
        exposure: "exploitable",
        sources: ["source-pattern"],
        technical: "ecrecover is used but no nonce was found in the source. A missing nonce allows signature replay.",
        recommendation: "Add a per-signer nonce and mark used digests.",
        evidence: "LIKELY",
      }),
    );
  }
  return { findings, coverage: { check: "Source pattern checks", status: "ran", note: `${PATTERNS.length + 1} patterns.` } };
}
