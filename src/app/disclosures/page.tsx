import { publicDisclosures } from "@/lib/disclosure/workflow";
import { config } from "@/lib/config";
import { SeverityTag } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disclosures — WHITEHAT" };

export default function DisclosuresPage() {
  let items: ReturnType<typeof publicDisclosures> = [];
  try {
    items = publicDisclosures();
  } catch {
    /* db not ready */
  }
  return (
    <div className="container" style={{ paddingTop: 56, paddingBottom: 40 }}>
      <div className="measure">
        <div className="eyebrow">Disclosures</div>
        <h1 style={{ marginTop: 10, fontSize: "2.2rem" }}>Responsible disclosure</h1>
        <p className="muted" style={{ marginTop: 14 }}>
          When WHITEHAT confirms an exploitable issue in a contract we don&apos;t own, we don&apos;t publish it. A human
          sends the project a private notice, waits {config.disclosureWaitDays} days, and only then publishes a
          plain-language summary — and only after a fix is confirmed or the deadline passes. Working exploit code and
          unfixed details are never published.
        </p>
      </div>

      <div style={{ marginTop: 32 }}>
        {items.length === 0 ? (
          <div className="panel" style={{ padding: 24 }}>
            <p className="muted">No disclosures have been published yet.</p>
            <p className="faint" style={{ fontSize: "0.85rem", marginTop: 8 }}>
              This list is real and starts empty. Items appear here only after a fix or an expired timeline, as summaries.
            </p>
          </div>
        ) : (
          <div className="panel">
            {items.map((d, i) => (
              <div key={i} style={{ padding: 22, borderTop: i ? "1px solid var(--border)" : "none" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <SeverityTag severity={d.severity} />
                  <span className="tag">{d.status}</span>
                  <span className="mono faint" style={{ fontSize: "0.82rem" }}>
                    {d.target}
                  </span>
                  <span className="faint" style={{ fontSize: "0.82rem", marginLeft: "auto" }}>
                    {new Date(d.publishedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="measure" style={{ marginTop: 12 }}>
                  {d.summary}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel measure" style={{ padding: 22, marginTop: 28 }}>
        <h3>Run a project on Elysium?</h3>
        <p className="muted" style={{ fontSize: "0.92rem", marginTop: 8 }}>
          If we have something for you, you&apos;ll get a private notice first. To reach us ahead of that, add a
          <code className="inline"> security.txt</code> to your site or publish a security contact. We share full details
          only through a private channel, never in public.
        </p>
      </div>
    </div>
  );
}
