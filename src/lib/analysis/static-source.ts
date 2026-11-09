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
    key: "static:unchecked-call",
    test: /\.call\{[^}]*\}\s*\(\s*""\s*\)\s*;/,
    title: "Low-level call return value may be ignored",
    plain: "The contract makes a raw call and may not check whether it succeeded.",
    severity: "low",
    category: "unsafe-external-call",
    exposure: "informational",
    technical: "A low-level .call was found. Verify the boolean return is checked and reentrancy is handled.",
    recommendation: "Check the return value and apply checks-effects-interactions or a reentrancy guard.",
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
