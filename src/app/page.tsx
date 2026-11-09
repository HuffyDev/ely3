import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { ScanForm } from "@/components/ScanForm";
import { HeroReport } from "@/components/HeroReport";
import { Reveal } from "@/components/Reveal";
import { CountUp } from "@/components/CountUp";
import { availableNetworks, NETWORKS } from "@/lib/chain";
import { recentPublicReports } from "@/lib/reports";
import { config } from "@/lib/config";
import { GradeBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

type Bench = { expectedTotal: number; detectedTotal: number; confirmedTotal: number; falsePositives: string[] } | null;

function loadBenchmark(): Bench {
  try {
    const p = path.join(config.dataDir, "benchmark.json");
    if (!fs.existsSync(p)) return null;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return { expectedTotal: j.expectedTotal, detectedTotal: j.detectedTotal, confirmedTotal: j.confirmedTotal, falsePositives: j.falsePositives ?? [] };
  } catch {
    return null;
  }
}

export default function Home() {
  const networks = availableNetworks().map((id) => ({ id, label: NETWORKS[id].label }));
  const bench = loadBenchmark();
  let recent: ReturnType<typeof recentPublicReports> = [];
  try {
    recent = recentPublicReports(6);
  } catch {
    /* db not ready */
  }

  return (
    <>
      {/* HERO */}
      <section className="container" style={{ paddingTop: "clamp(40px, 7vh, 88px)", paddingBottom: 40 }}>
        <div style={{ display: "grid", gap: 48, gridTemplateColumns: "minmax(0,1.05fr) minmax(0,0.95fr)", alignItems: "center" }} className="hero-grid">
          <div>
            <p className="eyebrow rise d1">Security for Elysium · Kinetiq&apos;s L2 on Hyperliquid</p>
            <h1 className="rise d2" style={{ marginTop: 20, maxWidth: "15ch" }}>
              Everything on-chain is <span className="grad-text">exposed</span>. See where.
            </h1>
            <p className="rise d3 muted" style={{ marginTop: 22, fontSize: "1.18rem", maxWidth: "46ch" }}>
              Paste a contract or wallet. Get one report on breach risk, quantum readiness and privacy — every confirmed
              finding proven on a private fork, never the live chain.
            </p>
            <div className="rise d4" style={{ marginTop: 30, position: "relative" }}>
              <div className="scan-rings">
                <span />
                <span />
                <span />
              </div>
              <ScanForm networks={networks} autofocus />
              <p className="faint" style={{ marginTop: 12, fontSize: "0.86rem" }}>
                Read-only · no wallet needed to scan a contract · free
              </p>
            </div>
          </div>
          <div className="rise d3 hero-visual">
            <HeroReport />
          </div>
        </div>

        {/* marquee of checks */}
        <div className="rise d5" style={{ marginTop: 44 }}>
          <div className="marquee">
            <div className="marquee-track">
              {[...CHECKS, ...CHECKS].map((c, i) => (
                <span key={i} className="tag" style={{ fontSize: "0.82rem", padding: "7px 14px" }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* MEASURED STATS — real numbers from the benchmark, or an honest empty state */}
      {bench && (
        <section className="container" style={{ marginTop: 40 }}>
          <Reveal className="card" style={{ padding: "34px 28px", background: "var(--grad-soft)" }}>
            <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", alignItems: "end" }}>
              <Stat big value={bench.detectedTotal} suffix={`/${bench.expectedTotal}`} label="vulnerability classes detected" />
              <Stat big value={bench.confirmedTotal} label="reproduced on a private fork" accent />
              <Stat big value={bench.falsePositives.length} label="false positives on clean contracts" />
              <div>
                <div className="faint" style={{ fontSize: "0.82rem", lineHeight: 1.5 }}>
                  Measured on our own vulnerable + clean test suite.
                </div>
                <Link href="/docs" style={{ color: "var(--accent-hot)", fontSize: "0.86rem", fontWeight: 600 }}>
                  See the method →
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      )}

      {/* THREE REPORTS */}
      <section className="container" style={{ marginTop: 96 }}>
        <Reveal>
          <p className="eyebrow">One scan</p>
          <h2 style={{ marginTop: 14, maxWidth: "16ch" }}>Three reports that actually mean something</h2>
        </Reveal>
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", marginTop: 36 }}>
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.08}>
              <Link href={p.href} className="card card-feature" style={{ display: "block", padding: 26, height: "100%" }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: "var(--grad-soft)", display: "grid", placeItems: "center", color: "var(--accent-hot)", marginBottom: 18, border: "1px solid var(--border)" }}>
                  {p.icon}
                </div>
                <h3>{p.title}</h3>
                <p className="muted" style={{ fontSize: "0.96rem", marginTop: 10 }}>
                  {p.body}
                </p>
                <p style={{ marginTop: 18, color: "var(--accent-hot)", fontSize: "0.92rem", fontWeight: 600 }}>{p.cta}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* EVIDENCE LEVELS */}
      <section className="container" style={{ marginTop: 100 }}>
        <div style={{ display: "grid", gap: 44, gridTemplateColumns: "minmax(0,1fr) minmax(0,1.1fr)", alignItems: "center" }} className="hero-grid">
          <Reveal>
            <p className="eyebrow">No bluffing</p>
            <h2 style={{ marginTop: 14 }}>
              We never call an AI guess a <span className="grad-text">confirmed bug</span>.
            </h2>
            <p className="muted" style={{ marginTop: 18, fontSize: "1.05rem" }}>
              Every finding carries one of three evidence levels — enforced in code. Only a test that reproduces the issue
              on a private fork earns &ldquo;Confirmed&rdquo;.
            </p>
          </Reveal>
          <Reveal delay={0.1} className="stack" style={{ ["--gap" as string]: "12px" }}>
            {EVIDENCE.map((e) => (
              <div key={e.ev} className="card card-hover" style={{ padding: 18, display: "flex", gap: 16, alignItems: "center" }}>
                <span className="tag" data-ev={e.ev} style={{ fontSize: "0.72rem" }}>
                  {e.label}
                </span>
                <span className="muted" style={{ fontSize: "0.95rem" }}>
                  {e.desc}
                </span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* SAFETY STRIP */}
      <section className="container" style={{ marginTop: 100 }}>
        <Reveal className="card" style={{ padding: "36px 30px", textAlign: "center", background: "var(--surface)" }}>
          <p className="eyebrow" style={{ justifyContent: "center" }}>Safe by construction</p>
          <h2 style={{ marginTop: 14, marginInline: "auto", maxWidth: "20ch" }}>Tested on a private fork. Never a live transaction.</h2>
          <p className="muted" style={{ marginTop: 16, marginInline: "auto", maxWidth: "58ch" }}>
            A guard sits in front of every RPC call and every test run. State changes happen only on a private local fork
            WHITEHAT spins up — mainnet and testnet are read-only. Exploit details are withheld and disclosed responsibly.
          </p>
          <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            {GUARANTEES.map((g) => (
              <span key={g} className="tag" style={{ fontSize: "0.82rem", padding: "8px 14px" }}>
                ✓ {g}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {recent.length > 0 && (
        <section className="container" style={{ marginTop: 96 }}>
          <Reveal>
            <h2 style={{ marginBottom: 20 }}>Recent reports</h2>
          </Reveal>
          <Reveal className="panel">
            {recent.map((r, i) => (
              <Link key={r.id} href={`/report/${r.id}`} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                {r.grade ? <GradeBadge letter={r.grade} size="sm" /> : <div className="grade sm" style={{ color: "var(--text-faint)" }}>·</div>}
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: "0.92rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.target}
                  </div>
                  <div className="faint" style={{ fontSize: "0.82rem" }}>
                    {r.kind} · {NETWORKS[r.network as keyof typeof NETWORKS]?.label ?? r.network}
                  </div>
                </div>
                <span className="faint" style={{ marginLeft: "auto", fontSize: "0.84rem" }}>
                  View →
                </span>
              </Link>
            ))}
          </Reveal>
        </section>
      )}

      {/* CTA */}
      <section className="container" style={{ marginTop: 100 }}>
        <Reveal className="card" style={{ padding: "48px 30px", textAlign: "center", background: "var(--grad-soft)", border: "1px solid color-mix(in srgb, var(--accent) 24%, transparent)" }}>
          <h2 style={{ marginInline: "auto", maxWidth: "18ch" }}>Scan a contract in seconds.</h2>
          <p className="muted" style={{ marginTop: 14, marginInline: "auto", maxWidth: "46ch" }}>
            Paste any Elysium address. No signup, no wallet, no gas.
          </p>
          <div style={{ marginTop: 26, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/scan" className="btn btn-primary btn-lg">
              Run a report
            </Link>
            <Link href="/docs" className="btn btn-lg">
              How it works
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}

function Stat({ value, label, suffix, big, accent }: { value: number; label: string; suffix?: string; big?: boolean; accent?: boolean }) {
  return (
    <div>
      <div className={`stat-num ${accent ? "grad-text" : ""}`} style={{ fontSize: big ? "clamp(2.4rem, 5vw, 3.4rem)" : "2rem", color: accent ? undefined : "var(--text)" }}>
        <CountUp value={value} />
        {suffix && <span style={{ color: "var(--text-faint)", fontSize: "0.5em" }}>{suffix}</span>}
      </div>
      <div className="faint" style={{ fontSize: "0.86rem", marginTop: 6, maxWidth: "20ch" }}>
        {label}
      </div>
    </div>
  );
}

const CHECKS = ["Access control", "Hidden mint", "Blacklist & sell limits", "Reentrancy", "Oracle manipulation", "Upgrade backdoors", "Uniswap v4 hooks", "Signature replay", "Quantum readiness", "Wallet privacy"];

const GUARANTEES = ["No live transactions", "No published exploits", "Human-gated disclosure", "Never says “safe”"];

const EVIDENCE = [
  { ev: "CONFIRMED_ON_FORK", label: "Confirmed on fork", desc: "A test reproduced it on a private local fork. Demonstrated, not guessed." },
  { ev: "LIKELY", label: "Likely", desc: "Strong static evidence from source or bytecode." },
  { ev: "REVIEW", label: "Review", desc: "An AI lead to verify. Never shown as a confirmed bug." },
];

const PILLARS = [
  {
    title: "Contract breach risk",
    href: "/scan",
    body: "Access control, hidden mint, blacklists, upgrade backdoors, oracle manipulation and malicious v4 hooks — confirmed on a private fork.",
    cta: "Scan a contract →",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Quantum readiness",
    href: "/docs#quantum",
    body: "Whether a wallet's public key is already exposed on-chain, the balance at risk, and a plain migration checklist. Never “quantum-proof”.",
    cta: "How it works →",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2.5" />
        <ellipse cx="12" cy="12" rx="10" ry="4" />
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
      </svg>
    ),
  },
  {
    title: "Wallet privacy",
    href: "/privacy",
    body: "Prove you own a wallet with a free signature, then see what its history reveals — funding links, reuse, approvals — privately.",
    cta: "Check your wallet →",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
    ),
  },
];
