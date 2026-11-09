/**
 * Deployment watcher loop. Scans new Elysium blocks for contract creations and queues them for
 * analysis by value-at-risk. Read-only. Run: npm run watcher
 * Requires ELYSIUM_RPC_URL and WATCHER_ENABLED=true.
 */
import "./load-env.ts";
import { config } from "../src/lib/config";
import { availableNetworks } from "../src/lib/chain";
import { watchOnce } from "../src/lib/watcher/index";

async function main() {
  if (!config.watcherEnabled) {
    console.log("Watcher is disabled (set WATCHER_ENABLED=true). Exiting.");
    return;
  }
  const networks = availableNetworks().filter((n) => n !== "local");
  if (networks.length === 0) {
    console.log("No live network RPC configured (set ELYSIUM_RPC_URL). Exiting.");
    return;
  }
  console.log(`Watching: ${networks.join(", ")}`);
  for (;;) {
    for (const net of networks) {
      try {
        const r = await watchOnce(net);
        if (r.found) console.log(`[${net}] scanned to block ${r.scannedTo}: ${r.found} new contracts, ${r.queued} queued`);
      } catch (e) {
        console.error(`[${net}] watch error:`, (e as Error).message);
      }
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
