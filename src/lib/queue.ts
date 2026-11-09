import { getDb, now } from "./db";

export type JobType = "contract_scan" | "wallet_scan" | "watcher_scan";
export type Job = { id: number; type: JobType; payload: string; priority: number; attempts: number };

export function enqueue(type: JobType, payload: object, priority = 0) {
  const t = now();
  const r = getDb()
    .prepare("INSERT INTO jobs(type, payload, priority, created_at, updated_at) VALUES (?,?,?,?,?)")
    .run(type, JSON.stringify(payload), priority, t, t);
  return Number(r.lastInsertRowid);
}

/** Atomically claims the highest-priority job. Lease expires so crashed workers don't strand jobs. */
export function claim(leaseMs = 10 * 60_000): Job | null {
  const db = getDb();
  const t = now();
  const tx = db.transaction(() => {
    const job = db
      .prepare(
        "SELECT id, type, payload, priority, attempts FROM jobs WHERE (status='queued' OR (status='running' AND locked_until < ?)) AND attempts < 3 ORDER BY priority DESC, id ASC LIMIT 1",
      )
      .get(t) as Job | undefined;
    if (!job) return null;
    db.prepare("UPDATE jobs SET status='running', attempts=attempts+1, locked_until=?, updated_at=? WHERE id=?").run(t + leaseMs, t, job.id);
    return job;
  });
  return tx();
}

export function complete(id: number) {
  getDb().prepare("UPDATE jobs SET status='done', updated_at=? WHERE id=?").run(now(), id);
}
export function fail(id: number, error: string) {
  getDb().prepare("UPDATE jobs SET status='failed', error=?, updated_at=? WHERE id=?").run(error.slice(0, 2000), now(), id);
}
export function queueDepth() {
  return (getDb().prepare("SELECT COUNT(*) AS c FROM jobs WHERE status IN ('queued','running')").get() as { c: number }).c;
}
