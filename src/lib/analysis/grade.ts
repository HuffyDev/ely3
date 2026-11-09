import type { Finding, Grade } from "./types";

const SEVERITY_POINTS = { critical: 60, high: 35, medium: 15, low: 5, info: 0 } as const;
const EVIDENCE_WEIGHT = { CONFIRMED_ON_FORK: 1, LIKELY: 0.7, REVIEW: 0.15 } as const;

export function letterFor(score: number): Grade["letter"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

/** A simple, explainable grade. It summarises these checks only; it is never a safety guarantee. */
export function gradeFindings(findings: Finding[], limitedCoverage: boolean): Grade {
  let score = 100;
  for (const f of findings) score -= SEVERITY_POINTS[f.severity] * EVIDENCE_WEIGHT[f.evidence];
  score = Math.max(0, Math.round(score));
  // A critical issue reproduced on a fork caps the grade at F regardless of anything else.
  if (findings.some((f) => f.severity === "critical" && f.evidence === "CONFIRMED_ON_FORK")) score = Math.min(score, 30);
  const letter = letterFor(score);
  const label =
    findings.length === 0
      ? "No issues found by these checks"
      : letter === "A" || letter === "B"
        ? "Minor issues found"
        : letter === "C"
          ? "Notable issues found"
          : "Serious issues found";
  return { letter, score, limitedCoverage, label };
}
