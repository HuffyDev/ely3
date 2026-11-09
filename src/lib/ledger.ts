import { getDb, now } from "./db";
import { spentToday } from "./budget";

/**
 * Public spending ledger. Entries are added by the operator only, and are meant to reflect
 * REAL transactions (creator-fee income, compute bills, AI spend, bounty payouts). The app
 * never invents entries. AI spend is the one figure the app can record automatically from its
 * own metered usage; everything else is entered by a human with a tx hash or invoice note.
 */

export type LedgerDirection = "in" | "out";
export type LedgerCategory = "creator_fees" | "compute" | "ai" | "bounty" | "other";

export function addLedgerEntry(e: { direction: LedgerDirection; category: LedgerCategory; amount: string; asset: string; txHash?: string; note?: string }) {
  getDb()
    .prepare("INSERT INTO ledger(at, direction, category, amount, asset, tx_hash, note) VALUES (?,?,?,?,?,?,?)")
    .run(now(), e.direction, e.category, e.amount, e.asset, e.txHash ?? null, e.note ?? null);
}

export type LedgerView = {
  entries: { at: number; direction: LedgerDirection; category: LedgerCategory; amount: string; asset: string; txHash?: string; note?: string }[];
  totalsByAsset: { asset: string; inflow: string; outflow: string }[];
  aiSpentTodayUsd: number;
  empty: boolean;
};

export function ledgerView(): LedgerView {
  const rows = getDb().prepare("SELECT at, direction, category, amount, asset, tx_hash as txHash, note FROM ledger ORDER BY at DESC LIMIT 500").all() as LedgerView["entries"];
  const totals = new Map<string, { inflow: bigint; outflow: bigint }>();
  for (const r of rows) {
    const t = totals.get(r.asset) ?? { inflow: 0n, outflow: 0n };
    try {
      const amt = BigInt(r.amount.includes(".") ? r.amount.split(".")[0] : r.amount);
      if (r.direction === "in") t.inflow += amt;
      else t.outflow += amt;
    } catch {
      /* keep display value even if not integer-parseable */
    }
    totals.set(r.asset, t);
  }
  return {
    entries: rows,
    totalsByAsset: [...totals.entries()].map(([asset, t]) => ({ asset, inflow: t.inflow.toString(), outflow: t.outflow.toString() })),
    aiSpentTodayUsd: spentToday(),
    empty: rows.length === 0,
  };
}
