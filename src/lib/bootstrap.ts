import { config } from "./config";
import { claim, complete, fail } from "./queue";
import { runContractReport, runWalletReport, createReport } from "./reports";

/**
 * In-process worker. Starts once, if enabled, so the single-process (Replit-style) deployment
 * analyses queued scans without a separate worker command. Set RUN_WORKER_IN_PROCESS=false to
 * run `npm run worker` separately instead.
 */
let started = false;

export function ensureWorker() {
  if (started || !config.runWorkerInProcess) return;
  started = true;
  void loop();
}

async function loop() {
  for (;;) {
    let did = false;
    try {
      did = await tick();
    } catch (e) {
      console.error("worker tick error", (e as Error).message);
    }
    if (!did) await new Promise((r) => setTimeout(r, 1500));
  }
}

async function tick(): Promise<boolean> {
  const job = claim();
  if (!job) return false;
  try {
    const payload = JSON.parse(job.payload) as { reportId?: string; network?: string; address?: string };
    if (job.type === "wallet_scan") {
      await runWalletReport(payload.reportId!);
    } else {
      const reportId = payload.reportId ?? createReport("contract", payload.network as never, payload.address!, "watcher");
      await runContractReport(reportId);
    }
    complete(job.id);
  } catch (e) {
    fail(job.id, (e as Error).message);
  }
  return true;
}
