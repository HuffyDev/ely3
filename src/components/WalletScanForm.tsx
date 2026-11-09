"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

export function WalletScanForm({ networks }: { networks: { id: string; label: string }[] }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [network, setNetwork] = useState(networks[0]?.id ?? "local");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const target = value.trim();
    if (!ADDR.test(target)) return setError("Enter a valid wallet address.");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/wallet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: target, network }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start.");
      router.push(`/report/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ ["--gap" as string]: "10px" }}>
      <input className="field mono" placeholder="0x…" aria-label="Wallet address" value={value} spellCheck={false} autoComplete="off" onChange={(e) => setValue(e.target.value)} />
      <div style={{ display: "flex", gap: 10 }}>
        {networks.length > 1 && (
          <select className="field" style={{ width: "auto" }} value={network} onChange={(e) => setNetwork(e.target.value)} aria-label="Network">
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Starting…" : "Check readiness"}
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
