import { getDb, now } from "../db";
import { config } from "../config";
import { randomId } from "../crypto";
import type { Severity } from "../analysis/types";

/**
 * Responsible-disclosure workflow.
 *
 * State machine (every transition requires an operator action; nothing is sent or published
 * automatically):
 *
 *   draft ──approveNotice──▶ notice_approved ──markNotified──▶ notified
 *     notified ──(waiting period)──▶ (deadline passes) ─┐
 *     notified ──markFixed──▶ fixed ─┐                  │
 *                                     ├─approvePublish──▶ published
 *
 * Publication is limited to a human-written summary, and only after a fix or the deadline.
 * Working exploit code and unfixed details are never published.
 */

export type DisclosureStatus = "draft" | "notice_approved" | "notified" | "fixed" | "published" | "withdrawn";

export type Disclosure = {
  id: string;
  reportId: string;
  network: string;
  target: string;
  severity: Severity;
  internalTitle: string;
  status: DisclosureStatus;
  contact?: string;
  notifiedAt?: number;
  deadlineAt?: number;
  fixedAt?: number;
  publicSummary?: string;
  publishedAt?: number;
  createdAt: number;
};

function logEvent(id: string, actor: string, action: string, note?: string) {
  getDb().prepare("INSERT INTO disclosure_events(disclosure_id, at, actor, action, note) VALUES (?,?,?,?,?)").run(id, now(), actor, action, note ?? null);
}

export function createDisclosure(input: { reportId: string; network: string; target: string; severity: Severity; internalTitle: string; contact?: string }, actor: string): Disclosure {
  const id = randomId();
  const t = now();
  getDb()
    .prepare(
      `INSERT INTO disclosures(id, report_id, network, target, severity, internal_title, status, contact, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, input.reportId, input.network, input.target.toLowerCase(), input.severity, input.internalTitle, "draft", input.contact ?? null, t, t);
  logEvent(id, actor, "created");
  return get(id)!;
}

export function get(id: string): Disclosure | null {
  const r = getDb().prepare("SELECT * FROM disclosures WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? rowToDisclosure(r) : null;
}

export function list(status?: DisclosureStatus): Disclosure[] {
  const rows = status
    ? (getDb().prepare("SELECT * FROM disclosures WHERE status = ? ORDER BY created_at DESC").all(status) as Record<string, unknown>[])
    : (getDb().prepare("SELECT * FROM disclosures ORDER BY created_at DESC").all() as Record<string, unknown>[]);
  return rows.map(rowToDisclosure);
}

/** Step 1: operator approves that a private notice may be sent. The sending itself is done by a human. */
export function approveNotice(id: string, actor: string): Disclosure {
  must(id, "draft");
  getDb().prepare("UPDATE disclosures SET status='notice_approved', notice_approved_by=?, notice_approved_at=?, updated_at=? WHERE id=?").run(actor, now(), now(), id);
  logEvent(id, actor, "notice_approved", "Operator approved sending a private notice. A human sends it.");
  return get(id)!;
}

/** Step 2: operator records that the notice was actually sent (by them), starting the clock. */
export function markNotified(id: string, actor: string, note?: string): Disclosure {
  must(id, "notice_approved");
  const t = now();
  const deadline = t + config.disclosureWaitDays * 24 * 60 * 60 * 1000;
  getDb().prepare("UPDATE disclosures SET status='notified', notified_at=?, deadline_at=?, updated_at=? WHERE id=?").run(t, deadline, t, id);
  logEvent(id, actor, "notified", note ?? `Private notice sent. Waiting period: ${config.disclosureWaitDays} days.`);
  return get(id)!;
}

export function markFixed(id: string, actor: string, note?: string): Disclosure {
  mustIn(id, ["notified"]);
  getDb().prepare("UPDATE disclosures SET status='fixed', fixed_at=?, updated_at=? WHERE id=?").run(now(), now(), id);
  logEvent(id, actor, "fixed", note);
  return get(id)!;
}

export function deadlinePassed(d: Disclosure): boolean {
  return !!d.deadlineAt && now() >= d.deadlineAt;
}

/**
 * Step 3: publish a human-written summary. Allowed only after a fix, or after the deadline has
 * passed. The summary is provided by the operator; this function never derives it from stored
 * proofs, and it rejects anything that looks like exploit code.
 */
export function approvePublish(id: string, actor: string, publicSummary: string): Disclosure {
  const d = get(id);
  if (!d) throw new Error("No such disclosure.");
  if (d.status !== "fixed" && !(d.status === "notified" && deadlinePassed(d))) {
    throw new Error("Publication is only allowed after a fix is confirmed or the disclosure deadline has passed.");
  }
  assertSafeSummary(publicSummary);
  getDb().prepare("UPDATE disclosures SET status='published', public_summary=?, publish_approved_by=?, published_at=?, updated_at=? WHERE id=?").run(publicSummary.trim(), actor, now(), now(), id);
  logEvent(id, actor, "published", "Summary published.");
  return get(id)!;
}

export function withdraw(id: string, actor: string, note?: string): Disclosure {
  getDb().prepare("UPDATE disclosures SET status='withdrawn', updated_at=? WHERE id=?").run(now(), id);
  logEvent(id, actor, "withdrawn", note);
  return get(id)!;
}

/** Public disclosures list: only fixed or expired-timeline items, summaries only. */
export function publicDisclosures(): { target: string; network: string; severity: Severity; status: string; summary: string; publishedAt: number }[] {
  return list("published").map((d) => ({
    target: d.target,
    network: d.network,
    severity: d.severity,
    status: d.fixedAt ? "Fixed" : "Timeline expired",
    summary: d.publicSummary ?? "",
    publishedAt: d.publishedAt ?? now(),
  }));
}

export function events(id: string) {
  return getDb().prepare("SELECT at, actor, action, note FROM disclosure_events WHERE disclosure_id=? ORDER BY at ASC").all(id) as { at: number; actor: string; action: string; note?: string }[];
}

const EXPLOIT_MARKERS = [/function\s+\w*attack/i, /\.call\{value/i, /pragma solidity/i, /0x[0-9a-f]{80,}/i, /flashloan/i, /payload\s*=/i];
export function assertSafeSummary(summary: string) {
  if (summary.trim().length < 20) throw new Error("Summary is too short.");
  if (summary.length > 4000) throw new Error("Summary is too long for a public note.");
  for (const re of EXPLOIT_MARKERS) {
    if (re.test(summary)) throw new Error("Summary appears to contain exploit code or raw payloads. Publish a plain-language summary only.");
  }
}

function must(id: string, status: DisclosureStatus) {
  const d = get(id);
  if (!d) throw new Error("No such disclosure.");
  if (d.status !== status) throw new Error(`Expected status "${status}" but it is "${d.status}".`);
}
function mustIn(id: string, statuses: DisclosureStatus[]) {
  const d = get(id);
  if (!d) throw new Error("No such disclosure.");
  if (!statuses.includes(d.status)) throw new Error(`Action not allowed from status "${d.status}".`);
}

function rowToDisclosure(r: Record<string, unknown>): Disclosure {
  return {
    id: r.id as string,
    reportId: r.report_id as string,
    network: r.network as string,
    target: r.target as string,
    severity: r.severity as Severity,
    internalTitle: r.internal_title as string,
    status: r.status as DisclosureStatus,
    contact: (r.contact as string) ?? undefined,
    notifiedAt: (r.notified_at as number) ?? undefined,
    deadlineAt: (r.deadline_at as number) ?? undefined,
    fixedAt: (r.fixed_at as number) ?? undefined,
    publicSummary: (r.public_summary as string) ?? undefined,
    publishedAt: (r.published_at as number) ?? undefined,
    createdAt: r.created_at as number,
  };
}
