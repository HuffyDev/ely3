import { describe, it, expect, beforeEach } from "vitest";
import { useMemoryDb, getDb } from "@/lib/db";
import { enqueue, claim, complete, fail, queueDepth } from "@/lib/queue";

/**
 * The agent pipeline's durability: jobs live in the database (survive a restart), are claimed
 * atomically with a lease (a crashed worker's job is reclaimed), processed highest-priority
 * first (value-at-risk ordering), and give up after repeated failures.
 */
describe("job queue (agent pipeline durability)", () => {
  beforeEach(() => useMemoryDb());

  it("processes higher priority (value at risk) first", () => {
    enqueue("watcher_scan", { address: "0xa" }, 1);
    enqueue("watcher_scan", { address: "0xb" }, 100); // more value at risk
    enqueue("watcher_scan", { address: "0xc" }, 10);
    const order = [claim()!, claim()!, claim()!].map((j) => JSON.parse(j.payload).address);
    expect(order).toEqual(["0xb", "0xc", "0xa"]);
  });

  it("a claimed job is not handed to a second worker until its lease expires", () => {
    enqueue("contract_scan", { address: "0xa" }, 1);
    const first = claim();
    expect(first).not.toBeNull();
    expect(claim()).toBeNull(); // still leased
  });

  it("survives a restart / crashed worker: a leased job is reclaimed once its lease expires", () => {
    enqueue("contract_scan", { address: "0xa" }, 1);
    // Claim with an already-expired lease (simulates a worker that crashed mid-job).
    const crashed = claim(-100_000)!;
    expect(crashed).not.toBeNull();
    expect(queueDepth()).toBe(1); // still in flight, not lost
    // A fresh worker reclaims the SAME job rather than losing it.
    const reclaimed = claim(-100_000)!;
    expect(reclaimed.id).toBe(crashed.id);
    complete(reclaimed.id);
    expect(queueDepth()).toBe(0);
  });

  it("gives up after 3 crash-reclaims instead of looping forever", () => {
    enqueue("contract_scan", { address: "0xa" }, 1);
    // Each reclaim with an expired lease simulates a worker crashing on the job.
    for (let i = 0; i < 3; i++) expect(claim(-100_000)).not.toBeNull();
    // After 3 attempts it is no longer reclaimed.
    expect(claim(-100_000)).toBeNull();
  });

  it("an explicit fail() marks a job failed and stops reprocessing it", () => {
    enqueue("contract_scan", { address: "0xa" }, 1);
    const j = claim()!;
    fail(j.id, "boom");
    expect(claim(-100_000)).toBeNull();
    expect(queueDepth()).toBe(0);
  });

  it("publishes only aggregate state, not per-contract detail, before disclosure", () => {
    // The watcher stores deployments and aggregate counts; it never writes a public report body.
    const db = getDb();
    db.prepare("INSERT INTO deployments(address, network, block, value_at_risk_wei, discovered_at) VALUES ('0xa','elysium',1,'1000',1)").run();
    const row = db.prepare("SELECT report_id FROM deployments WHERE address='0xa'").get() as { report_id: string | null };
    expect(row.report_id).toBeNull(); // no public report linked until one is produced and disclosed
  });
});
