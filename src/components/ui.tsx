import type { EvidenceLevel, Severity } from "@/lib/analysis/types";

const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  CONFIRMED_ON_FORK: "Confirmed on fork",
  LIKELY: "Likely",
  REVIEW: "Review",
};

export function GradeBadge({ letter, size = "lg" }: { letter: string; size?: "lg" | "sm" }) {
  return (
    <div className={`grade${size === "sm" ? " sm" : ""}`} data-g={letter} aria-label={`Grade ${letter}`}>
      {letter}
    </div>
  );
}

export function SeverityTag({ severity }: { severity: Severity }) {
  return (
    <span className="tag" data-sev={severity}>
      <span className="swatch" aria-hidden />
      {severity[0].toUpperCase() + severity.slice(1)}
    </span>
  );
}

export function EvidenceTag({ level }: { level: EvidenceLevel }) {
  return (
    <span className="tag" data-ev={level} title={evidenceHelp(level)}>
      {EVIDENCE_LABEL[level]}
    </span>
  );
}

function evidenceHelp(level: EvidenceLevel) {
  switch (level) {
    case "CONFIRMED_ON_FORK":
      return "Reproduced by a test on a private local fork.";
    case "LIKELY":
      return "Strong static evidence (source or bytecode analysis). Not reproduced on a fork.";
    case "REVIEW":
      return "An AI reviewer flagged this. It is a lead to verify, not a confirmed issue.";
  }
}

export function Address({ value }: { value: string }) {
  return <span className="mono">{value}</span>;
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <span className="mono">{children}</span>;
}
