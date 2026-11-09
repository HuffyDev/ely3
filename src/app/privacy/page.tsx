import { PrivacyFlow } from "@/components/PrivacyFlow";
import { availableNetworks, NETWORKS } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wallet privacy — WHITEHAT" };

export default function PrivacyPage() {
  const networks = availableNetworks()
    .filter((id) => id !== "local")
    .map((id) => ({ id, label: NETWORKS[id].label }));
  const usable = networks.length ? networks : [{ id: "elysium", label: "Elysium" }];
  return (
    <div className="container" style={{ paddingTop: 56, paddingBottom: 40 }}>
      <div className="measure">
        <div className="eyebrow">Wallet privacy</div>
        <h1 style={{ marginTop: 10, fontSize: "2.2rem" }}>See what your wallet reveals — privately</h1>
        <p className="muted" style={{ marginTop: 14 }}>
          Everything here is already public on-chain. This report just makes it legible: funding links, address reuse,
          exchange deposit patterns, open approvals, and traceable habits — with concrete steps to reduce each one.
        </p>
        <p className="muted" style={{ marginTop: 10 }}>
          To keep it yours, a privacy report is only generated for a wallet whose owner proves control by signing a free,
          off-chain message. No one else can look up your report.
        </p>
      </div>
      <div style={{ marginTop: 28, maxWidth: 720 }}>
        <PrivacyFlow networks={usable} />
      </div>
    </div>
  );
}
