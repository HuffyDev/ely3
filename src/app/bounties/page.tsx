import { ledgerView } from "@/lib/ledger";
import { LAUNCHPADS, FEE_FLOW_RECOMMENDATION, ECONOMICS_NOTE } from "@/lib/content/economics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bounties & funding — WHITEHAT" };

const CATEGORY_LABEL: Record<string, string> = {
  creator_fees: "Creator fees in",
  compute: "Compute",
  ai: "AI",
  bounty: "Bounty payout",
  other: "Other",
};

export default function BountiesPage() {
  let ledger = { entries: [], totalsByAsset: [], aiSpentTodayUsd: 0, empty: true } as ReturnType<typeof ledgerView>;
  try {
    ledger = ledgerView();
  } catch {
    /* db not ready */
  }
  return (
    <div className="container" style={{ paddingTop: 56, paddingBottom: 40 }}>
      <div className="measure">
        <div className="eyebrow">Bounties &amp; funding</div>
        <h1 style={{ marginTop: 10, fontSize: "2.2rem" }}>Funded by the $WHITEHAT coin</h1>
        <p className="muted" style={{ marginTop: 14 }}>
          Creator fees from the $WHITEHAT coin fund two things: the compute that runs the forks and AI review, and bug
          bounties for issues that lead to a fix. Every real inflow and outflow is posted below with a transaction hash.
        </p>
      </div>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 12 }}>Public ledger</h2>
        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: ledger.empty ? 0 : 16 }}>
            <div>
              <div className="mono" style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                ${ledger.aiSpentTodayUsd.toFixed(2)}
              </div>
              <div className="faint" style={{ fontSize: "0.8rem" }}>
                AI spend today (metered)
              </div>
            </div>
            {ledger.totalsByAsset.map((t) => (
              <div key={t.asset}>
                <div className="mono" style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                  {t.asset}
                </div>
                <div className="faint" style={{ fontSize: "0.8rem" }}>
                  in {t.inflow} · out {t.outflow}
                </div>
              </div>
            ))}
          </div>
          {ledger.empty ? (
            <p className="faint" style={{ fontSize: "0.86rem", marginTop: 12 }}>
              The ledger is empty. These are real figures, not a demo — entries appear only when the operator records an
              actual transaction. No counters are simulated.
            </p>
          ) : (
            <div style={{ marginTop: 8 }}>
              {ledger.entries.map((e, i) => (
                <div key={i} className="covered" style={{ gridTemplateColumns: "none", display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span className="faint mono" style={{ fontSize: "0.8rem" }}>
                    {new Date(e.at).toISOString().slice(0, 10)}
                  </span>
                  <span className="tag">{CATEGORY_LABEL[e.category] ?? e.category}</span>
                  <span className="mono">
                    {e.direction === "in" ? "+" : "−"}
                    {e.amount} {e.asset}
                  </span>
                  {e.txHash && (
                    <span className="mono faint" style={{ fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {e.txHash}
                    </span>
                  )}
                  {e.note && <span className="muted" style={{ fontSize: "0.86rem" }}>{e.note}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 6 }}>{FEE_FLOW_RECOMMENDATION.headline}</h2>
        <div className="panel measure" style={{ padding: 22 }}>
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            {FEE_FLOW_RECOMMENDATION.body.map((b, i) => (
              <li key={i} className="muted" style={{ marginBottom: 10 }}>
                {b}
              </li>
            ))}
          </ol>
          <hr className="hairline" style={{ margin: "16px 0" }} />
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Caveats to confirm before launch
          </div>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            {FEE_FLOW_RECOMMENDATION.caveats.map((c, i) => (
              <li key={i} className="muted" style={{ fontSize: "0.9rem", marginBottom: 6 }}>
                {c}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 12 }}>Elysium launchpads (verify before relying on these)</h2>
        <div className="panel">
          {LAUNCHPADS.map((l, i) => (
            <div key={l.name} style={{ padding: 20, borderTop: i ? "1px solid var(--border)" : "none" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 560 }}>
                  {l.name} →
                </a>
                <span className="tag">{l.status}</span>
              </div>
              <div className="muted" style={{ fontSize: "0.9rem", marginTop: 6 }}>
                Creator share: {l.creatorShare} · paid in {l.payout}
              </div>
              <p className="faint" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                {l.note}
              </p>
            </div>
          ))}
        </div>
        <p className="faint measure" style={{ fontSize: "0.84rem", marginTop: 16 }}>
          {ECONOMICS_NOTE}
        </p>
      </section>

      <section className="panel measure" style={{ padding: 22, marginTop: 32 }}>
        <h3>Bounty policy</h3>
        <p className="muted" style={{ fontSize: "0.92rem", marginTop: 8 }}>
          Bounties are paid by a human for issues that are confirmed on a fork, disclosed responsibly, and lead to a fix.
          The software never pays out on its own. Scope and amounts are set by the operator and posted here with the
          payout transaction.
        </p>
      </section>
    </div>
  );
}
