import { describe, it, expect, beforeEach, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { useMemoryDb } from "@/lib/db";

/**
 * Proves at the API-route level that a privacy report cannot be obtained without a valid
 * signature from the wallet owner. We stub chain + report building so the test is hermetic;
 * the gate under test is the signature verification, not the report contents.
 */

// Make the network "available" and the report build a no-op so only the signature gate decides.
vi.mock("@/lib/chain", async (orig) => {
  const mod = (await orig()) as object;
  return { ...mod, availableNetworks: () => ["elysium"] };
});
vi.mock("@/lib/privacy/report", () => ({
  buildPrivacyReport: vi.fn(async (_n: string, address: string) => ({ kind: "privacy", address, signals: [], summary: "ok" })),
}));

import type { NextRequest } from "next/server";
import { POST as challengeRoute } from "@/app/api/privacy/challenge/route";
import { POST as verifyRoute } from "@/app/api/privacy/verify/route";
import { buildPrivacyReport } from "@/lib/privacy/report";

const challenge = (r: Request) => challengeRoute(r as unknown as NextRequest);
const verify = (r: Request) => verifyRoute(r as unknown as NextRequest);

const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const other = privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");

function req(body: unknown) {
  return new Request("http://localhost/api/privacy/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("privacy API: a report requires a valid owner signature", () => {
  beforeEach(() => {
    useMemoryDb();
    vi.clearAllMocks();
  });

  async function getChallenge(address: string) {
    const res = await challenge(new Request("http://localhost/api/privacy/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) }));
    return res.json();
  }

  it("a signed request from the owner returns the report", async () => {
    const { nonce, message } = await getChallenge(account.address);
    const signature = await account.signMessage({ message });
    const res = await verify(req({ address: account.address, network: "elysium", nonce, signature }));
    expect(res.status).toBe(200);
    expect(buildPrivacyReport).toHaveBeenCalledOnce();
  });

  it("an UNSIGNED request (no/garbage signature) is rejected with 401 and builds no report", async () => {
    const { nonce } = await getChallenge(account.address);
    const res = await verify(req({ address: account.address, network: "elysium", nonce, signature: "0x" + "00".repeat(65) }));
    expect(res.status).toBe(401);
    expect(buildPrivacyReport).not.toHaveBeenCalled();
  });

  it("a signature from a DIFFERENT wallet is rejected and builds no report", async () => {
    const { nonce, message } = await getChallenge(account.address);
    const wrong = await other.signMessage({ message });
    const res = await verify(req({ address: account.address, network: "elysium", nonce, signature: wrong }));
    expect(res.status).toBe(401);
    expect(buildPrivacyReport).not.toHaveBeenCalled();
  });

  it("a replayed nonce is rejected on the second use", async () => {
    const { nonce, message } = await getChallenge(account.address);
    const signature = await account.signMessage({ message });
    expect((await verify(req({ address: account.address, network: "elysium", nonce, signature }))).status).toBe(200);
    const second = await verify(req({ address: account.address, network: "elysium", nonce, signature }));
    expect(second.status).toBe(401);
  });
});
