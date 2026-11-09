import { getDb, now } from "./db";
import { redact } from "./config";
import { randomId } from "./crypto";
import { analyzeContract } from "./analysis/analyze-contract";
import { walletQuantumReadiness } from "./quantum/index";
import { linkDeploymentReport } from "./watcher/index";
import type { NetworkId } from "./chain";
import type { ContractReport } from "./analysis/types";

export type ReportRow = {
  id: string;
  kind: "contract" | "wallet";
  network: string;
  target: string;
  status: "queued" | "running" | "done" | "failed";
  created_at: number;
  finished_at?: number;
  json?: string;
  error?: string;
  source: string;
};

export function createReport(kind: "contract" | "wallet", network: NetworkId, target: string, source = "user"): string {
  const id = randomId();
  getDb()
    .prepare("INSERT INTO reports(id, kind, network, target, status, created_at, source) VALUES (?,?,?,?,?,?,?)")
    .run(id, kind, network, target.toLowerCase(), "queued", now(), source);
  return id;
}

export function getReport(id: string): ReportRow | null {
  return (getDb().prepare("SELECT * FROM reports WHERE id = ?").get(id) as ReportRow | undefined) ?? null;
}

export function setRunning(id: string) {
  getDb().prepare("UPDATE reports SET status='running' WHERE id=?").run(id);
}

export function finishReport(id: string, body: object) {
  // Redact as a defence in depth; public report bodies already omit withheld detail.
  const json = redact(JSON.stringify(body));
  getDb().prepare("UPDATE reports SET status='done', finished_at=?, json=? WHERE id=?").run(now(), json, id);
}

export function failReport(id: string, error: string) {
  getDb().prepare("UPDATE reports SET status='failed', finished_at=?, error=? WHERE id=?").run(now(), redact(error).slice(0, 500), id);
}

/** Runs a contract report end to end and persists it. */
export async function runContractReport(id: string): Promise<void> {
  const row = getReport(id);
  if (!row) throw new Error("No such report");
  setRunning(id);
  try {
    const report = await analyzeContract({ network: row.network as NetworkId, address: row.target, reportId: id, source: row.source as "user" | "watcher" | "demo" });
    finishReport(id, report);
    if (row.source === "watcher") linkDeploymentReport(row.target, row.network, id);
  } catch (e) {
    failReport(id, (e as Error).message);
    throw e;
  }
}

/**
 * Runs a public wallet report: quantum readiness only. (Privacy reports are owner-gated and
 * never run through this public path.)
 */
export async function runWalletReport(id: string): Promise<void> {
  const row = getReport(id);
  if (!row) throw new Error("No such report");
  setRunning(id);
  try {
    const quantum = await walletQuantumReadiness(row.network as NetworkId, row.target);
    finishReport(id, { kind: "wallet", version: 1, network: row.network, address: row.target, generatedAt: new Date().toISOString(), quantum });
  } catch (e) {
    failReport(id, (e as Error).message);
    throw e;
  }
}

export function recentPublicReports(limit = 20): { id: string; kind: string; network: string; target: string; grade?: string; finished_at?: number }[] {
  const rows = getDb()
    .prepare("SELECT id, kind, network, target, json, finished_at FROM reports WHERE status='done' ORDER BY finished_at DESC LIMIT ?")
    .all(limit) as (ReportRow & { json?: string })[];
  return rows.map((r) => {
    let grade: string | undefined;
    try {
      const body = r.json ? JSON.parse(r.json) : undefined;
      grade = body?.grade?.letter ?? body?.quantum?.grade?.letter;
    } catch {
      /* ignore */
    }
    return { id: r.id, kind: r.kind, network: r.network, target: r.target, grade, finished_at: r.finished_at };
  });
}

export function parsedContractReport(row: ReportRow): ContractReport | null {
  if (row.kind !== "contract" || !row.json) return null;
  try {
    return JSON.parse(row.json) as ContractReport;
  } catch {
    return null;
  }
}
