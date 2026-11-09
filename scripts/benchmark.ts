/**
 * Detection benchmark. Deploys WHITEHAT's own contracts (vulnerable + known-clean) to a PRIVATE
 * local chain, runs the REAL scanner against each in two modes — with our source, and
 * bytecode-only (as a real unverified address would be) — and measures what is detected, missed,
 * and falsely flagged. Writes docs/benchmark.md and data/benchmark.json.
 *
 * Nothing here touches a live network. Run: npm run benchmark
 */
import "./load-env.ts";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createWalletClient, http, publicActions, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { startFork } from "../src/lib/analysis/fork";
import { registerFork } from "../src/lib/safety/txguard";
import { getDb } from "../src/lib/db";
import { config } from "../src/lib/config";
import { createReport, runContractReport, getReport } from "../src/lib/reports";
import { walletQuantumReadiness, recoverKeyFromTx, addressFromPublicKey } from "../src/lib/quantum/index";
import type { Category, EvidenceLevel } from "../src/lib/analysis/types";

const CONTRACTS = path.join(process.cwd(), "contracts");
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const supply = 1_000_000n * 10n ** 18n;

type Spec = {
  name: string;
  source: string; // artifact source file
  file: string; // repo source path for own-contract registration
  args: unknown[];
  expect: Category[]; // categories a correct scan should surface ([] = clean)
  clean?: boolean;
  note?: string;
};

const SUITE: Spec[] = [
  { name: "ReentrantVault", source: "ReentrantVault.sol", file: "contracts/src/demo/ReentrantVault.sol", args: [], expect: ["reentrancy"], note: "Classic reentrancy (ETH out before state update)." },
  { name: "SafeVault", source: "SafeVault.sol", file: "contracts/src/demo/SafeVault.sol", args: [], expect: [], clean: true, note: "Reentrancy-guarded vault — control." },
  { name: "RugToken", source: "RugToken.sol", file: "contracts/src/demo/RugToken.sol", args: [supply], expect: ["hidden-mint", "blacklist", "sell-restriction", "fees"], note: "Owner mint/freeze/trading-switch/tax." },
  { name: "MintBackdoorToken", source: "MintBackdoorToken.sol", file: "contracts/src/demo/MintBackdoorToken.sol", args: [supply], expect: ["hidden-mint"], note: "Owner can mint; nothing else." },
  { name: "OpenInitProxy", source: "OpenInitProxy.sol", file: "contracts/src/demo/OpenInitProxy.sol", args: [], expect: ["access-control", "upgradeability"], note: "Open initializer + single-key upgrade." },
  { name: "SpotOracleLender", source: "SpotOracleLender.sol", file: "contracts/src/demo/SpotOracleLender.sol", args: [], expect: ["oracle-manipulation"], note: "Prices collateral from spot reserves." },
  { name: "CleanOracleLender", source: "CleanOracleLender.sol", file: "contracts/src/demo/CleanOracleLender.sol", args: [], expect: [], clean: true, note: "Prices from a fixed feed — control." },
  { name: "FeeHook", source: "FeeHook.sol", file: "contracts/src/demo/FeeHook.sol", args: ["0x0000000000000000000000000000000000009999"], expect: ["uniswap-v4-hook", "sell-restriction"], note: "v4 hook: any caller + owner blocks sells." },
  { name: "SignatureGate", source: "SignatureGate.sol", file: "contracts/src/demo/SignatureGate.sol", args: ["0x000000000000000000000000000000000000dEaD"], expect: ["signatures"], note: "ecrecover with no nonce (replay)." },
  { name: "PlainToken", source: "PlainToken.sol", file: "contracts/src/demo/PlainToken.sol", args: [supply], expect: [], clean: true, note: "Fixed supply, no owner — control." },
  { name: "CleanOwnableToken", source: "CleanOwnableToken.sol", file: "contracts/src/demo/CleanOwnableToken.sol", args: [supply], expect: [], clean: true, note: "Owner exists but fee hard-capped at 5%; no mint/freeze — control." },
];

function artifact(name: string, source: string) {
  return JSON.parse(fs.readFileSync(path.join(CONTRACTS, "out", source, `${name}.json`), "utf8")) as { abi: unknown[]; bytecode: { object: string } };
}

type Row = {
  name: string;
  clean: boolean;
  expect: Category[];
  source: { detected: Partial<Record<Category, EvidenceLevel>>; all: { cat: Category; ev: EvidenceLevel; sev: string; title: string }[]; grade: string };
  bytecode: { detected: Partial<Record<Category, EvidenceLevel>>; all: { cat: Category; ev: EvidenceLevel; sev: string; title: string }[]; grade: string };
};

async function scan(address: string, registerAs: Spec | null): Promise<Row["source"]> {
  const db = getDb();
  // Both modes register as "own" so the benchmark measures raw DETECTION (no disclosure
  // withholding). Source mode points at the real source; bytecode mode points at a missing
  // file, so loadSource returns null and the scanner uses the bytecode + fork path only.
  if (registerAs) {
    db.prepare("INSERT OR REPLACE INTO own_contracts(address, network, name, source_path) VALUES (?,?,?,?)").run(address, "local", registerAs.name, registerAs.file);
  } else {
    db.prepare("INSERT OR REPLACE INTO own_contracts(address, network, name, source_path) VALUES (?,?,?,?)").run(address, "local", "bytecode-only", "contracts/does-not-exist-bytecode-only.sol");
  }
  const id = createReport("contract", "local", address, "demo");
  await runContractReport(id);
  const body = JSON.parse(getReport(id)!.json!);
  const detected: Partial<Record<Category, EvidenceLevel>> = {};
  const all: { cat: Category; ev: EvidenceLevel; sev: string; title: string }[] = body.findings.map(
    (f: { category: Category; evidence: EvidenceLevel; severity: string; title: string }) => ({ cat: f.category, ev: f.evidence, sev: f.severity, title: f.title }),
  );
  const rank: Record<EvidenceLevel, number> = { CONFIRMED_ON_FORK: 3, LIKELY: 2, REVIEW: 1 };
  for (const f of all) {
    if (!detected[f.cat] || rank[f.ev] > rank[detected[f.cat]!]) detected[f.cat] = f.ev;
  }
  return { detected, all, grade: body.grade.letter };
}

async function main() {
  spawnSync(config.forgePath, ["build", "--root", CONTRACTS], { encoding: "utf8" });
  const chain = await startFork({ liveChainId: null, chainId: 1337, port: 8547 });
  registerFork(8547, 1337, null);
  process.env.LOCAL_DEMO_RPC_URL = chain.url;
  process.env.DEMO_MODE = "true";
  const account = privateKeyToAccount(DEPLOYER_PK);
  const w = createWalletClient({ account, transport: http(chain.url) }).extend(publicActions);

  async function deploy(name: string, source: string, args: unknown[]) {
    const art = artifact(name, source);
    const hash = await w.deployContract({ abi: art.abi as never, bytecode: ("0x" + art.bytecode.object.replace(/^0x/, "")) as Hex, args: args as never, chain: null });
    const rec = await w.waitForTransactionReceipt({ hash });
    return rec.contractAddress!.toLowerCase();
  }

  // Special wiring: SpotOracleLender needs a pair+tokens; OpenInitProxy needs proxy+init.
  const addresses: Record<string, string> = {};
  for (const s of SUITE) {
    if (s.name === "OpenInitProxy") {
      addresses[s.name] = await deployOpenInit();
    } else if (s.name === "SpotOracleLender") {
      addresses[s.name] = await deploySpotLender();
    } else if (s.name === "CleanOracleLender") {
      const feed = await deploy("FixedFeed", "CleanOracleLender.sol", []);
      addresses[s.name] = await deploy("CleanOracleLender", "CleanOracleLender.sol", [feed]);
    } else {
      addresses[s.name] = await deploy(s.name, s.source, s.args);
    }
    console.log(`deployed ${s.name} -> ${addresses[s.name]}`);
  }

  async function deployOpenInit(): Promise<string> {
    const impl = artifact("OpenInitImpl", "OpenInitProxy.sol");
    const ih = await w.deployContract({ abi: impl.abi as never, bytecode: ("0x" + impl.bytecode.object.replace(/^0x/, "")) as Hex, args: [], chain: null });
    const ir = await w.waitForTransactionReceipt({ hash: ih });
    const proxyArt = artifact("DemoProxy", "OpenInitProxy.sol");
    const ph = await w.deployContract({ abi: proxyArt.abi as never, bytecode: ("0x" + proxyArt.bytecode.object.replace(/^0x/, "")) as Hex, args: [ir.contractAddress!, account.address], chain: null });
    const pr = await w.waitForTransactionReceipt({ hash: ph });
    const proxy = pr.contractAddress!.toLowerCase();
    await w.sendTransaction({ to: proxy as Hex, data: ("0xc4d66de8" + account.address.slice(2).padStart(64, "0")) as Hex, chain: null });
    return proxy;
  }

  async function deploySpotLender(): Promise<string> {
    const t0 = await deploy("PlainToken", "PlainToken.sol", [supply]);
    const t1 = await deploy("PlainToken", "PlainToken.sol", [supply]);
    const pairArt = artifact("DemoPair", "SpotOracleLender.sol");
    const ph = await w.deployContract({ abi: pairArt.abi as never, bytecode: ("0x" + pairArt.bytecode.object.replace(/^0x/, "")) as Hex, args: [t0, t1], chain: null });
    const pair = (await w.waitForTransactionReceipt({ hash: ph })).contractAddress!;
    // seed pool
    await w.writeContract({ address: t0 as Hex, abi: pairArt.abi as never, functionName: "transfer", args: [pair, 1000n * 10n ** 18n], chain: null }).catch(() => {});
    const lenderArt = artifact("SpotOracleLender", "SpotOracleLender.sol");
    const lh = await w.deployContract({ abi: lenderArt.abi as never, bytecode: ("0x" + lenderArt.bytecode.object.replace(/^0x/, "")) as Hex, args: [pair], chain: null });
    return (await w.waitForTransactionReceipt({ hash: lh })).contractAddress!.toLowerCase();
  }

  const rows: Row[] = [];
  for (const s of SUITE) {
    const addr = addresses[s.name];
    const srcScan = await scan(addr, s);
    const byteScan = await scan(addr, null);
    rows.push({ name: s.name, clean: !!s.clean, expect: s.expect, source: srcScan, bytecode: byteScan });
    console.log(`scanned ${s.name}: source=${srcScan.grade} bytecode=${byteScan.grade}`);
  }

  // Quantum demonstration: recover the deployer's public key from a real signed tx.
  let quantumDemo = "";
  try {
    const q = await walletQuantumReadiness("local", account.address);
    const firstTxBlock = await w.getBlock({ blockNumber: 1n, includeTransactions: true });
    const firstTx = firstTxBlock.transactions.find((t) => typeof t !== "string" && t.from.toLowerCase() === account.address.toLowerCase());
    let recovered = "n/a";
    if (firstTx && typeof firstTx !== "string") {
      const key = await recoverKeyFromTx("local", firstTx.hash);
      recovered = key ? `${addressFromPublicKey(key).toLowerCase() === account.address.toLowerCase() ? "matches address" : "MISMATCH"}` : "could not recover";
    }
    quantumDemo = `Deployer ${account.address}: nonce ${q.nonce}, publicKeyExposed=${q.publicKeyExposed}, isContract=${q.isContract}. Key recovery from first tx: ${recovered}.`;
    console.log("quantum:", quantumDemo);
  } catch (e) {
    quantumDemo = `quantum demo error: ${(e as Error).message}`;
  }

  await chain.stop();
  writeReport(rows, quantumDemo);
}

function writeReport(rows: Row[], quantumDemo: string) {
  const CATS: Category[] = ["reentrancy", "hidden-mint", "blacklist", "sell-restriction", "fees", "access-control", "upgradeability", "oracle-manipulation", "uniswap-v4-hook", "signatures", "unsafe-external-call"];
  const evMark = (ev?: EvidenceLevel) => (ev === "CONFIRMED_ON_FORK" ? "**C**" : ev === "LIKELY" ? "L" : ev === "REVIEW" ? "R" : "·");

  // Aggregate stats
  let expectedTotal = 0,
    detectedTotal = 0,
    confirmedTotal = 0;
  const missed: string[] = [];
  const falsePositives: string[] = [];
  for (const r of rows) {
    for (const cat of r.expect) {
      expectedTotal++;
      const ev = r.source.detected[cat] || r.bytecode.detected[cat];
      if (ev) {
        detectedTotal++;
        if (r.source.detected[cat] === "CONFIRMED_ON_FORK" || r.bytecode.detected[cat] === "CONFIRMED_ON_FORK") confirmedTotal++;
      } else missed.push(`${r.name}:${cat}`);
    }
    if (r.clean) {
      const bad = [...r.source.all, ...r.bytecode.all].filter((f) => f.ev === "CONFIRMED_ON_FORK" || f.sev === "critical" || f.sev === "high");
      for (const f of bad) falsePositives.push(`${r.name}: ${f.title} (${f.ev}/${f.sev})`);
    }
  }

  const lines: string[] = [];
  lines.push("# Detection benchmark", "");
  lines.push(`Generated ${new Date().toISOString()} by \`npm run benchmark\`. Measured against WHITEHAT's own contracts on a private local chain. **These are measured results, not claims.**`, "");
  lines.push("Evidence key: **C** = Confirmed on fork · L = Likely (static) · R = Review (AI) · · = not detected.", "");
  lines.push("## Headline", "");
  lines.push(`- Expected vulnerability classes across the suite: **${expectedTotal}**`);
  lines.push(`- Detected (any level, either mode): **${detectedTotal}/${expectedTotal}**`);
  lines.push(`- Of those, reproduced **Confirmed on fork**: **${confirmedTotal}**`);
  lines.push(`- Missed: **${missed.length}** ${missed.length ? "(" + missed.join(", ") + ")" : ""}`);
  lines.push(`- False positives on clean contracts (confirmed or high/critical): **${falsePositives.length}** ${falsePositives.length ? "\n  - " + falsePositives.join("\n  - ") : "(none)"}`);
  lines.push("");
  lines.push("## Per-contract (source mode / bytecode-only mode)", "");
  lines.push("| Contract | Expected | " + CATS.map((c) => c.replace("manipulation", "manip").replace("uniswap-v4-hook", "v4-hook").replace("sell-restriction", "sell").replace("access-control", "access").replace("upgradeability", "upgrade").replace("unsafe-external-call", "ext-call").replace("hidden-mint", "mint")).join(" | ") + " | Grade |");
  lines.push("|" + "---|".repeat(CATS.length + 3));
  for (const r of rows) {
    const cells = CATS.map((c) => {
      const s = evMark(r.source.detected[c]);
      const b = evMark(r.bytecode.detected[c]);
      const expected = r.expect.includes(c);
      const cell = s === b ? s : `${s}/${b}`;
      return expected ? `${cell}◎` : cell === "·" ? "·" : cell;
    });
    lines.push(`| ${r.clean ? "✓ " : ""}${r.name} | ${r.expect.length ? r.expect.join(", ") : "clean"} | ${cells.join(" | ")} | ${r.source.grade}/${r.bytecode.grade} |`);
  }
  lines.push("", "◎ marks a class this contract was built to exhibit (should be detected). ✓ marks a known-clean control (should stay empty).", "");
  lines.push("## All findings per contract", "");
  for (const r of rows) {
    lines.push(`### ${r.name}${r.clean ? " (clean control)" : ""}`);
    const union = new Map<string, { cat: Category; ev: EvidenceLevel; sev: string; title: string; modes: string[] }>();
    for (const [mode, scan] of [["source", r.source] as const, ["bytecode", r.bytecode] as const]) {
      for (const f of scan.all) {
        const k = f.title;
        const e = union.get(k) ?? { ...f, modes: [] };
        e.modes.push(mode);
        union.set(k, e);
      }
    }
    if (union.size === 0) lines.push("- No findings (no issues found by these checks).");
    for (const f of union.values()) lines.push(`- [${f.ev}] ${f.sev} — ${f.title} _(${f.modes.join(", ")})_`);
    lines.push("");
  }
  lines.push("## Quantum readiness demonstration", "");
  lines.push(quantumDemo, "");
  lines.push("## Honest limitations", "");
  lines.push("- **Oracle manipulation** is detected at **Likely** from the spot-price source (getReserves/slot0 in a pricing/borrow path), in both source and bytecode mode. It is **not** reproduced on a fork: a confirming PoC is contract-specific. We do not claim a confirmed oracle exploit.");
  lines.push("- Detection is measured on WHITEHAT's own contracts. Real-world contracts vary; these numbers describe this suite, not a general accuracy rate.");
  lines.push("- Bytecode-only mode has less context than verified source; where the two columns differ, that gap is shown.");
  lines.push("- AI review (Review level) is not exercised here (budget 0 in CI); it only ever adds leads, never confirmations.");

  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/benchmark.md", lines.join("\n"));
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(path.join(config.dataDir, "benchmark.json"), JSON.stringify({ generatedAt: new Date().toISOString(), expectedTotal, detectedTotal, confirmedTotal, missed, falsePositives, rows }, null, 2));
  console.log(`\nDetected ${detectedTotal}/${expectedTotal} (confirmed ${confirmedTotal}), missed ${missed.length}, false positives ${falsePositives.length}.`);
  console.log("Wrote docs/benchmark.md and data/benchmark.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
