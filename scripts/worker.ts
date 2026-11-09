/**
 * Scan worker. Claims queued jobs and runs them. Can run standalone (`npm run worker`) or be
 * started in-process by the web app (RUN_WORKER_IN_PROCESS=true).
 */
import "./load-env.ts";
import { claim, complete, fail } from "../src/lib/queue";
import { runContractReport, runWalletReport } from "../src/lib/reports";

let running = false;
let stop = false;

export async function tick(): Promise<boolean> {
  const job = claim();
  if (!job) return false;
  try {
    const payload = JSON.parse(job.payload);
    if (job.type === "contract_scan" || job.type === "watcher_scan") {
      await runContractReport(payload.reportId ?? (await ensureReport(payload)));
    } else if (job.type === "wallet_scan") {
      await runWalletReport(payload.reportId);
    }
    complete(job.id);
  } catch (e) {
    fail(job.id, (e as Error).message);
  }
  return true;
}

async function ensureReport(payload: { reportId?: string; network: string; address: string }): Promise<string> {
  if (payload.reportId) return payload.reportId;
  const { createReport } = await import("../src/lib/reports");
  return createReport("contract", payload.network as never, payload.address, "watcher");
}

export async function runLoop(intervalMs = 1500) {
  if (running) return;
  running = true;
  while (!stop) {
    const did = await tick();
    if (!did) await new Promise((r) => setTimeout(r, intervalMs));
  }
  running = false;
}

export function stopLoop() {
  stop = true;
}

// Run standalone when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("WHITEHAT worker started.");
  runLoop().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
