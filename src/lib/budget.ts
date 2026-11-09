import { getDb, now } from "./db";
import { config } from "./config";

/** USD per million tokens. Source: Anthropic pricing as of 2026-10 (see docs/costs.md). */
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-fable-5-1": { in: 10, out: 50 },
};

export function priceFor(model: string) {
  return PRICES[model] ?? { in: 10, out: 50 }; // unknown model: assume the most expensive tier
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function spentToday(): number {
  const row = getDb().prepare("SELECT COALESCE(SUM(cost_usd),0) AS s FROM ai_usage WHERE day = ?").get(today()) as { s: number };
  return row.s;
}

/** Worst-case cost of one call, used to decide before spending. */
export function worstCaseCost(model: string, inputTokens: number, maxOutputTokens: number) {
  const p = priceFor(model);
  return (inputTokens * p.in + maxOutputTokens * p.out) / 1_000_000;
}

export function canSpend(model: string, inputTokens: number, maxOutputTokens: number): { ok: boolean; reason?: string } {
  if (inputTokens > config.aiMaxInputTokensPerScan) {
    return { ok: false, reason: `Source is about ${inputTokens.toLocaleString()} tokens, above the per-scan limit of ${config.aiMaxInputTokensPerScan.toLocaleString()}.` };
  }
  const projected = spentToday() + worstCaseCost(model, inputTokens, maxOutputTokens);
  if (projected > config.aiDailyBudgetUsd) {
    return { ok: false, reason: `Daily AI budget of $${config.aiDailyBudgetUsd.toFixed(2)} would be exceeded.` };
  }
  return { ok: true };
}

export function recordUsage(model: string, inputTokens: number, outputTokens: number, reportId?: string) {
  const p = priceFor(model);
  const cost = (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
  getDb()
    .prepare("INSERT INTO ai_usage(day, at, report_id, model, input_tokens, output_tokens, cost_usd) VALUES (?,?,?,?,?,?,?)")
    .run(today(), now(), reportId ?? null, model, inputTokens, outputTokens, cost);
  return cost;
}

/** Rough token estimate (≈4 chars/token for code). Used only for the pre-spend check. */
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 3.5);
}

/** Sliding-window rate limit. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const db = getDb();
  const cutoff = now() - windowMs;
  db.prepare("DELETE FROM rate_limits WHERE at < ?").run(cutoff);
  const { c } = db.prepare("SELECT COUNT(*) AS c FROM rate_limits WHERE key = ? AND at >= ?").get(key, cutoff) as { c: number };
  if (c >= limit) return false;
  db.prepare("INSERT INTO rate_limits(key, at) VALUES (?, ?)").run(key, now());
  return true;
}
