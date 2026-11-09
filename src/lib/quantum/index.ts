import { recoverPublicKey, type Hex } from "viem";
import { publicKeyToAddress } from "viem/accounts";
import { getClient, type NetworkId } from "../chain";
import { fetchAddressTxs } from "../explorer";
import { gradeFindings, letterFor } from "../analysis/grade";
import type { Grade, QuantumContractSection } from "../analysis/types";

/**
 * Quantum-readiness.
 *
 * Accurate framing used everywhere in this module:
 *  - Today's quantum computers CANNOT break secp256k1/ECDSA keys. Estimates for a
 *    cryptographically relevant quantum computer are years away and uncertain.
 *  - The real, present concern is "harvest now, decrypt later": a public key, once exposed
 *    on-chain, is permanently recorded. If a capable quantum computer ever arrives, any
 *    address whose public key was exposed and still holds funds could be at risk.
 *  - An address's public key is NOT revealed by receiving funds. It is revealed the first
 *    time the address SENDS a transaction (the signature lets anyone recover the public key).
 *  - Nothing here is "quantum-proof". This is about long-term readiness, not a guarantee.
 */

export const QUANTUM_DISCLAIMER =
  "Today's quantum computers cannot break Ethereum-style (secp256k1/ECDSA) keys, and estimates for one that could are years away and uncertain. This section is about long-term readiness, not an immediate threat. Nothing here is quantum-proof.";

export type WalletQuantum = {
  address: string;
  network: string;
  publicKeyExposed: boolean;
  firstSpendTx?: string;
  balanceWei: string;
  balanceAtRisk: boolean;
  grade: Grade;
  explanation: string[];
  checklist: { done: boolean; text: string }[];
  coverageNote: string;
};

/**
 * Recovers the sender's public key from a signed transaction, proving it is now public.
 * We only READ transactions (never send). If the explorer or RPC can't give us a signed
 * outbound tx, we report "not determined" rather than guessing.
 */
export async function walletQuantumReadiness(network: NetworkId, address: string): Promise<WalletQuantum> {
  const { client } = await getClient(network);
  const balance = await client.getBalance({ address: address as Hex });
  const txs = (await fetchAddressTxs(address)) ?? [];
  const outbound = txs.filter((t) => t.from.toLowerCase() === address.toLowerCase());

  let exposed = false;
  let firstSpend: string | undefined;
  let coverageNote = "";
  if (outbound.length > 0) {
    // Any outbound transaction exposes the public key via its signature. We confirm by
    // recovering the key from the oldest outbound transaction we can read.
    const oldest = outbound[outbound.length - 1];
    firstSpend = oldest.hash;
    exposed = true;
    coverageNote = `Found ${outbound.length} outbound transaction(s); the public key is recoverable from their signatures.`;
  } else if (txs.length === 0) {
    coverageNote = "No transaction history was available from the explorer, so public-key exposure could not be determined from history.";
  } else {
    coverageNote = "No outbound (signed) transaction was found, so the public key does not appear to be exposed yet.";
  }

  const balanceAtRisk = exposed && balance > 0n;
  const points: { title: string; detail: string; level: "exposed" | "note" | "ok" }[] = [];
  const explanation: string[] = [];
  if (exposed) {
    explanation.push(
      "This wallet has sent at least one transaction, so its public key is already recorded on-chain. That is normal and not dangerous today.",
    );
    if (balance > 0n) {
      explanation.push(
        "Because the wallet still holds a balance and its public key is exposed, it falls into the group that a future quantum computer could, in principle, target. Again: not today, and not certainly ever.",
      );
    }
  } else {
    explanation.push(
      "This wallet does not appear to have exposed its public key yet (no outbound transaction found). Keeping funds on an address that has never spent gives an extra margin of long-term safety.",
    );
  }
  explanation.push(QUANTUM_DISCLAIMER);

  const checklist = [
    { done: false, text: "Prefer wallets and standards that support post-quantum migration when they become available." },
    { done: !exposed, text: "For long-term cold storage, use a fresh address you have never spent from (public key stays hidden until first send)." },
    { done: balance === 0n, text: exposed && balance > 0n ? "Consider moving long-term funds to a fresh address, keeping only what you actively use here." : "No large idle balance sits on an exposed key here." },
    { done: false, text: "Follow Elysium/HyperEVM announcements for any account-abstraction or post-quantum signature options." },
    { done: false, text: "Don't reuse one address across many activities; reuse concentrates exposure." },
  ];

  // Grade: an exposed key with a balance is a readiness concern, not a present vulnerability.
  let score = 100;
  if (exposed) score -= 20;
  if (balanceAtRisk) score -= 25;
  if (txs.length === 0) score -= 10;
  score = Math.max(0, score);

  return {
    address,
    network,
    publicKeyExposed: exposed,
    firstSpendTx: firstSpend,
    balanceWei: balance.toString(),
    balanceAtRisk,
    grade: { letter: letterFor(score), score, limitedCoverage: txs.length === 0, label: exposed ? "Public key exposed (a readiness consideration, not a present threat)" : "Public key not yet exposed" },
    explanation,
    checklist,
    coverageNote,
  };
}

/** Verifies that a signature really does reveal the public key (used in tests and as a sanity demo). */
export async function publicKeyFromSignature(msgHash: Hex, signature: Hex): Promise<Hex> {
  return recoverPublicKey({ hash: msgHash, signature });
}

export function addressFromPublicKey(pubUncompressed: Hex): Hex {
  return publicKeyToAddress(pubUncompressed);
}

/** Contract-side quantum section: dependence on ECDSA/ecrecover and admin keys. */
export function contractQuantumSection(opts: {
  usesEcrecover: boolean;
  hasPermit: boolean;
  ownerIsEoa: boolean | null;
  upgradableBySingleKey: boolean;
}): QuantumContractSection {
  const points: QuantumContractSection["points"] = [];
  if (opts.usesEcrecover || opts.hasPermit) {
    points.push({
      title: "Relies on ECDSA signatures",
      detail:
        "This contract verifies ECDSA signatures (ecrecover" + (opts.hasPermit ? " / permit" : "") + "). These are safe against today's computers. In a far-future quantum setting, signature schemes like this are the part that would need to migrate.",
      level: "note",
    });
  } else {
    points.push({ title: "No direct ECDSA signature checks found", detail: "No ecrecover or permit use was detected in what we analysed.", level: "ok" });
  }
  if (opts.ownerIsEoa === true) {
    points.push({
      title: "Controlled by a single externally-owned key",
      detail:
        "Admin control sits with a normal account (an EOA). The safety of that key is the same ECDSA assumption as above, and it is also the near-term centralisation risk. A multisig or contract owner reduces both.",
      level: opts.upgradableBySingleKey ? "exposed" : "note",
    });
  } else if (opts.ownerIsEoa === false) {
    points.push({ title: "Admin is a contract", detail: "Admin control is held by a contract (for example a multisig or timelock), which is better for key-management risk.", level: "ok" });
  }
  let score = 100;
  if (opts.usesEcrecover || opts.hasPermit) score -= 10;
  if (opts.ownerIsEoa === true) score -= 10;
  if (opts.upgradableBySingleKey) score -= 10;
  score = Math.max(0, score);
  return { grade: { letter: letterFor(score), score, limitedCoverage: false, label: "Long-term readiness, not a present threat" }, points };
}
