import type { Hex } from "viem";
import { getClient, type NetworkId } from "../chain";
import { getDb, now } from "../db";
import { enqueue } from "../queue";
import { config } from "../config";
import { rateLimit } from "../budget";

/**
 * Deployment watcher. Scans new blocks for contract creations, estimates value-at-risk, and
 * queues them for analysis by priority. It only READS the chain. It publishes nothing itself;
 * aggregate counts are exposed, and full results only after disclosure completes.
 */

type DeploymentRow = { address: string; network: string; block: number; tx_hash?: string; deployer?: string; value_at_risk_wei: string };

export async function watchOnce(network: NetworkId): Promise<{ scannedTo: number; found: number; queued: number }> {
  const { client, chainId } = await getClient(network);
  const db = getDb();
  const head = Number(await client.getBlockNumber());

  let state = db.prepare("SELECT last_block FROM watcher_state WHERE network = ?").get(network) as { last_block: number } | undefined;
  if (!state) {
    const start = Math.max(0, head - 1);
    db.prepare("INSERT INTO watcher_state(network, chain_id, last_block, started_at, updated_at) VALUES (?,?,?,?,?)").run(network, chainId, start, now(), now());
    state = { last_block: start };
  }

  const from = state.last_block + 1;
  const to = Math.min(head, from + 50); // bounded batch
  if (from > head) return { scannedTo: head, found: 0, queued: 0 };

  let found = 0;
  let queued = 0;
  for (let b = from; b <= to; b++) {
    const block = await client.getBlock({ blockNumber: BigInt(b), includeTransactions: true });
    for (const tx of block.transactions) {
      if (typeof tx === "string") continue;
      if (tx.to !== null) continue; // contract creation only
      const receipt = await client.getTransactionReceipt({ hash: tx.hash });
      const address = receipt.contractAddress?.toLowerCase();
      if (!address) continue;
      const code = await client.getCode({ address: address as Hex });
      if (!code || code === "0x") continue;
      found++;

      // Value at risk: contract balance now + value sent in the creation tx (a cheap proxy).
      const bal = await client.getBalance({ address: address as Hex });
      const valueAtRisk = bal + (tx.value ?? 0n);

      db.prepare(
        `INSERT OR IGNORE INTO deployments(address, network, block, tx_hash, deployer, value_at_risk_wei, discovered_at)
         VALUES (?,?,?,?,?,?,?)`,
      ).run(address, network, b, tx.hash, tx.from.toLowerCase(), valueAtRisk.toString(), now());

      if (rateLimit(`watcher:${network}`, config.watcherMaxAnalysesPerHour, 60 * 60 * 1000)) {
        // Priority = value at risk (in ether units) so richer contracts are analysed first.
        const priority = Number(valueAtRisk / 10n ** 14n) / 10_000;
        enqueue("watcher_scan", { network, address }, priority);
        queued++;
      }
    }
  }

  db.prepare("UPDATE watcher_state SET last_block = ?, updated_at = ? WHERE network = ?").run(to, now(), network);
  return { scannedTo: to, found, queued };
}

export function watcherStats(): { totalDeployments: number; analysed: number; queued: number; byNetwork: { network: string; count: number }[] } {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) AS c FROM deployments").get() as { c: number }).c;
  const analysed = (db.prepare("SELECT COUNT(*) AS c FROM deployments WHERE report_id IS NOT NULL").get() as { c: number }).c;
  const queued = (db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE type='watcher_scan' AND status IN ('queued','running')").get() as { c: number }).c;
  const byNetwork = db.prepare("SELECT network, COUNT(*) AS count FROM deployments GROUP BY network").all() as { network: string; count: number }[];
  return { totalDeployments: total, analysed, queued, byNetwork };
}

export function linkDeploymentReport(address: string, network: string, reportId: string) {
  getDb().prepare("UPDATE deployments SET report_id = ? WHERE lower(address)=lower(?) AND network = ?").run(reportId, address, network);
}
