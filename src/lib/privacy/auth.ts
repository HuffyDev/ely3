import { verifyMessage, type Hex } from "viem";
import { getDb, now } from "../db";
import { randomId } from "../crypto";

/**
 * Wallet-signature gating for privacy reports.
 *
 * A privacy report is only ever produced for a wallet whose owner has proved control by
 * signing a free, off-chain message (no transaction, no gas). The flow:
 *   1. issueChallenge(address) → a one-time nonce + a human-readable message to sign.
 *   2. The user signs the message in their wallet (personal_sign / EIP-191).
 *   3. verifyChallenge(address, nonce, signature) → true only if the signature matches and
 *      the nonce is unused and unexpired.
 *
 * We never ask for a private key and never move funds. The signature only proves ownership.
 */

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export function challengeMessage(address: string, nonce: string): string {
  return [
    "WHITEHAT privacy report — prove wallet ownership",
    "",
    "Sign this message to generate a PRIVATE privacy report for your own wallet.",
    "This is free, happens off-chain, and does not create a transaction or move any funds.",
    "WHITEHAT will never ask for your private key or seed phrase.",
    "",
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

export function issueChallenge(address: string): { nonce: string; message: string; expiresAt: number } {
  const addr = address.toLowerCase();
  const nonce = randomId(16);
  const issued = now();
  const expires = issued + CHALLENGE_TTL_MS;
  getDb().prepare("INSERT INTO auth_nonces(nonce, address, issued_at, expires_at, used) VALUES (?,?,?,?,0)").run(nonce, addr, issued, expires);
  return { nonce, message: challengeMessage(addr, nonce), expiresAt: expires };
}

export async function verifyChallenge(address: string, nonce: string, signature: Hex): Promise<boolean> {
  const addr = address.toLowerCase();
  const db = getDb();
  const row = db.prepare("SELECT address, expires_at, used FROM auth_nonces WHERE nonce = ?").get(nonce) as { address: string; expires_at: number; used: number } | undefined;
  if (!row || row.used === 1 || row.address !== addr || now() > row.expires_at) return false;

  const ok = await verifyMessage({ address: addr as Hex, message: challengeMessage(addr, nonce), signature }).catch(() => false);
  if (!ok) return false;
  // Single use: consume the nonce only after a successful verification.
  const res = db.prepare("UPDATE auth_nonces SET used = 1 WHERE nonce = ? AND used = 0").run(nonce);
  return res.changes === 1;
}

/** Periodic cleanup of expired nonces. */
export function pruneChallenges() {
  getDb().prepare("DELETE FROM auth_nonces WHERE expires_at < ?").run(now());
}
