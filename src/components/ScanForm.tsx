"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

export function ScanForm({ networks, autofocus }: { networks: { id: string; label: string }[]; autofocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [network, setNetwork] = useState(networks[0]?.id ?? "local");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const target = value.trim();
    if (!ADDR.test(target)) {
      setError("Enter a valid address (0x followed by 40 hex characters).");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: target, network }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start the scan.");
      router.push(`/report/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ ["--gap" as string]: "12px" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          className="field mono"
          style={{ flex: "1 1 300px" }}
          placeholder="Paste an address — 0x…"
          aria-label="Contract or wallet address"
          value={value}
          autoFocus={autofocus}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
        />
        {networks.length > 1 && (
          <select className="field" style={{ flex: "0 0 auto", width: "auto" }} value={network} onChange={(e) => setNetwork(e.target.value)} aria-label="Network">
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary btn-lg" disabled={busy} style={{ flex: "0 0 auto" }}>
          {busy ? (
            <>
              <Spinner /> Scanning…
            </>
          ) : (
            <>Run report →</>
          )}
        </button>
      </div>
      {error && (
        <p style={{ color: "var(--critical)", fontSize: "0.9rem" }} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Spinner() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }} aria-hidden>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
