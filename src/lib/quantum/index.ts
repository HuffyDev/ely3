import { recoverPublicKey, serializeTransaction, keccak256, type Hex } from "viem";
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
  isContract: boolean;
  nonce: number;
  firstSpendTx?: string;
  recoveredPublicKey?: string;
  balanceWei: string;
  balanceAtRisk: boolean;
  grade: Grade;
  explanation: string[];
  checklist: { done: boolean; text: string }[];
  coverageNote: string;
};

/**
 * Determines, from chain data alone, whether a wallet's public key is already exposed.
 *
 * The definitive signal is the account nonce (eth_getTransactionCount): an EOA's public key is
 * revealed the first time it SENDS a transaction, because anyone can recover the public key from
 * that transaction's ECDSA signature. So nonce > 0 ⟺ at least one signature has been published
 * ⟺ the public key is recoverable. This needs only the RPC and is always available.
 *
 * When an explorer is configured we also surface the first outbound tx hash and, best effort,
 * cryptographically recover the public key from a real signed transaction to demonstrate the
 * point. We only ever READ; nothing is sent.
 */
export async function walletQuantumReadiness(network: NetworkId, address: string): Promise<WalletQuantum> {
  const { client } = await getClient(network);
  const [balance, nonce, code] = await Promise.all([
    client.getBalance({ address: address as Hex }),
    client.getTransactionCount({ address: address as Hex }),
    client.getCode({ address: address as Hex }).catch(() => undefined),
  ]);
  const isContract = !!code && code !== "0x";

  // Nonce > 0 is the definitive, RPC-only determination of public-key exposure for an EOA.
  const exposed = !isContract && nonce > 0;
  let firstSpend: string | undefined;
  let recoveredKey: string | undefined;
  let coverageNote = "";

  if (isContract) {
    coverageNote = "This address holds contract code, not an externally-owned wallet, so the public-key exposure question does not apply the same way. See the contract report for its signature and admin-key dependence.";
  } else if (exposed) {
    coverageNote = `Account nonce is ${nonce}: this wallet has sent ${nonce} transaction(s), so its public key is recoverable from those signatures.`;
    // Best effort: find the first outbound tx and recover the key from it to demonstrate exposure.
    const txs = (await fetchAddressTxs(address)) ?? [];
    const outbound = txs.filter((t) => t.from.toLowerCase() === address.toLowerCase());
    if (outbound.length > 0) {
      firstSpend = outbound[outbound.length - 1].hash;
      try {
        const key = await recoverKeyFromTx(network, firstSpend);
        if (key && addressFromPublicKey(key).toLowerCase() === address.toLowerCase()) {
          recoveredKey = key;
          coverageNote += " We recovered the public key from the first outbound transaction and confirmed it matches this address.";
        }
      } catch {
        /* recovery is a demonstration only; the nonce already settles exposure */
      }
    }
  } else {
    coverageNote = `Account nonce is 0: this wallet has never sent a transaction, so its public key is not yet exposed on-chain.`;
  }

  const balanceAtRisk = exposed && balance > 0n;
  const explanation: string[] = [];
  if (isContract) {
    explanation.push(
      "This address is a contract, not a personal wallet. Contracts don't have a single public key the way wallets do; their signature and admin-key exposure is covered in the contract report.",
    );
  } else if (exposed) {
    explanation.push(
      `This wallet has sent ${nonce} transaction(s), so its public key is already recorded on-chain and anyone can recover it. That is normal and not dangerous today.`,
    );
    if (balance > 0n) {
      explanation.push(
        "Because the wallet still holds a balance and its public key is exposed, it falls into the group that a future quantum computer could, in principle, target. Again: not today, and not certainly ever.",
      );
    } else {
      explanation.push("The public key is exposed, but this wallet holds no balance, so there is nothing at risk here today.");
    }
  } else {
    explanation.push(
      "This wallet has never sent a transaction, so its public key is not yet exposed on-chain. Keeping funds on an address that has never spent gives an extra margin of long-term safety.",
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
  score = Math.max(0, score);

  const label = isContract
    ? "Contract address — see the contract report"
    : exposed
      ? "Public key exposed (a readiness consideration, not a present threat)"
      : "Public key not yet exposed";

  return {
    address,
    network,
    publicKeyExposed: exposed,
    firstSpendTx: firstSpend,
    recoveredPublicKey: recoveredKey,
    isContract,
    nonce,
    balanceWei: balance.toString(),
    balanceAtRisk,
    grade: { letter: letterFor(score), score, limitedCoverage: false, label },
    explanation,
    checklist,
    coverageNote,
  };
}

/**
 * Recovers the signer's public key from a real on-chain transaction, proving the key is public.
 * Read-only. Supports legacy and EIP-1559/2930 transactions. Returns undefined if it can't
 * reconstruct the signing payload (the nonce check is what actually settles exposure).
 */
export async function recoverKeyFromTx(network: NetworkId, txHash: string): Promise<Hex | undefined> {
  const { client } = await getClient(network);
  const tx = await client.getTransaction({ hash: txHash as Hex });
  if (tx.r === undefined || tx.s === undefined) return undefined;
  const sig = { r: tx.r as Hex, s: tx.s as Hex, ...(tx.yParity !== undefined ? { yParity: tx.yParity } : {}), ...(tx.v !== undefined ? { v: tx.v } : {}) };
  // Rebuild the unsigned serialization and hash it, then recover the key.
  const base = {
    chainId: tx.chainId,
    nonce: tx.nonce,
    to: tx.to ?? undefined,
    value: tx.value,
    gas: tx.gas,
    data: tx.input,
  } as Record<string, unknown>;
  if (tx.type === "eip1559" || tx.type === "eip2930") {
    base.maxFeePerGas = tx.maxFeePerGas;
    base.maxPriorityFeePerGas = tx.maxPriorityFeePerGas;
    base.accessList = tx.accessList ?? [];
    base.type = tx.type;
  } else {
    base.gasPrice = tx.gasPrice;
    base.type = "legacy";
  }
  const serialized = serializeTransaction(base as never);
  const hash = keccak256(serialized);
  return recoverPublicKey({ hash, signature: sig as never });
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
