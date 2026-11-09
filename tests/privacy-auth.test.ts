import { describe, it, expect, beforeEach } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { useMemoryDb } from "@/lib/db";
import { issueChallenge, verifyChallenge, challengeMessage } from "@/lib/privacy/auth";

const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const other = privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");

describe("wallet-signature gating for privacy reports", () => {
  beforeEach(() => {
    useMemoryDb();
  });

  it("accepts a correct signature from the claimed owner", async () => {
    const { nonce, message } = issueChallenge(account.address);
    const signature = await account.signMessage({ message });
    expect(message).toBe(challengeMessage(account.address.toLowerCase(), nonce));
    expect(await verifyChallenge(account.address, nonce, signature)).toBe(true);
  });

  it("rejects a signature from a different wallet", async () => {
    const { nonce, message } = issueChallenge(account.address);
    const wrongSig = await other.signMessage({ message });
    expect(await verifyChallenge(account.address, nonce, wrongSig)).toBe(false);
  });

  it("rejects a reused nonce (single use)", async () => {
    const { nonce, message } = issueChallenge(account.address);
    const signature = await account.signMessage({ message });
    expect(await verifyChallenge(account.address, nonce, signature)).toBe(true);
    expect(await verifyChallenge(account.address, nonce, signature)).toBe(false);
  });

  it("rejects an unknown nonce", async () => {
    const { message } = issueChallenge(account.address);
    const signature = await account.signMessage({ message });
    expect(await verifyChallenge(account.address, "not-a-real-nonce", signature)).toBe(false);
  });

  it("the signed message states it is free and off-chain and never asks for a key", () => {
    const msg = challengeMessage(account.address.toLowerCase(), "abc");
    expect(msg).toMatch(/off-chain/i);
    expect(msg).toMatch(/does not create a transaction/i);
    expect(msg).toMatch(/never ask for your private key/i);
  });
});
