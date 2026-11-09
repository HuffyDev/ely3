import { INCIDENTS, AGGREGATES, RESEARCH_NOTE } from "@/lib/content/research";

export const metadata = { title: "Research — WHITEHAT" };

export default function ResearchPage() {
  return (
    <div className="container" style={{ paddingTop: 56, paddingBottom: 40 }}>
      <div className="measure">
        <div className="eyebrow">Research</div>
        <h1 style={{ marginTop: 10, fontSize: "2.2rem" }}>What actually goes wrong</h1>
        <p className="muted" style={{ marginTop: 14 }}>
          WHITEHAT&apos;s checks are shaped by real incidents. Every case below is a real, publicly reported event with a
          linked source. We classify root cause honestly — including cases that were market manipulation, not a contract
          bug.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
        {AGGREGATES.map((a) => (
          <div key={a.stat} className="panel" style={{ padding: 18, flex: "1 1 260px" }}>
            <div style={{ fontWeight: 560 }}>{a.stat}</div>
            <p className="muted" style={{ fontSize: "0.88rem", marginTop: 6 }}>
              {a.detail}
            </p>
            <a href={a.source.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: "0.84rem" }}>
              {a.source.label} →
            </a>
          </div>
        ))}
      </div>

      <div className="stack" style={{ ["--gap" as string]: "16px", marginTop: 32 }}>
        {INCIDENTS.map((inc) => (
          <article key={inc.name} className="panel" style={{ padding: 22 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <h3 style={{ fontSize: "1.1rem" }}>{inc.name}</h3>
              <span className="tag">{inc.category}</span>
              {inc.chain && <span className="tag">{inc.chain}</span>}
              <span className="faint mono" style={{ fontSize: "0.82rem", marginLeft: "auto" }}>
                {inc.date}
              </span>
            </div>
            <div className="mono" style={{ fontSize: "0.92rem", marginTop: 8, color: "var(--text-muted)" }}>
              {inc.lossUsd}
            </div>
            <p className="measure" style={{ marginTop: 10 }}>
              {inc.summary}
            </p>
            <p className="measure muted" style={{ marginTop: 8, fontSize: "0.92rem" }}>
              <span className="eyebrow">Lesson: </span>
              {inc.lesson}
            </p>
            <div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
              {inc.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: "0.86rem" }}>
                  {s.label} →
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>

      <p className="faint measure" style={{ fontSize: "0.84rem", marginTop: 28 }}>
        {RESEARCH_NOTE}
      </p>
    </div>
  );
}
