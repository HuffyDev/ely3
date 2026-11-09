"use client";
import { useState } from "react";

type EthProvider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
type PrivacyReport = {
  address: string;
  balance: string;
  txCount: number;
  summary: string;
  signals: { title: string; level: "high" | "medium" | "low"; detail: string; advice: string }[];
  fundingLinks: { address: string; direction: "in" | "out"; count: number }[];
  quantum: { grade: { letter: string; label: string }; publicKeyExposed: boolean; explanation: string[] };
};

function provider(): EthProvider | null {
  return (globalThis as { ethereum?: EthProvider }).ethereum ?? null;
}

export function PrivacyFlow({ networks }: { networks: { id: string; label: string }[] }) {
  const [network, setNetwork] = useState(networks[0]?.id ?? "elysium");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<PrivacyReport | null>(null);
  const [manual, setManual] = useState(false);

  async function connectAndSign() {
    setStatus(null);
    const eth = provider();
    if (!eth) {
      setManual(true);
      setStatus("No browser wallet detected. You can still verify manually with a signature below.");
      return;
    }
    setBusy(true);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const addr = accounts[0];
      setAddress(addr);
      await runFlow(addr, (msg) => eth.request({ method: "personal_sign", params: [msg, addr] }) as Promise<string>);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runFlow(addr: string, sign: (msg: string) => Promise<string>) {
    setStatus("Requesting a challenge…");
    const ch = await fetch("/api/privacy/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: addr }) }).then((r) => r.json());
    if (ch.error) throw new Error(ch.error);
    setStatus("Sign the message in your wallet to prove ownership (free, off-chain)…");
    const signature = await sign(ch.message);
    setStatus("Verifying and building your private report…");
    const res = await fetch("/api/privacy/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: addr, network, nonce: ch.nonce, signature }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Verification failed.");
    setReport(data.report);
    setStatus(null);
  }

  return (
    <div className="stack" style={{ ["--gap" as string]: "20px" }}>
      {!report && (
        <div className="panel" style={{ padding: 24 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {networks.length > 1 && (
              <select className="field" style={{ width: "auto" }} value={network} onChange={(e) => setNetwork(e.target.value)} aria-label="Network">
                {networks.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            )}
            <button className="btn btn-primary" onClick={connectAndSign} disabled={busy}>
              {busy ? "Waiting…" : "Connect wallet & sign"}
            </button>
            <button className="btn" onClick={() => setManual((m) => !m)} type="button">
              Verify manually
            </button>
          </div>
          {status && (
            <p className="muted" style={{ marginTop: 14, fontSize: "0.92rem" }}>
              {status}
            </p>
          )}
          {manual && <ManualVerify network={network} onReport={setReport} setStatus={setStatus} />}
          <p className="faint" style={{ fontSize: "0.82rem", marginTop: 16 }}>
            Signing proves you control the wallet. It creates no transaction, costs no gas, and WHITEHAT never asks for
            your private key. Your report is shown only to you and is not stored or indexed unless you choose to save it.
          </p>
        </div>
      )}

      {report && <PrivacyResult report={report} />}
    </div>
  );
}

function ManualVerify({ network, onReport, setStatus }: { network: string; onReport: (r: PrivacyReport) => void; setStatus: (s: string | null) => void }) {
  const [addr, setAddr] = useState("");
  const [message, setMessage] = useState("");
  const [nonce, setNonce] = useState("");
  const [sig, setSig] = useState("");

  async function getChallenge() {
    const ch = await fetch("/api/privacy/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: addr }) }).then((r) => r.json());
    if (ch.error) return setStatus(ch.error);
    setMessage(ch.message);
    setNonce(ch.nonce);
  }
  async function verify() {
    const res = await fetch("/api/privacy/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: addr, network, nonce, signature: sig }) });
    const data = await res.json();
    if (!res.ok) return setStatus(data.error);
    onReport(data.report);
    setStatus(null);
  }

  return (
    <div className="stack" style={{ ["--gap" as string]: "10px", marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
      <input className="field mono" placeholder="Your wallet address 0x…" value={addr} onChange={(e) => setAddr(e.target.value)} spellCheck={false} />
      <button className="btn" onClick={getChallenge} type="button">
        1 · Get challenge message
      </button>
      {message && (
        <>
          <label className="eyebrow">2 · Sign this exact message with your wallet (e.g. Etherscan&apos;s message signer, or your wallet&apos;s sign feature)</label>
          <textarea className="field mono" readOnly value={message} rows={7} style={{ fontSize: "0.8rem" }} />
          <input className="field mono" placeholder="3 · Paste the signature 0x…" value={sig} onChange={(e) => setSig(e.target.value)} spellCheck={false} />
          <button className="btn btn-primary" onClick={verify} type="button">
            Verify & build report
          </button>
        </>
      )}
    </div>
  );
}

function PrivacyResult({ report }: { report: PrivacyReport }) {
  return (
    <div className="stack" style={{ ["--gap" as string]: "24px" }}>
      <div className="panel" style={{ padding: 22 }}>
        <div className="eyebrow">Private report — visible only to you</div>
        <div className="mono" style={{ fontSize: "0.95rem", marginTop: 8, overflowWrap: "anywhere" }}>
          {report.address}
        </div>
        <p className="measure" style={{ marginTop: 14 }}>
          {report.summary}
        </p>
        <div className="faint" style={{ fontSize: "0.84rem", marginTop: 10 }}>
          Balance {report.balance} HYPE · {report.txCount} transactions
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 12 }}>What your history reveals</h2>
        {report.signals.length === 0 ? (
          <div className="panel" style={{ padding: 20 }}>
            <p className="muted">No notable exposure signals from the available history.</p>
          </div>
        ) : (
          <div className="panel" style={{ padding: "4px 20px" }}>
            {report.signals.map((s, i) => (
              <div key={i} style={{ padding: "16px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span className="tag" data-sev={s.level === "high" ? "high" : s.level === "medium" ? "medium" : "low"}>
                    {s.level}
                  </span>
                  <strong style={{ fontSize: "0.98rem" }}>{s.title}</strong>
                </div>
                <p className="muted" style={{ fontSize: "0.9rem", marginTop: 8 }}>
                  {s.detail}
                </p>
                <p style={{ fontSize: "0.9rem", marginTop: 6 }}>
                  <span className="eyebrow">Do this: </span>
                  {s.advice}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 12 }}>Quantum readiness</h2>
        <div className="panel measure" style={{ padding: 20 }}>
          <div className="muted" style={{ fontSize: "0.9rem" }}>
            {report.quantum.grade.label}
          </div>
          {report.quantum.explanation.map((e, i) => (
            <p key={i} className="muted" style={{ fontSize: "0.9rem", marginTop: 8 }}>
              {e}
            </p>
          ))}
        </div>
      </div>

      <p className="faint measure" style={{ fontSize: "0.84rem" }}>
        This report uses only public on-chain data and is private to you. WHITEHAT does not identify who owns an address,
        and does not publish or index anyone&apos;s privacy report.
      </p>
    </div>
  );
}
