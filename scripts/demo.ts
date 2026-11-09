/**
 * Local demo. Deploys WHITEHAT's own intentionally vulnerable contracts to a PRIVATE local
 * Anvil chain, registers them as our own, and runs real contract reports against them so the
 * site shows genuine example output (never mock data).
 *
 * Nothing here touches a live network. The "local" network is an Anvil instance started by
 * this script and registered with the transaction guard.
 *
 * Run: npm run demo
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

const ROOT = process.cwd();
const CONTRACTS = path.join(ROOT, "contracts");
// Anvil's first default account (well-known test key; local chain only).
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

type Artifact = { abi: unknown[]; bytecode: { object: string } };

function build() {
  console.log("Compiling demo contracts with forge...");
  const r = spawnSync(config.forgePath, ["build", "--root", CONTRACTS], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error("forge build failed");
  }
}

function artifact(name: string, sourceFile = `${name}.sol`): Artifact {
  const p = path.join(CONTRACTS, "out", sourceFile, `${name}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8")) as Artifact;
}

async function main() {
  build();

  // A private local chain (no upstream fork; it IS the demo network).
  const chain = await startFork({ liveChainId: null, chainId: 1337, port: 8545 });
  // Register so viem's guarded transport / reports treat http://127.0.0.1:8545 as a private fork.
  registerFork(8545, 1337, null);
  process.env.LOCAL_DEMO_RPC_URL = chain.url;
  process.env.DEMO_MODE = "true";
  console.log(`Local demo chain up at ${chain.url} (chain 1337).`);

  const account = privateKeyToAccount(DEPLOYER_PK);
  const wallet = createWalletClient({ account, transport: http(chain.url) }).extend(publicActions);

  async function deploy(name: string, args: unknown[], sourceRel: string): Promise<string> {
    const art = artifact(name);
    const hash = await wallet.deployContract({ abi: art.abi as never, bytecode: ("0x" + art.bytecode.object.replace(/^0x/, "")) as Hex, args: args as never, chain: null });
    const receipt = await wallet.waitForTransactionReceipt({ hash });
    const address = receipt.contractAddress!.toLowerCase();
    getDb().prepare("INSERT OR REPLACE INTO own_contracts(address, network, name, source_path) VALUES (?,?,?,?)").run(address, "local", name, sourceRel);
    console.log(`  ${name} -> ${address}`);
    return address;
  }

  console.log("Deploying demo contracts...");
  const supply = 1_000_000n * 10n ** 18n;
  const demos: { name: string; address: string }[] = [];
  demos.push({ name: "RugToken", address: await deploy("RugToken", [supply], "contracts/src/demo/RugToken.sol") });
  demos.push({ name: "ReentrantVault", address: await deploy("ReentrantVault", [], "contracts/src/demo/ReentrantVault.sol") });
  demos.push({ name: "OpenInitImpl", address: await deployProxy(wallet) });
  demos.push({ name: "FeeHook", address: await deploy("FeeHook", ["0x0000000000000000000000000000000000009999"], "contracts/src/demo/FeeHook.sol") });
  demos.push({ name: "PlainToken", address: await deploy("PlainToken", [supply], "contracts/src/demo/PlainToken.sol") });

  async function deployProxy(w: typeof wallet): Promise<string> {
    const impl = artifact("OpenInitImpl", "OpenInitProxy.sol");
    const ih = await w.deployContract({ abi: impl.abi as never, bytecode: ("0x" + impl.bytecode.object.replace(/^0x/, "")) as Hex, args: [], chain: null });
    const ir = await w.waitForTransactionReceipt({ hash: ih });
    const implAddr = ir.contractAddress!;
    const proxy = artifact("DemoProxy", "OpenInitProxy.sol");
    const ph = await w.deployContract({ abi: proxy.abi as never, bytecode: ("0x" + proxy.bytecode.object.replace(/^0x/, "")) as Hex, args: [implAddr, account.address], chain: null });
    const pr = await w.waitForTransactionReceipt({ hash: ph });
    const proxyAddr = pr.contractAddress!.toLowerCase();
    // initialize + fund through the proxy
    await w.sendTransaction({ to: proxyAddr as Hex, data: ("0xc4d66de8" + account.address.slice(2).padStart(64, "0")) as Hex, chain: null });
    await w.sendTransaction({ to: proxyAddr as Hex, value: 2n * 10n ** 18n, data: "0xb60d4288" as Hex, chain: null });
    getDb().prepare("INSERT OR REPLACE INTO own_contracts(address, network, name, source_path) VALUES (?,?,?,?)").run(proxyAddr, "local", "OpenInitImpl", "contracts/src/demo/OpenInitProxy.sol");
    console.log(`  OpenInitProxy -> ${proxyAddr}`);
    return proxyAddr;
  }

  console.log("\nRunning WHITEHAT contract reports on the demo contracts...\n");
  const results: { name: string; id: string; grade?: string; findings?: number }[] = [];
  for (const d of demos) {
    const id = createReport("contract", "local", d.address, "demo");
    try {
      await runContractReport(id);
      const row = getReport(id)!;
      const body = row.json ? JSON.parse(row.json) : {};
      results.push({ name: d.name, id, grade: body.grade?.letter, findings: body.findings?.length });
      console.log(`  ${d.name}: grade ${body.grade?.letter ?? "?"}, ${body.findings?.length ?? 0} findings (report ${id})`);
    } catch (e) {
      console.log(`  ${d.name}: FAILED - ${(e as Error).message}`);
    }
  }

  // Save a manifest so the UI can link to canonical demo reports.
  const manifest = { generatedAt: new Date().toISOString(), network: "local", chainId: 1337, contracts: demos, reports: results };
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(path.join(config.dataDir, "demo-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${path.join(config.dataDir, "demo-manifest.json")}.`);

  await chain.stop();
  console.log("Demo chain stopped. Reports are persisted in the database.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
