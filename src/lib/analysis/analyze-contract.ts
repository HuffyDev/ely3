import type { Hex } from "viem";
import { getClient, NETWORKS, type NetworkId } from "../chain";
import { analyseBytecode, detectProxy } from "./bytecode";
import { loadSource, flattenSource, ownContract } from "./source";
import { runStaticSource } from "./static-source";
import { runSlither, slitherConfigured } from "./slither";
import { runAiReview } from "./ai-review";
import { startFork } from "./fork";
import { runProbes } from "./probes";
import { mergeFindings, toPublicFindings } from "./evidence";
import { gradeFindings } from "./grade";
import { contractQuantumSection } from "../quantum/index";
import { SIGS, selectorOf, presentSigs } from "./signatures";
import { storeProofs } from "../disclosure/proofs";
import type { ContractReport, Finding, CoverageItem } from "./types";

export type AnalyzeOptions = { network: NetworkId; address: string; reportId: string; source?: "user" | "watcher" | "demo" };

/**
 * Full contract analysis. Order: fetch code/source → static (bytecode, source patterns, Slither)
 * → private fork probes (the only way to CONFIRM) → AI review (REVIEW only) → quantum → grade.
 *
 * Every network call is read-only and goes through the guard. The only state-changing calls
 * happen on a private local fork started here.
 */
export async function analyzeContract(opts: AnalyzeOptions): Promise<ContractReport> {
  const address = opts.address.toLowerCase();
  const { client, chainId, url } = await getClient(opts.network);
  const isOwn = !!ownContract(address, opts.network);

  const code = (await client.getCode({ address: address as Hex })) ?? "0x";
  if (code === "0x" || code.length <= 2) {
    throw new Error("No contract code at this address. It may be a wallet (externally-owned account) or an undeployed address.");
  }

  const facts = analyseBytecode(code as Hex);
  const proxy = await detectProxy(client, address as Hex, facts);

  // Merge implementation selectors so proxied logic is analysed too.
  const selectors = new Set(facts.selectors);
  let implSelectors = new Set<string>();
  if (proxy.implementation) {
    const implCode = (await client.getCode({ address: proxy.implementation as Hex })) ?? "0x";
    implSelectors = analyseBytecode(implCode as Hex).selectors;
    for (const s of implSelectors) selectors.add(s);
  }

  const coverage: CoverageItem[] = [];
  const reportFacts: ContractReport["facts"] = [
    { label: "Network", value: NETWORKS[opts.network].label },
    { label: "Chain ID", value: String(chainId) },
    { label: "Address", value: address, mono: true },
    { label: "Code size", value: `${facts.size.toLocaleString()} bytes` },
  ];
  if (proxy.kind) reportFacts.push({ label: "Proxy", value: proxy.kind === "eip1967" ? "EIP-1967" : proxy.kind, mono: false });

  // ---- Source ----
  const { source, origin } = await loadSource(address, opts.network);
  const sourceText = source ? flattenSource(source) : undefined;
  reportFacts.push({ label: "Source", value: origin === "own" ? "Our demo contract" : origin === "explorer" ? "Verified on explorer" : "Not verified (bytecode only)" });
  coverage.push({ check: "Verified source", status: source ? "ran" : "partial", note: source ? undefined : "No verified source; analysis used bytecode and fork behaviour." });

  let staticFindings: Finding[] = [];
  if (source) {
    staticFindings.push(...runStaticSource(source).findings);
    const slither = slitherConfigured() ? await runSlither(source) : { findings: [], coverage: { check: "Static analysis (Slither)", status: "skipped" as const, note: "Slither not configured." } };
    staticFindings.push(...slither.findings);
    coverage.push(slither.coverage);
    coverage.push({ check: "Source pattern checks", status: "ran" });
  } else {
    coverage.push({ check: "Static analysis (Slither)", status: "skipped", note: "Needs verified source." });
  }

  // ---- Bytecode-derived structural findings ----
  if (facts.opcodes.selfdestruct && selectors.size > 3) {
    staticFindings.push(
      (await import("./evidence")).makeFinding({
        key: "bytecode:selfdestruct",
        title: "Bytecode contains a self-destruct",
        plain: "The contract's code includes an instruction that can destroy it. Confirm who, if anyone, can reach it.",
        severity: "low",
        category: "access-control",
        exposure: "informational",
        sources: ["bytecode"],
        technical: "SELFDESTRUCT opcode present in the deployed bytecode.",
        recommendation: "If reachable, ensure it is strongly access-controlled; otherwise ignore.",
        evidence: "LIKELY",
      }),
    );
  }

  // ---- Bytecode-structural: spot-oracle reliance (works without source) ----
  // A contract that calls getReserves()/slot0() carries that selector as a PUSH4 in its code.
  // Combined with a borrow/price surface, that signals manipulable spot pricing.
  if (!source) {
    const callsSpot = presentSigs(selectors, SIGS.spotOracle).length > 0;
    const callsFeed = presentSigs(selectors, SIGS.feedOracle).length > 0;
    const lends = presentSigs(selectors, SIGS.borrowLike).length > 0 || presentSigs(selectors, SIGS.priceGetter).length > 0;
    if (callsSpot && lends && !callsFeed) {
      staticFindings.push(
        (await import("./evidence")).makeFinding({
          key: "bytecode:spot-oracle",
          title: "Prices from a spot AMM pool a trade can move",
          plain:
            "The contract reads a pool's live reserves and exposes borrowing or pricing. A large swap can move that price in one transaction, enabling over-borrowing. (Detected from bytecode; verify against source.)",
          severity: "high",
          category: "oracle-manipulation",
          exposure: "exploitable",
          sources: ["bytecode"],
          technical: "The deployed bytecode references a spot price source selector (getReserves / slot0 / getAmountsOut) and exposes a borrow/price function. Spot reserves are manipulable within a single transaction.",
          recommendation: "Price from a TWAP or independent feed and sanity-check against a second source.",
          evidence: "LIKELY",
        }),
      );
    }
  }

  // ---- Fork probes (confirmation) ----
  let forkFindings: Finding[] = [];
  let forkNote: string | undefined;
  try {
    const upstreamUrl = opts.network === "local" ? url : url; // local demo chain is itself an anvil; we still fork it for isolation
    const fork = await startFork({ upstreamUrl, liveChainId: opts.network === "local" ? null : chainId });
    try {
      const res = await runProbes({ fork, target: address, selectors });
      forkFindings = res.findings;
      coverage.push(...res.coverage);
      reportFacts.push(...res.facts);
      // Store encrypted proofs for operator access.
      if (forkFindings.length) storeProofs(opts.reportId, forkFindings);
    } finally {
      await fork.stop();
    }
  } catch (e) {
    forkNote = `Fork probes could not run: ${(e as Error).message.slice(0, 160)}`;
    coverage.push({ check: "Fork reproduction", status: "skipped", note: forkNote });
  }

  // ---- AI review (always REVIEW level) ----
  const ai = await runAiReview({
    reportId: opts.reportId,
    address,
    sourceText,
    bytecodeSummary: sourceText
      ? undefined
      : bytecodeSummary(facts, selectors, proxy),
  });
  coverage.push(ai.coverage);

  // ---- Combine ----
  const allFindings = mergeFindings([...forkFindings, ...staticFindings, ...ai.findings]);
  const limitedCoverage = !source || coverage.some((c) => c.check === "Fork reproduction" && c.status === "skipped");
  const grade = gradeFindings(allFindings, limitedCoverage);

  // ---- Quantum (contract side) ----
  const ownerIsEoa = await detectOwnerType(client, address, selectors);
  const quantum = contractQuantumSection({
    usesEcrecover: facts.usesEcrecover || !!(sourceText && /ecrecover/.test(sourceText)),
    hasPermit: presentSigs(selectors, SIGS.permit).length > 0,
    ownerIsEoa,
    upgradableBySingleKey: allFindings.some((f) => f.key === "upgradeability:single-key"),
  });

  const publicFindings = toPublicFindings(allFindings, isOwn);

  const summary = buildSummary(grade, publicFindings, source != null, isOwn);

  return {
    kind: "contract",
    version: 1,
    network: opts.network,
    chainId,
    address,
    name: source?.name,
    generatedAt: new Date().toISOString(),
    isOwnDemoContract: isOwn,
    summary,
    grade,
    facts: reportFacts,
    findings: publicFindings,
    coverage,
    quantum,
    ai: { used: ai.used, model: ai.model, note: ai.coverage.note, costUsd: ai.costUsd },
    disclaimers: [
      "This report lists only what these automated checks covered. It is not an audit and never a guarantee of safety.",
      "Confirmed findings were reproduced on a private local fork. WHITEHAT never sends transactions to any live network.",
      isOwn ? "This is one of WHITEHAT's own demo contracts, deployed locally to show the tool." : "Exploitable issues, if any, are held back until responsible disclosure is complete.",
    ],
  };
}

async function detectOwnerType(client: Awaited<ReturnType<typeof getClient>>["client"], address: string, selectors: Set<string>): Promise<boolean | null> {
  for (const sig of presentSigs(selectors, SIGS.owner)) {
    try {
      const data = await client.call({ to: address as Hex, data: selectorOf(sig) as Hex });
      const hex = data.data;
      if (!hex || hex.length < 66) continue;
      const owner = ("0x" + hex.slice(26, 66)) as Hex;
      if (owner === "0x0000000000000000000000000000000000000000") continue;
      const code = await client.getCode({ address: owner });
      return !code || code === "0x";
    } catch {
      continue;
    }
  }
  return null;
}

function bytecodeSummary(facts: ReturnType<typeof analyseBytecode>, selectors: Set<string>, proxy: Awaited<ReturnType<typeof detectProxy>>): string {
  const present = (name: keyof typeof SIGS) => {
    const sigs = SIGS[name];
    if (Array.isArray(sigs[0])) return "";
    return presentSigs(selectors, sigs as readonly string[]).join(", ");
  };
  const lines = [
    `Deployed bytecode size: ${facts.size} bytes.`,
    `Proxy: ${proxy.kind ?? "none"}${proxy.implementation ? ` → impl ${proxy.implementation}` : ""}.`,
    `Opcodes: ${Object.entries(facts.opcodes).filter(([, v]) => v).map(([k]) => k).join(", ") || "none notable"}.`,
    facts.usesEcrecover ? "Uses ecrecover (signature verification)." : "",
    `Detected function selectors of interest:`,
    `  owner/admin getters: ${present("owner") || "none"}`,
    `  mint: ${present("mint") || "none"}`,
    `  blacklist/freeze: ${present("blacklist") || "none"}`,
    `  trading switch: ${present("tradingSwitch") || "none"}`,
    `  fee setters: ${present("feeSetter") || "none"}`,
    `  ownership/init: ${present("takeover") || "none"}`,
    `  upgrade: ${present("upgrade") || "none"}`,
    `  arbitrary call: ${present("arbitraryCall") || "none"}`,
    `  v4 hook callbacks: ${present("hook") || "none"}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function buildSummary(grade: ContractReport["grade"], findings: Finding[], hasSource: boolean, isOwn: boolean): string {
  const confirmed = findings.filter((f) => f.evidence === "CONFIRMED_ON_FORK").length;
  const likely = findings.filter((f) => f.evidence === "LIKELY").length;
  const review = findings.filter((f) => f.evidence === "REVIEW").length;
  if (findings.length === 0) {
    return `No issues were found by these checks${hasSource ? "" : " (bytecode only — no verified source)"}. This is not a statement that the contract is safe; it means nothing was flagged by the checks listed below.`;
  }
  const parts: string[] = [];
  if (confirmed) parts.push(`${confirmed} reproduced on a private fork`);
  if (likely) parts.push(`${likely} likely from static analysis`);
  if (review) parts.push(`${review} flagged by AI for review`);
  return `Grade ${grade.letter}. ${findings.length} point${findings.length === 1 ? "" : "s"} to note: ${parts.join(", ")}. Confirmed findings were demonstrated against a private copy of the contract, never the live one.`;
}
