import { getDb, now } from "../db";
import { encrypt, decrypt, proofKeyAvailable, randomId } from "../crypto";
import type { Finding } from "../analysis/types";

/**
 * Proof storage. Fork proofs (observations + the reproducing test name) are encrypted at rest
 * with PROOF_ENCRYPTION_KEY and only ever decrypted by the operator console. They are never
 * included in any public response. If no key is configured, proofs are not stored (they stay
 * only in memory for this run) rather than written in the clear.
 */
export function storeProofs(reportId: string, findings: Finding[]): number {
  if (!proofKeyAvailable()) return 0;
  const db = getDb();
  const insert = db.prepare("INSERT INTO proofs(id, report_id, finding_id, created_at, ciphertext) VALUES (?,?,?,?,?)");
  let count = 0;
  const tx = db.transaction(() => {
    for (const f of findings) {
      if (!f.proof) continue;
      const payload = JSON.stringify({ finding: { id: f.id, key: f.key, title: f.title, severity: f.severity, technical: f.technical, location: f.location }, proof: f.proof });
      insert.run(randomId(), reportId, f.id, now(), encrypt(payload));
      count++;
    }
  });
  tx();
  return count;
}

export type DecryptedProof = { id: string; reportId: string; createdAt: number; data: unknown };

/** Operator only. Decrypts stored proofs for a report. */
export function readProofs(reportId: string): DecryptedProof[] {
  if (!proofKeyAvailable()) throw new Error("PROOF_ENCRYPTION_KEY not configured.");
  const rows = getDb().prepare("SELECT id, report_id, created_at, ciphertext FROM proofs WHERE report_id = ?").all(reportId) as {
    id: string;
    report_id: string;
    created_at: number;
    ciphertext: string;
  }[];
  return rows.map((r) => ({ id: r.id, reportId: r.report_id, createdAt: r.created_at, data: JSON.parse(decrypt(r.ciphertext)) }));
}
