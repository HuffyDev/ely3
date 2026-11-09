import crypto from "node:crypto";
import type { EvidenceLevel, EvidenceSource, Finding, ForkProof, Severity } from "./types";

export class EvidenceError extends Error {}

type Draft = Omit<Finding, "id" | "evidence"> & { evidence?: EvidenceLevel };

/**
 * The only way to create a finding. Enforces the evidence rules:
 *  - CONFIRMED_ON_FORK needs a passing proof from a private fork whose chain ID differs from the live chain.
 *  - LIKELY needs at least one non-AI static source (slither, bytecode, source pattern).
 *  - Anything backed only by AI is REVIEW, whatever the caller asked for.
 */
export function makeFinding(d: Draft): Finding {
  const nonAi = d.sources.filter((s) => s !== "ai");
  let evidence: EvidenceLevel;

  if (d.proof) {
    assertValidProof(d.proof);
    if (!d.sources.includes("fork")) d.sources = ["fork", ...d.sources];
    evidence = "CONFIRMED_ON_FORK";
  } else if (nonAi.length > 0 && !(nonAi.length === 1 && nonAi[0] === "fork")) {
    evidence = "LIKELY";
  } else {
    evidence = "REVIEW";
  }

  if (d.evidence === "CONFIRMED_ON_FORK" && evidence !== "CONFIRMED_ON_FORK") {
    throw new EvidenceError(`"${d.title}" was marked confirmed without a valid fork proof.`);
  }
  // Callers may downgrade, never upgrade.
  if (d.evidence && rank(d.evidence) < rank(evidence)) evidence = d.evidence;

  const id = crypto.createHash("sha256").update(d.key).digest("hex").slice(0, 12);
  return { ...d, id, evidence };
}

export function assertValidProof(p: ForkProof) {
  if (p.passed !== true) throw new EvidenceError("Proof did not pass.");
  if (!Number.isInteger(p.forkChainId)) throw new EvidenceError("Proof has no fork chain ID.");
  if (p.liveChainId !== null && p.forkChainId === p.liveChainId) {
    throw new EvidenceError("Proof must come from a private fork, not the live chain.");
  }
  if (!p.test) throw new EvidenceError("Proof must name the reproducing test.");
  if (!p.observations.length) throw new EvidenceError("Proof must record what was observed.");
}

function rank(e: EvidenceLevel) {
  return e === "CONFIRMED_ON_FORK" ? 3 : e === "LIKELY" ? 2 : 1;
}

/** Merge findings that describe the same issue, keeping the strongest evidence. */
export function mergeFindings(list: Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();
  for (const f of list) {
    const prev = byKey.get(f.key);
    if (!prev) {
      byKey.set(f.key, f);
      continue;
    }
    const strongest = rank(f.evidence) > rank(prev.evidence) ? f : prev;
    const other = strongest === f ? prev : f;
    const sources = Array.from(new Set<EvidenceSource>([...strongest.sources, ...other.sources]));
    byKey.set(f.key, {
      ...strongest,
      sources,
      technical: strongest.technical.includes(other.technical) ? strongest.technical : `${strongest.technical}\n\n${other.technical}`.trim(),
    });
  }
  return [...byKey.values()].sort(compareFindings);
}

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];
export function compareFindings(a: Finding, b: Finding) {
  return SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || rank(b.evidence) - rank(a.evidence);
}

/**
 * Prepares findings for a public report. Exploitable issues in contracts we don't own are
 * withheld until disclosure completes: no title, location, technical detail or proof steps.
 */
export function toPublicFindings(list: Finding[], isOwnDemoContract: boolean): Finding[] {
  return list.map((f) => {
    if (isOwnDemoContract || f.exposure !== "exploitable") return f;
    return {
      id: f.id,
      key: `withheld:${f.id}`,
      title: "Issue held for responsible disclosure",
      plain:
        f.evidence === "REVIEW"
          ? "An automated reviewer flagged something that needs a human check. Details stay private until it has been reviewed."
          : "We found a possible weakness that someone else could use. Details stay private while the project is notified and given time to fix it.",
      severity: f.severity,
      category: "other",
      exposure: "exploitable",
      evidence: f.evidence,
      sources: f.sources,
      technical: "Withheld under the responsible disclosure policy.",
      recommendation: "If you run this project, contact us through the Disclosures page to receive details privately.",
      withheld: true,
    };
  });
}
