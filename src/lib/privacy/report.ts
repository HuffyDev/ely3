import { formatEther, type Hex } from "viem";
import { getClient, type NetworkId } from "../chain";
import { fetchAddressTxs, type TxSummary } from "../explorer";
import { getDb, now } from "../db";
import { encrypt, decrypt, proofKeyAvailable, randomId } from "../crypto";
import { walletQuantumReadiness, type WalletQuantum } from "../quantum/index";

/**
 * Privacy report (owner-gated). Uses PUBLIC on-chain data only to show a wallet's owner how
 * exposed they are, and how to reduce it. It is NEVER published, indexed, or made lookup-able
 * for anyone else, and it does not identify who owns an address. Results are encrypted at rest
 * and returned only to the proven owner (or via a share link the owner explicitly creates).
 *
 * Known exchange/CEX deposit heuristics are intentionally generic (labels, not identities).
 */

export type PrivacySignal = {
  title: string;
  level: "high" | "medium" | "low";
  detail: string;
  advice: string;
};

export type PrivacyReport = {
  kind: "privacy";
  version: 1;
  address: string;
  network: string;
  generatedAt: string;
  balance: string;
  txCount: number;
  signals: PrivacySignal[];
  fundingLinks: { address: string; direction: "in" | "out"; count: number; firstAt?: number }[];
  quantum: WalletQuantum;
  summary: string;
  disclaimers: string[];
};

const CEX_METHOD_HINTS = ["deposit", "depositeth"];

export async function buildPrivacyReport(network: NetworkId, address: string): Promise<PrivacyReport> {
  const addr = address.toLowerCase();
  const { client } = await getClient(network);
  const balance = await client.getBalance({ address: addr as Hex });
  const txs = (await fetchAddressTxs(addr, 500)) ?? [];
  const signals: PrivacySignal[] = [];

  const outbound = txs.filter((t) => t.from === addr);
  const inbound = txs.filter((t) => t.to === addr);

  // Address reuse
  const counterparties = new Map<string, { in: number; out: number; firstAt?: number }>();
  for (const t of txs) {
    const other = t.from === addr ? t.to : t.from;
    if (!other || other === addr) continue;
    const c = counterparties.get(other) ?? { in: 0, out: 0 };
    if (t.from === addr) c.out++;
    else c.in++;
    c.firstAt = c.firstAt ? Math.min(c.firstAt, t.timestamp ?? c.firstAt) : t.timestamp;
    counterparties.set(other, c);
  }

  if (txs.length > 0) {
    signals.push({
      title: "This address is reused",
      level: outbound.length > 20 ? "high" : outbound.length > 3 ? "medium" : "low",
      detail: `The wallet has ${txs.length} transactions with ${counterparties.size} distinct counterparties. Reuse lets anyone build a full picture of your activity from this one address.`,
      advice: "Use a fresh address for unrelated activities, and avoid routing everything through one hot wallet.",
    });
  }

  // Direct funding links (where did this wallet's money come from / go to)
  const fundingLinks = [...counterparties.entries()]
    .map(([address, c]) => ({ address, direction: (c.out >= c.in ? "out" : "in") as "in" | "out", count: c.in + c.out, firstAt: c.firstAt }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // First funding source
  const firstInbound = inbound[inbound.length - 1];
  if (firstInbound) {
    signals.push({
      title: "Your first funding source is visible",
      level: "medium",
      detail: `The first incoming transfer came from ${firstInbound.from}. Anyone can trace a wallet back to where it was first funded, which often links it to other wallets you control.`,
      advice: "Be aware that the funding trail is permanent. For sensitive activity, fund from a fresh source or through tooling designed for that.",
    });
  }

  // Exchange deposit pattern (generic heuristic, label only)
  const depositish = txs.filter((t) => t.from === addr && (CEX_METHOD_HINTS.includes((t.method ?? "").toLowerCase()) || (t.to && counterparties.get(t.to)?.out === 1)));
  if (outbound.some((t) => CEX_METHOD_HINTS.includes((t.method ?? "").toLowerCase()))) {
    signals.push({
      title: "Possible exchange deposit links",
      level: "medium",
      detail: "Some outgoing transactions look like deposits to a service (for example an exchange). Exchanges can connect those deposits to your identity through KYC.",
      advice: "Keep exchange-linked wallets separate from wallets you want to keep pseudonymous.",
    });
  }

  // Approvals left open (read-only: look for approve methods in history)
  const approvals = txs.filter((t) => (t.method ?? "").toLowerCase().startsWith("approve"));
  if (approvals.length > 0) {
    signals.push({
      title: `${approvals.length} token approval${approvals.length === 1 ? "" : "s"} in history`,
      level: approvals.length > 5 ? "high" : "medium",
      detail: "Approvals let other contracts move your tokens. Old or unlimited approvals are both a privacy signal and a security risk.",
      advice: "Review and revoke approvals you no longer need. Prefer exact-amount approvals over unlimited ones.",
    });
  }

  // Round-number / timing patterns
  const roundValues = txs.filter((t) => t.value && /0{15,}$/.test(BigInt(t.value).toString())).length;
  if (roundValues > 3) {
    signals.push({
      title: "Round-number transfers stand out",
      level: "low",
      detail: "Several transfers use round amounts, which are easy to spot and correlate across addresses.",
      advice: "Vary amounts where privacy matters.",
    });
  }

  const quantum = await walletQuantumReadiness(network, addr);

  const highest = signals.reduce((acc, s) => Math.max(acc, s.level === "high" ? 3 : s.level === "medium" ? 2 : 1), 0);
  const summary =
    txs.length === 0
      ? "No public transaction history was available, so there is little to expose from history. Keep it that way for cold storage."
      : `Your wallet has ${txs.length} public transactions. We found ${signals.length} privacy signal${signals.length === 1 ? "" : "s"}${highest === 3 ? ", including some worth acting on" : ""}. Everything here is already public; this report just makes it legible so you can reduce it.`;

  return {
    kind: "privacy",
    version: 1,
    address: addr,
    network,
    generatedAt: new Date().toISOString(),
    balance: formatEther(balance),
    txCount: txs.length,
    signals,
    fundingLinks,
    quantum,
    summary,
    disclaimers: [
      "This report uses only public on-chain data. It is private to you and is not published, indexed, or made searchable for anyone else.",
      "WHITEHAT does not identify who owns an address. This is about your own exposure, for your own wallet.",
    ],
  };
}

/** Stores an owner's privacy report encrypted at rest, keyed to the proven owner. */
export function storePrivacyReport(owner: string, network: string, report: PrivacyReport): string {
  if (!proofKeyAvailable()) throw new Error("PROOF_ENCRYPTION_KEY not configured; cannot store a private report.");
  const id = randomId();
  getDb().prepare("INSERT INTO privacy_reports(id, owner, network, created_at, ciphertext, share_token) VALUES (?,?,?,?,?,NULL)").run(id, owner.toLowerCase(), network, now(), encrypt(JSON.stringify(report)));
  return id;
}

/** Returns a stored report only when the requester has proven they are the owner. */
export function readOwnPrivacyReport(id: string, provenOwner: string): PrivacyReport | null {
  const row = getDb().prepare("SELECT owner, ciphertext FROM privacy_reports WHERE id = ?").get(id) as { owner: string; ciphertext: string } | undefined;
  if (!row || row.owner !== provenOwner.toLowerCase()) return null;
  return JSON.parse(decrypt(row.ciphertext)) as PrivacyReport;
}

/** The owner may create a share link. Only then is the report reachable by token (still not indexed). */
export function createShareToken(id: string, provenOwner: string): string | null {
  const row = getDb().prepare("SELECT owner FROM privacy_reports WHERE id = ?").get(id) as { owner: string } | undefined;
  if (!row || row.owner !== provenOwner.toLowerCase()) return null;
  const token = randomId(24);
  getDb().prepare("UPDATE privacy_reports SET share_token = ? WHERE id = ?").run(token, id);
  return token;
}

export function readShared(token: string): PrivacyReport | null {
  if (!token) return null;
  const row = getDb().prepare("SELECT ciphertext FROM privacy_reports WHERE share_token = ?").get(token) as { ciphertext: string } | undefined;
  return row ? (JSON.parse(decrypt(row.ciphertext)) as PrivacyReport) : null;
}
