import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../config";
import { sanitizedChildEnv } from "../safety/txguard";
import { makeFinding } from "./evidence";
import type { Finding, Category, Severity, CoverageItem } from "./types";
import type { VerifiedSource } from "../explorer";

/** Slither impact → our severity. */
const IMPACT_SEVERITY: Record<string, Severity> = { High: "high", Medium: "medium", Low: "low", Informational: "info", Optimization: "info" };

/** Map a selection of Slither detectors to our categories. Unmapped detectors are still reported. */
const DETECTOR_CATEGORY: Record<string, Category> = {
  "reentrancy-eth": "reentrancy",
  "reentrancy-no-eth": "reentrancy",
  "reentrancy-benign": "reentrancy",
  "reentrancy-events": "reentrancy",
  "arbitrary-send-eth": "unsafe-external-call",
  "arbitrary-send-erc20": "unsafe-external-call",
  "controlled-delegatecall": "upgradeability",
  "unprotected-upgrade": "upgradeability",
  "suicidal": "access-control",
  "unchecked-transfer": "unsafe-external-call",
  "incorrect-equality": "other",
  "tx-origin": "access-control",
  "weak-prng": "other",
  "uninitialized-state": "other",
};

const INTERESTING = new Set(Object.keys(DETECTOR_CATEGORY));

export function slitherConfigured(): boolean {
  return !!config.slitherPath;
}

type SlitherResult = { ran: boolean; findings: Finding[]; coverage: CoverageItem; raw?: string };

/**
 * Runs Slither on verified source in a throwaway temp directory. Read-only: Slither never
 * touches the network. Returns LIKELY findings (static evidence) only.
 */
export async function runSlither(source: VerifiedSource): Promise<SlitherResult> {
  const cov: CoverageItem = { check: "Static analysis (Slither)", status: "skipped" };
  if (!slitherConfigured()) return { ran: false, findings: [], coverage: { ...cov, note: "Slither not configured." } };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wh-slither-"));
  try {
    for (const f of source.files) {
      const dest = path.join(dir, f.path.replace(/\.\.(\/|\\)/g, ""));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.content);
    }
    const entry = source.files.find((f) => /pragma solidity/.test(f.content))?.path ?? source.files[0]?.path;
    if (!entry) return { ran: false, findings: [], coverage: { ...cov, note: "No Solidity entry file." } };

    const outPath = path.join(dir, "slither.json");
    const args = [".", "--json", outPath, "--solc", config.solcPath, "--disable-color"];
    const code = await new Promise<number>((resolve) => {
      const child = spawn(config.slitherPath, args, { cwd: dir, env: sanitizedChildEnv({ SOLC: config.solcPath }), stdio: "ignore", timeout: 180_000 });
      child.once("error", () => resolve(-1));
      child.once("exit", (c) => resolve(c ?? -1));
    });
    if (code === -1 || !fs.existsSync(outPath)) {
      return { ran: false, findings: [], coverage: { ...cov, status: "skipped", note: "Slither did not produce output (compilation may have failed)." } };
    }
    const parsed = JSON.parse(fs.readFileSync(outPath, "utf8")) as { results?: { detectors?: SlitherDetector[] } };
    const detectors = parsed.results?.detectors ?? [];
    const findings: Finding[] = [];
    const seen = new Set<string>();
    for (const d of detectors) {
      if (d.impact === "Informational" || d.impact === "Optimization") continue;
      if (INTERESTING.size && !INTERESTING.has(d.check) && d.impact === "Low") continue;
      const loc = d.elements?.[0]?.source_mapping?.filename_short
        ? `${d.elements[0].source_mapping.filename_short}${d.elements[0].source_mapping.lines?.[0] ? ":" + d.elements[0].source_mapping.lines[0] : ""}`
        : undefined;
      const key = `slither:${d.check}:${loc ?? d.elements?.[0]?.name ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(
        makeFinding({
          key,
          title: slitherTitle(d.check),
          plain: firstSentence(d.description) || `Slither flagged "${d.check}".`,
          severity: IMPACT_SEVERITY[d.impact] ?? "low",
          category: DETECTOR_CATEGORY[d.check] ?? "other",
          exposure: d.impact === "High" ? "exploitable" : "informational",
          sources: ["slither"],
          technical: d.description.trim().slice(0, 1200),
          location: loc,
          recommendation: "Static analysis cannot confirm exploitability. WHITEHAT attempts a fork proof where possible; otherwise treat this as a lead to review.",
          evidence: "LIKELY",
        }),
      );
    }
    return { ran: true, findings, coverage: { check: "Static analysis (Slither)", status: "ran", note: `${detectors.length} detector hits; ${findings.length} kept.` } };
  } catch (e) {
    return { ran: false, findings: [], coverage: { ...cov, note: `Slither error: ${(e as Error).message.slice(0, 160)}` } };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

type SlitherDetector = {
  check: string;
  impact: string;
  confidence: string;
  description: string;
  elements?: { name?: string; source_mapping?: { filename_short?: string; lines?: number[] } }[];
};

function slitherTitle(check: string): string {
  const map: Record<string, string> = {
    "reentrancy-eth": "Reentrancy that can move ETH",
    "reentrancy-no-eth": "Reentrancy in state updates",
    "arbitrary-send-eth": "Contract can send ETH to an arbitrary address",
    "controlled-delegatecall": "Delegatecall to a controllable address",
    "unprotected-upgrade": "Upgrade function is unprotected",
    suicidal: "Anyone can destroy the contract",
    "unchecked-transfer": "Token transfer return value is ignored",
    "tx-origin": "Authorisation uses tx.origin",
  };
  return map[check] ?? `Static finding: ${check}`;
}
function firstSentence(s: string) {
  const t = s.trim().replace(/\s+/g, " ");
  const m = t.match(/^.*?[.!]\s/);
  return (m ? m[0] : t).slice(0, 200).trim();
}
