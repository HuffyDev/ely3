import { describe, it, expect } from "vitest";
import { makeFinding, toPublicFindings, EvidenceError } from "@/lib/analysis/evidence";
import type { ForkProof } from "@/lib/analysis/types";

const goodProof: ForkProof = {
  forkChainId: 31337,
  liveChainId: 99801,
  forkBlock: 100,
  observations: ["owner minted", "supply increased"],
  test: "probe:mint",
  passed: true,
};

describe("evidence levels", () => {
  it("AI-only findings are always REVIEW, never higher", () => {
    const f = makeFinding({
      key: "ai:x",
      title: "Suspicious",
      plain: "...",
      severity: "high",
      category: "other",
      exposure: "informational",
      sources: ["ai"],
      technical: "ai reasoning",
      recommendation: "verify",
      evidence: "LIKELY", // caller tries to upgrade — must be ignored
    });
    expect(f.evidence).toBe("REVIEW");
  });

  it("static (slither/source/bytecode) findings are LIKELY", () => {
    for (const src of ["slither", "source-pattern", "bytecode"] as const) {
      const f = makeFinding({ key: `s:${src}`, title: "t", plain: "p", severity: "medium", category: "other", exposure: "informational", sources: [src], technical: "x", recommendation: "y" });
      expect(f.evidence).toBe("LIKELY");
    }
  });

  it("a valid fork proof yields CONFIRMED_ON_FORK", () => {
    const f = makeFinding({ key: "k", title: "t", plain: "p", severity: "critical", category: "reentrancy", exposure: "exploitable", sources: ["fork"], technical: "x", recommendation: "y", proof: goodProof });
    expect(f.evidence).toBe("CONFIRMED_ON_FORK");
  });

  it("a proof whose fork chain equals the live chain is rejected (cannot be a real private fork)", () => {
    expect(() =>
      makeFinding({ key: "k2", title: "t", plain: "p", severity: "critical", category: "reentrancy", exposure: "exploitable", sources: ["fork"], technical: "x", recommendation: "y", proof: { ...goodProof, forkChainId: 99801, liveChainId: 99801 } }),
    ).toThrow(EvidenceError);
  });

  it("claiming CONFIRMED without a proof throws", () => {
    expect(() =>
      makeFinding({ key: "k3", title: "t", plain: "p", severity: "high", category: "other", exposure: "exploitable", sources: ["ai"], technical: "x", recommendation: "y", evidence: "CONFIRMED_ON_FORK" }),
    ).toThrow(EvidenceError);
  });

  it("callers may downgrade evidence but never upgrade", () => {
    const f = makeFinding({ key: "k4", title: "t", plain: "p", severity: "low", category: "other", exposure: "informational", sources: ["slither"], technical: "x", recommendation: "y", evidence: "REVIEW" });
    expect(f.evidence).toBe("REVIEW");
  });
});

describe("responsible-disclosure redaction of public findings", () => {
  const exploitable = makeFinding({ key: "reentrancy", title: "Funds can be drained", plain: "secret detail", severity: "critical", category: "reentrancy", exposure: "exploitable", sources: ["fork"], technical: "exact exploit path", recommendation: "fix", location: "withdraw()", proof: goodProof });

  it("withholds exploitable detail for contracts we don't own", () => {
    const [pub] = toPublicFindings([exploitable], false);
    expect(pub.withheld).toBe(true);
    expect(pub.technical).not.toContain("exact exploit path");
    expect(pub.location).toBeUndefined();
    expect(pub.proof).toBeUndefined();
    expect(pub.evidence).toBe("CONFIRMED_ON_FORK"); // level is still shown, detail is not
  });

  it("shows full detail for our own demo contracts", () => {
    const [pub] = toPublicFindings([exploitable], true);
    expect(pub.withheld).toBeFalsy();
    expect(pub.technical).toContain("exact exploit path");
  });

  it("privilege findings (owner powers) are shown, not withheld", () => {
    const priv = makeFinding({ key: "mint", title: "Owner can mint", plain: "p", severity: "high", category: "hidden-mint", exposure: "privilege", sources: ["fork"], technical: "detail", recommendation: "r", proof: goodProof });
    const [pub] = toPublicFindings([priv], false);
    expect(pub.withheld).toBeFalsy();
  });
});
