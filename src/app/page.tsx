import Link from "next/link";
import { ScanForm } from "@/components/ScanForm";
import { availableNetworks, NETWORKS } from "@/lib/chain";
import { recentPublicReports } from "@/lib/reports";
import { watcherStats } from "@/lib/watcher/index";
import { GradeBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function Home() {
  const networks = availableNetworks().map((id) => ({ id, label: NETWORKS[id].label }));
  let recent: ReturnType<typeof recentPublicReports> = [];
  let stats = { totalDeployments: 0, analysed: 0, queued: 0, byNetwork: [] as { network: string; count: number }[] };
  try {
    recent = recentPublicReports(6);
    stats = watcherStats();
  } catch {
    /* db not ready */
  }

  return (
    <>
      <section className="container" style={{ paddingTop: "clamp(56px, 11vh, 128px)", paddingBottom: "24px" }}>
        <p className="eyebrow reveal" style={{ marginBottom: 20 }}>
          Security reports for Elysium · Kinetiq&apos;s L2 on Hyperliquid
        </p>
        <h1 className="reveal reveal-2 measure" style={{ maxWidth: "20ch" }}>
          Everything on-chain is exposed. See where.
        </h1>
        <p className="reveal reveal-3 measure muted" style={{ marginTop: 22, fontSize: "1.12rem", maxWidth: "58ch" }}>
          Paste a contract or wallet address. Get one report covering breach risk, quantum readiness and wallet privacy —
          with every confirmed finding proven on a private fork, never on the live chain.
        </p>

        <div className="reveal reveal-4" style={{ marginTop: 34, maxWidth: 720 }}>
          <ScanForm networks={networks} autofocus />
          <p className="faint" style={{ marginTop: 12, fontSize: "0.85rem" }}>
            Read-only. No wallet connection needed to scan a contract. For a private wallet-privacy report you prove
            ownership by signing a free message.
          </p>
        </div>

        <div className="reveal reveal-4" style={{ marginTop: 30, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CHECKS.map((c) => (
            <span key={c} className="tag">
              {c}
            </span>
          ))}
        </div>
      </section>

      <section className="container" style={{ marginTop: 56 }}>
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {PILLARS.map((p) => (
            <Link key={p.title} href={p.href} className="panel" style={{ padding: 22, display: "block" }}>
              <h3 style={{ marginBottom: 8 }}>{p.title}</h3>
              <p className="muted" style={{ fontSize: "0.95rem" }}>
                {p.body}
              </p>
              <p style={{ marginTop: 14, color: "var(--accent)", fontSize: "0.9rem", fontWeight: 500 }}>{p.cta}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="container" style={{ marginTop: 72 }}>
        <div style={{ display: "grid", gap: 36, gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)" }}>
          <div>
            <h2 className="measure">Three evidence levels. No AI guess shown as a confirmed bug.</h2>
            <p className="muted measure" style={{ marginTop: 14 }}>
              Static analysis and an AI reviewer surface leads. The difference WHITEHAT insists on is proof: a finding is
              only <strong style={{ color: "var(--accent)" }}>Confirmed on fork</strong> when a test reproduces it on a
              private local copy of the contract.
            </p>
            <dl className="kv" style={{ marginTop: 22, gridTemplateColumns: "190px 1fr" }}>
              <dt>
                <span className="tag" data-ev="CONFIRMED_ON_FORK">
                  Confirmed on fork
                </span>
              </dt>
              <dd className="muted">A test reproduced it on a private fork.</dd>
              <dt>
                <span className="tag">Likely</span>
              </dt>
              <dd className="muted">Strong static evidence from source or bytecode.</dd>
              <dt>
                <span className="tag">Review</span>
              </dt>
              <dd className="muted">An AI reviewer flagged it. A lead to verify, never a verdict.</dd>
            </dl>
          </div>
          <div className="panel" style={{ padding: 22 }}>
            <div className="eyebrow">Live pipeline</div>
            <p className="muted" style={{ fontSize: "0.9rem", marginTop: 6 }}>
              The watcher queues new Elysium deployments by value at risk. Only aggregate counts are shown until
              disclosure completes.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
              <Stat label="Contracts seen" value={stats.totalDeployments} />
              <Stat label="Analysed" value={stats.analysed} />
              <Stat label="In queue" value={stats.queued} />
              <Stat label="Networks" value={networks.length} />
            </div>
            {stats.totalDeployments === 0 && (
              <p className="faint" style={{ fontSize: "0.82rem", marginTop: 16 }}>
                These counters are real and start at zero. They move only when the watcher is enabled against a live RPC.
                Nothing here is simulated.
              </p>
            )}
          </div>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="container" style={{ marginTop: 64 }}>
          <h2 style={{ marginBottom: 18 }}>Recent reports</h2>
          <div className="panel">
            {recent.map((r, i) => (
              <Link
                key={r.id}
                href={`/report/${r.id}`}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderTop: i ? "1px solid var(--border)" : "none" }}
              >
                {r.grade ? <GradeBadge letter={r.grade} size="sm" /> : <div className="grade sm" style={{ color: "var(--text-faint)" }}>·</div>}
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.target}
                  </div>
                  <div className="faint" style={{ fontSize: "0.8rem" }}>
                    {r.kind} · {NETWORKS[r.network as keyof typeof NETWORKS]?.label ?? r.network}
                  </div>
                </div>
                <span className="faint" style={{ marginLeft: "auto", fontSize: "0.82rem" }}>
                  View →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: "1.6rem", fontWeight: 600, letterSpacing: "-0.03em" }}>
        {value.toLocaleString()}
      </div>
      <div className="faint" style={{ fontSize: "0.8rem" }}>
        {label}
      </div>
    </div>
  );
}

const CHECKS = [
  "Access control",
  "Hidden mint",
  "Blacklist & sell limits",
  "Reentrancy",
  "Oracle manipulation",
  "Upgrade authority",
  "Uniswap v4 hooks",
  "Quantum readiness",
];

const PILLARS = [
  { title: "Contract report", href: "/scan", body: "Breach-risk analysis from source or bytecode, confirmed on a private fork where possible.", cta: "Scan a contract →" },
  { title: "Quantum readiness", href: "/docs#quantum", body: "Whether a key is already exposed on-chain, balance at risk, and a plain migration checklist.", cta: "How it works →" },
  { title: "Wallet privacy", href: "/privacy", body: "Prove you own a wallet with a free signature and see what its history reveals — privately.", cta: "Check your wallet →" },
];
