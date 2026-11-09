"use client";
import { useEffect, useState } from "react";
import { GradeBadge, SeverityTag, EvidenceTag } from "./ui";
import type { ContractReport, Finding } from "@/lib/analysis/types";

type ApiReport = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  kind: string;
  network: string;
  target: string;
  error?: string;
  report: ContractReport | WalletReport | null;
};

type WalletReport = {
  kind: "wallet";
  network: string;
  address: string;
  generatedAt: string;
  quantum: {
    grade: { letter: string; label: string };
    publicKeyExposed: boolean;
    balanceWei: string;
    explanation: string[];
    checklist: { done: boolean; text: string }[];
    coverageNote: string;
    firstSpendTx?: string;
  };
};

export function ReportView({ id }: { id: string }) {
  const [data, setData] = useState<ApiReport | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const start = Date.now();
    async function poll() {
      try {
        const res = await fetch(`/api/report/${id}`);
        const d = (await res.json()) as ApiReport;
        if (!alive) return;
        setData(d);
        setElapsed(Math.round((Date.now() - start) / 1000));
        if (d.status === "queued" || d.status === "running") timer = setTimeout(poll, 1200);
      } catch {
        if (alive) timer = setTimeout(poll, 2000);
      }
    }
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);

  if (!data) return <Loading label="Loading report…" />;
  if (data.status === "queued" || data.status === "running")
    return <Loading label={data.status === "queued" ? "Queued…" : "Analysing on a private fork…"} elapsed={elapsed} target={data.target} />;
  if (data.status === "failed")
    return (
      <div className="panel" style={{ padding: 24 }}>
        <h2>Report failed</h2>
        <p className="muted" style={{ marginTop: 10 }}>
          {data.error || "Something went wrong."}
        </p>
        <p className="faint" style={{ marginTop: 10, fontSize: "0.88rem" }}>
          This usually means the network RPC is unreachable, the address has no contract code, or a tool is missing.
        </p>
      </div>
    );

  const report = data.report;
  if (!report) return <Loading label="Finalising…" />;
  if (report.kind === "wallet") return <WalletReportView r={report as WalletReport} />;
  return <ContractReportView r={report as ContractReport} />;
}

function Loading({ label, elapsed, target }: { label: string; elapsed?: number; target?: string }) {
  return (
    <div className="panel" style={{ padding: 28, display: "flex", gap: 16, alignItems: "center" }}>
      <Spinner />
      <div>
        <div style={{ fontWeight: 500 }}>{label}</div>
        {target && (
          <div className="mono faint" style={{ fontSize: "0.82rem", marginTop: 4 }}>
            {target}
          </div>
        )}
        {elapsed !== undefined && (
          <div className="faint" style={{ fontSize: "0.82rem", marginTop: 4 }}>
            {elapsed}s · starting a private fork, probing, then grading
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" style={{ animation: "spin 0.9s linear infinite" }} aria-hidden>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--border-strong)" strokeWidth="3" />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ContractReportView({ r }: { r: ContractReport }) {
  const confirmed = r.findings.filter((f) => f.evidence === "CONFIRMED_ON_FORK").length;
  return (
    <div className="stack" style={{ ["--gap" as string]: "40px" }}>
      <header className="panel" style={{ padding: 24 }}>
        <div style={{ display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
          <GradeBadge letter={r.grade.letter} />
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <div className="eyebrow">{r.isOwnDemoContract ? "WHITEHAT demo contract" : "Contract report"}</div>
            <h1 style={{ fontSize: "1.5rem", marginTop: 6 }}>{r.name || "Contract"}</h1>
            <div className="mono muted" style={{ fontSize: "0.88rem", marginTop: 4, overflowWrap: "anywhere" }}>
              {r.address}
            </div>
            <p className="measure" style={{ marginTop: 14 }}>
              {r.summary}
            </p>
            {r.grade.limitedCoverage && (
              <p className="faint" style={{ fontSize: "0.84rem", marginTop: 8 }}>
                Limited coverage — see what was and wasn&apos;t checked below.
              </p>
            )}
          </div>
          <ShareCard grade={r.grade.letter} confirmed={confirmed} total={r.findings.length} label={r.grade.label} />
        </div>
      </header>

      <section>
        <SectionHead title={r.findings.length ? "Findings" : "No issues found by these checks"} count={r.findings.length} />
        {r.findings.length === 0 ? (
          <div className="panel" style={{ padding: 22 }}>
            <p className="muted measure">
              Nothing was flagged by the checks that ran. This is not a statement that the contract is safe — it means
              these specific checks found no issue. See the coverage list below for exactly what was examined.
            </p>
          </div>
        ) : (
          <div className="panel" style={{ padding: "4px 20px" }}>
            {r.findings.map((f) => (
              <FindingRow key={f.id} f={f} />
            ))}
          </div>
        )}
      </section>

      <section style={{ display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div>
          <SectionHead title="Quantum readiness" />
          <div className="panel" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <GradeBadge letter={r.quantum.grade.letter} size="sm" />
              <div className="muted" style={{ fontSize: "0.9rem" }}>
                {r.quantum.grade.label}
              </div>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 12 }}>
              {r.quantum.points.map((p, i) => (
                <li key={i} style={{ display: "flex", gap: 10 }}>
                  <Dot level={p.level} />
                  <div>
                    <div style={{ fontWeight: 500, fontSize: "0.92rem" }}>{p.title}</div>
                    <div className="muted" style={{ fontSize: "0.88rem" }}>
                      {p.detail}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div>
          <SectionHead title="Details" />
          <div className="panel" style={{ padding: 20 }}>
            <dl className="kv">
              {r.facts.map((f, i) => (
                <FactRow key={i} label={f.label} value={f.value} mono={f.mono} />
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section>
        <SectionHead title="What we checked" />
        <div className="panel" style={{ padding: "4px 20px 14px" }}>
          {r.coverage.map((c, i) => (
            <div key={i} className="covered">
              <CoverageMark status={c.status} />
              <div>
                <span style={{ fontWeight: 500 }}>{c.check}</span>
                {c.note && (
                  <span className="muted" style={{ fontSize: "0.88rem" }}>
                    {" "}
                    — {c.note}
                  </span>
                )}
              </div>
            </div>
          ))}
          <div className="covered">
            <CoverageMark status={r.ai.used ? "ran" : "skipped"} />
            <div>
              <span style={{ fontWeight: 500 }}>AI review</span>
              <span className="muted" style={{ fontSize: "0.88rem" }}>
                {" "}
                — {r.ai.used ? `${r.ai.model} · leads only, shown as Review` : "not run (no API key or budget)"}
                {r.ai.note ? `. ${r.ai.note}` : ""}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="stack" style={{ ["--gap" as string]: "8px" }}>
        {r.disclaimers.map((d, i) => (
          <p key={i} className="faint measure" style={{ fontSize: "0.84rem" }}>
            {d}
          </p>
        ))}
      </section>
    </div>
  );
}

function WalletReportView({ r }: { r: WalletReport }) {
  const q = r.quantum;
  return (
    <div className="stack" style={{ ["--gap" as string]: "32px" }}>
      <header className="panel" style={{ padding: 24, display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <GradeBadge letter={q.grade.letter} />
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          <div className="eyebrow">Wallet — quantum readiness</div>
          <div className="mono" style={{ fontSize: "1rem", marginTop: 6, overflowWrap: "anywhere" }}>
            {r.address}
          </div>
          <p className="muted" style={{ marginTop: 6 }}>
            {q.grade.label}
          </p>
        </div>
      </header>
      <section>
        <SectionHead title="What this means" />
        <div className="panel measure" style={{ padding: 22 }}>
          {q.explanation.map((e, i) => (
            <p key={i} className="muted" style={{ marginBottom: 10 }}>
              {e}
            </p>
          ))}
          <p className="faint" style={{ fontSize: "0.85rem", marginTop: 8 }}>
            {q.coverageNote}
          </p>
        </div>
      </section>
      <section>
        <SectionHead title="Migration checklist" />
        <div className="panel" style={{ padding: "6px 20px 14px" }}>
          {q.checklist.map((c, i) => (
            <div key={i} className="covered">
              <CoverageMark status={c.done ? "ran" : "skipped"} />
              <span className={c.done ? "muted" : ""}>{c.text}</span>
            </div>
          ))}
        </div>
      </section>
      <p className="faint measure" style={{ fontSize: "0.84rem" }}>
        Want the privacy side too? A wallet-privacy report requires proving you own this wallet by signing a free
        message. Use the Wallet privacy page.
      </p>
    </div>
  );
}

function FindingRow({ f }: { f: Finding }) {
  return (
    <details className="finding">
      <summary>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <SeverityTag severity={f.severity} />
          <EvidenceTag level={f.evidence} />
        </div>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>{f.title}</div>
          <div className="muted" style={{ fontSize: "0.9rem" }}>
            {f.plain}
          </div>
        </div>
        <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 18l6-6-6-6" />
        </svg>
      </summary>
      <div className="finding-body stack" style={{ ["--gap" as string]: "12px" }}>
        {f.location && (
          <div>
            <span className="faint" style={{ fontSize: "0.8rem" }}>
              Location{" "}
            </span>
            <code className="inline">{f.location}</code>
          </div>
        )}
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            Technical detail
          </div>
          <p className="muted" style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>
            {f.technical}
          </p>
        </div>
        {f.proof && (
          <div className="panel" style={{ padding: 14, background: "var(--surface-2)" }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Proof on a private fork (chain {f.proof.forkChainId}, block {f.proof.forkBlock})
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {f.proof.observations.map((o, i) => (
                <li key={i} className="muted" style={{ fontSize: "0.88rem" }}>
                  {o}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            What to do
          </div>
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            {f.recommendation}
          </p>
        </div>
        <div className="faint" style={{ fontSize: "0.8rem" }}>
          Sources: {f.sources.join(", ")}
        </div>
      </div>
    </details>
  );
}

function ShareCard({ grade, confirmed, total, label }: { grade: string; confirmed: number; total: number; label: string }) {
  return (
    <div className="panel" style={{ padding: 16, minWidth: 180, background: "var(--surface-2)" }}>
      <div className="eyebrow">Report card</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <span className="mono" style={{ fontSize: "1.8rem", fontWeight: 600 }}>
          {grade}
        </span>
        <span className="muted" style={{ fontSize: "0.82rem" }}>
          {label}
        </span>
      </div>
      <div className="faint" style={{ fontSize: "0.8rem", marginTop: 8 }}>
        {confirmed} confirmed · {total} total
      </div>
    </div>
  );
}

function SectionHead({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
      <h2 style={{ fontSize: "1.25rem" }}>{title}</h2>
      {count !== undefined && count > 0 && (
        <span className="faint mono" style={{ fontSize: "0.9rem" }}>
          {count}
        </span>
      )}
    </div>
  );
}

function FactRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : ""} style={mono ? { fontSize: "0.86rem" } : undefined}>
        {value}
      </dd>
    </>
  );
}

function Dot({ level }: { level: "exposed" | "note" | "ok" }) {
  const color = level === "exposed" ? "var(--high)" : level === "ok" ? "var(--success)" : "var(--text-faint)";
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 6, flex: "none" }} aria-hidden />;
}

function CoverageMark({ status }: { status: "ran" | "skipped" | "partial" }) {
  const map = { ran: ["var(--success)", "✓"], partial: ["var(--medium)", "~"], skipped: ["var(--text-faint)", "–"] } as const;
  const [color, ch] = map[status];
  return (
    <span className="mono" style={{ color, flex: "none", width: 16, textAlign: "center" }} aria-label={status}>
      {ch}
    </span>
  );
}
