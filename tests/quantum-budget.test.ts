import { describe, it, expect, beforeEach } from "vitest";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { useMemoryDb } from "@/lib/db";
import { publicKeyFromSignature, addressFromPublicKey, contractQuantumSection, QUANTUM_DISCLAIMER } from "@/lib/quantum/index";
import { canSpend, recordUsage, worstCaseCost } from "@/lib/budget";

describe("quantum readiness framing and math", () => {
  it("never claims quantum-proof and states it is not an immediate threat", () => {
    expect(QUANTUM_DISCLAIMER).toMatch(/cannot break/i);
    expect(QUANTUM_DISCLAIMER).toMatch(/not an immediate threat/i);
    // It is allowed to say "Nothing here is quantum-proof"; it must never claim something IS quantum-proof.
    expect(QUANTUM_DISCLAIMER).toMatch(/nothing here is quantum-proof/i);
    expect(QUANTUM_DISCLAIMER).not.toMatch(/\bis quantum-proof\b(?!\.)/i);
  });

  it("recovers the public key from a signature, proving exposure after a spend", async () => {
    const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const hash = keccak256(toHex("hello"));
    const sig = await account.sign({ hash });
    const pub = await publicKeyFromSignature(hash, sig);
    expect(addressFromPublicKey(pub).toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("contract quantum section flags single-key ecrecover reliance as a readiness note, not a vuln", () => {
    const s = contractQuantumSection({ usesEcrecover: true, hasPermit: false, ownerIsEoa: true, upgradableBySingleKey: true });
    expect(s.points.some((p) => /ECDSA/i.test(p.title))).toBe(true);
    expect(s.grade.label).toMatch(/not a present threat/i);
  });
});

describe("AI budget caps", () => {
  beforeEach(() => useMemoryDb());

  it("blocks a scan whose input exceeds the per-scan token limit", () => {
    process.env.AI_MAX_INPUT_TOKENS_PER_SCAN = "1000";
    const r = canSpend("claude-opus-5-5", 50_000, 8000);
    expect(r.ok).toBe(false);
    delete process.env.AI_MAX_INPUT_TOKENS_PER_SCAN;
  });

  it("blocks once the daily budget would be exceeded", () => {
    process.env.AI_DAILY_BUDGET_USD = "0.01";
    recordUsage("claude-opus-5-5", 1_000_000, 100_000); // ~$6 of spend
    const r = canSpend("claude-opus-5-5", 1000, 1000);
    expect(r.ok).toBe(false);
    delete process.env.AI_DAILY_BUDGET_USD;
  });

  it("worst-case cost uses model pricing", () => {
    expect(worstCaseCost("claude-opus-5-5", 1_000_000, 1_000_000)).toBeCloseTo(24, 5); // $4 in + $20 out
  });
});
