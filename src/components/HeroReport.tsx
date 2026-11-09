"use client";
import { useEffect, useState } from "react";

/**
 * An animated preview of a WHITEHAT report — shows, not tells. A grade reveals, then findings
 * slide in with their evidence tags, then a "confirmed on fork" proof line. Loops gently.
 * This is an illustrative product preview (clearly a sample), not live data.
 */
const STEPS = [
  { sev: "critical", ev: "CONFIRMED_ON_FORK", title: "Owner can mint unlimited tokens" },
  { sev: "high", ev: "CONFIRMED_ON_FORK", title: "Owner can freeze any holder" },
  { sev: "high", ev: "LIKELY", title: "Prices from a spot AMM pool" },
  { sev: "medium", ev: "REVIEW", title: "Unusual fee-on-transfer path" },
] as const;

export function HeroReport() {
  const [n, setN] = useState(0);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setN(STEPS.length);
      setScanning(false);
      return;
    }
    let step = 0;
    setScanning(true);
    const scanT = setTimeout(() => setScanning(false), 1100);
    const reveal = setInterval(() => {
      step += 1;
      setN(step);
      if (step >= STEPS.length) clearInterval(reveal);
    }, 620);
    return () => {
      clearTimeout(scanT);
      clearInterval(reveal);
    };
  }, []);

  return (
    <div className="card" style={{ padding: 22, boxShadow: "var(--shadow)", overflow: "hidden" }} aria-hidden>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div className="grade" data-g="F" style={{ width: 66, height: 66, fontSize: "2rem", borderRadius: 16, animation: "gradePop 0.7s var(--ease-out) both" }}>
          F
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="faint" style={{ fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Contract report · sample
          </div>
          <div className="mono" style={{ fontSize: "0.86rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            0x7a20…cb814f
          </div>
          <div style={{ fontSize: "0.82rem", marginTop: 2 }}>
            <span style={{ color: "var(--critical)", fontWeight: 600 }}>4 confirmed</span> <span className="faint">· 2 to review</span>
          </div>
        </div>
      </div>

      <div style={{ position: "relative", display: "grid", gap: 8 }}>
        {scanning && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, transparent, var(--accent-weak), transparent)",
              height: 40,
              borderRadius: 10,
              animation: "scanSweep 1.1s var(--ease-out)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          />
        )}
        <style>{`@keyframes scanSweep{0%{transform:translateY(-10px);opacity:0}20%{opacity:1}100%{transform:translateY(190px);opacity:0}}`}</style>
        {STEPS.map((s, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              opacity: i < n ? 1 : 0,
              transform: i < n ? "none" : "translateX(14px)",
              transition: "opacity 0.45s var(--ease-out), transform 0.45s var(--ease-out)",
            }}
          >
            <span className="tag" data-sev={s.sev} style={{ fontSize: "0.66rem", padding: "2px 7px" }}>
              {s.sev}
            </span>
            <span style={{ fontSize: "0.86rem", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{s.title}</span>
            <span className="tag" data-ev={s.ev} style={{ fontSize: "0.62rem", padding: "2px 7px" }}>
              {s.ev === "CONFIRMED_ON_FORK" ? "Confirmed" : s.ev === "LIKELY" ? "Likely" : "Review"}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "10px 12px",
          borderRadius: 10,
          background: "var(--accent-weak)",
          border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
          fontSize: "0.8rem",
          display: "flex",
          alignItems: "center",
          gap: 8,
          opacity: n >= STEPS.length ? 1 : 0,
          transition: "opacity 0.5s var(--ease-out)",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 3, background: "var(--grad)", flex: "none" }} />
        <span className="muted">
          Proven on a <strong style={{ color: "var(--text)" }}>private fork</strong> — never the live chain.
        </span>
      </div>
    </div>
  );
}
