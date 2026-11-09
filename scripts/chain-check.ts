/**
 * Confirms chain access and tools. Run: npm run chain:check
 * Reads the chain ID from each configured RPC with eth_chainId (never hardcoded), verifies the
 * testnet matches 99801, and checks that anvil / forge / slither are reachable.
 */
import "./load-env.ts";
import { spawnSync } from "node:child_process";
import { config } from "../src/lib/config";
import { readChainId, NETWORKS } from "../src/lib/chain";

function tool(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 15000 });
  if (r.error || r.status !== 0) return { ok: false, out: (r.stderr || r.error?.message || "not found").split("\n")[0] };
  return { ok: true, out: (r.stdout || r.stderr).split("\n")[0] };
}

async function rpc(label: string, url: string, expected?: number) {
  if (!url) return console.log(`  ${label}: not configured`);
  try {
    const id = await readChainId(url);
    const ok = expected ? id === expected : true;
    console.log(`  ${label}: chain ${id} ${expected ? (ok ? `OK (expected ${expected})` : `MISMATCH expected ${expected}`) : ""}`);
  } catch (e) {
    console.log(`  ${label}: unreachable (${(e as Error).message.slice(0, 80)})`);
  }
}

async function main() {
  console.log("WHITEHAT environment check\n");
  console.log("Tools:");
  for (const [name, c] of [["anvil", config.anvilPath], ["forge", config.forgePath], ["slither", config.slitherPath], ["solc", config.solcPath]] as const) {
    const r = tool(c, ["--version"]);
    console.log(`  ${name}: ${r.ok ? r.out : "MISSING - " + r.out}`);
  }
  console.log("\nNetworks (chain IDs read live via eth_chainId):");
  await rpc(NETWORKS["elysium"].label, config.elysiumRpcUrl);
  await rpc(NETWORKS["elysium-testnet"].label, config.elysiumTestnetRpcUrl, NETWORKS["elysium-testnet"].expectedChainId);
  console.log("\nAI:");
  console.log(`  Claude API key: ${config.aiConfigured ? "set" : "NOT set (AI review will be skipped)"}`);
  console.log(`  Model: ${config.aiModel}  Daily budget: $${config.aiDailyBudgetUsd}`);
  console.log(`\nExplorer API: ${config.explorerApiUrl || "not configured"}`);
  console.log(`Demo mode: ${config.demoMode}`);
}
main();
