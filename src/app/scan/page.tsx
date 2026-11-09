import { ScanForm } from "@/components/ScanForm";
import { WalletScanForm } from "@/components/WalletScanForm";
import { availableNetworks, NETWORKS } from "@/lib/chain";

export const dynamic = "force-dynamic";

export default function ScanPage() {
  const networks = availableNetworks().map((id) => ({ id, label: NETWORKS[id].label }));
  return (
    <div className="container" style={{ paddingTop: 56, paddingBottom: 40 }}>
      <div className="measure">
        <div className="eyebrow">Scan</div>
        <h1 style={{ marginTop: 10, fontSize: "2.2rem" }}>Run a report</h1>
        <p className="muted" style={{ marginTop: 14 }}>
          A contract report checks breach risk and confirms what it can on a private fork. A wallet report checks quantum
          readiness. Both use read-only data. No wallet connection is needed.
        </p>
      </div>

      {networks.length === 0 && (
        <div className="panel" style={{ padding: 18, marginTop: 24, borderColor: "var(--medium)" }}>
          <p className="muted" style={{ fontSize: "0.92rem" }}>
            No network is configured yet. Set <code className="inline">ELYSIUM_RPC_URL</code> in <code className="inline">.env</code>, or run{" "}
            <code className="inline">npm run demo</code> to analyse WHITEHAT&apos;s own demo contracts on a local chain.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginTop: 32 }}>
        <div className="panel" style={{ padding: 24 }}>
          <h2 style={{ fontSize: "1.2rem" }}>Contract</h2>
          <p className="muted" style={{ fontSize: "0.92rem", margin: "8px 0 18px" }}>
            Paste a contract address.
          </p>
          <ScanForm networks={networks} />
        </div>
        <div className="panel" style={{ padding: 24 }}>
          <h2 style={{ fontSize: "1.2rem" }}>Wallet (quantum)</h2>
          <p className="muted" style={{ fontSize: "0.92rem", margin: "8px 0 18px" }}>
            Paste a wallet address for a quantum-readiness report.
          </p>
          <WalletScanForm networks={networks} />
        </div>
      </div>
    </div>
  );
}
