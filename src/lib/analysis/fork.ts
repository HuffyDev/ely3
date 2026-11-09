import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { config } from "../config";
import { guardedRequest, registerFork, unregisterFork, sanitizedChildEnv } from "../safety/txguard";

/** Chain ID used for every private fork. Differs from any live chain we analyse. */
export const FORK_CHAIN_ID = 31337;

export type Fork = {
  url: string;
  port: number;
  chainId: number;
  liveChainId: number | null;
  forkBlock: number;
  stop: () => Promise<void>;
};

async function freePort(start: number): Promise<number> {
  for (let p = start; p < start + 200; p++) {
    const ok = await new Promise<boolean>((resolve) => {
      const s = net.createServer();
      s.once("error", () => resolve(false));
      s.listen(p, "127.0.0.1", () => s.close(() => resolve(true)));
    });
    if (ok) return p;
  }
  throw new Error("No free port for a private fork");
}

let portCursor = 0;

/**
 * Starts a private Anvil fork bound to 127.0.0.1. Anvil only reads from the upstream RPC;
 * transactions sent to the fork are mined locally and never forwarded.
 */
export async function startFork(opts: { upstreamUrl?: string; liveChainId: number | null; chainId?: number; port?: number }): Promise<Fork> {
  const chainId = opts.chainId ?? FORK_CHAIN_ID;
  if (opts.liveChainId !== null && chainId === opts.liveChainId) {
    throw new Error("Refusing to start a fork with the same chain ID as the live network.");
  }
  const port = opts.port ?? (await freePort(config.forkPortBase + (portCursor++ % 100)));
  const args = ["--host", "127.0.0.1", "--port", String(port), "--chain-id", String(chainId), "--quiet"];
  if (opts.upstreamUrl) args.push("--fork-url", opts.upstreamUrl, "--no-storage-caching");

  const child: ChildProcess = spawn(config.anvilPath, args, { env: sanitizedChildEnv(), stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr?.on("data", (d) => (stderr += String(d)));
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.once("error", (e) => (stderr += String(e)));

  // Register before the first request so the guard allows anvil_* methods on this port only.
  registerFork(port, chainId, opts.liveChainId);
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  let forkBlock = -1;
  while (Date.now() < deadline) {
    try {
      const v = (await guardedRequest(url, { method: "web3_clientVersion" })) as { result?: string };
      if (!v.result?.toLowerCase().startsWith("anvil")) throw new Error("Port is not an Anvil instance");
      const b = (await guardedRequest(url, { method: "eth_blockNumber" })) as { result: string };
      forkBlock = Number(BigInt(b.result));
      break;
    } catch (e) {
      if (child.exitCode !== null) break;
      if (e instanceof Error && e.message === "Port is not an Anvil instance") throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (forkBlock < 0) {
    unregisterFork(port);
    child.kill("SIGKILL");
    throw new Error(`Private fork did not start${stderr ? `: ${stderr.slice(0, 300)}` : ""}`);
  }
  return {
    url,
    port,
    chainId,
    liveChainId: opts.liveChainId,
    forkBlock,
    stop: async () => {
      unregisterFork(port);
      child.kill("SIGTERM");
      await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
      if (child.exitCode === null) child.kill("SIGKILL");
    },
  };
}

/** Thin JSON-RPC helper for a private fork. */
export class ForkRpc {
  constructor(public fork: Fork) {}

  async rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const json = (await guardedRequest(this.fork.url, { method, params })) as { result?: T; error?: { message: string; data?: unknown } };
    if (json.error) {
      const e = new Error(json.error.message) as Error & { data?: unknown };
      e.data = json.error.data;
      throw e;
    }
    return json.result as T;
  }

  snapshot() { return this.rpc<string>("evm_snapshot"); }
  revert(id: string) { return this.rpc<boolean>("evm_revert", [id]); }
  impersonate(addr: string) { return this.rpc("anvil_impersonateAccount", [addr]); }
  setBalance(addr: string, wei: bigint) { return this.rpc("anvil_setBalance", [addr, "0x" + wei.toString(16)]); }
  setCode(addr: string, code: string) { return this.rpc("anvil_setCode", [addr, code]); }
  getCode(addr: string) { return this.rpc<string>("eth_getCode", [addr, "latest"]); }
  getStorage(addr: string, slot: string) { return this.rpc<string>("eth_getStorageAt", [addr, slot, "latest"]); }

  async call(to: string, data: string, from?: string): Promise<{ ok: boolean; data?: string; error?: string }> {
    try {
      const r = await this.rpc<string>("eth_call", [{ to, data, ...(from ? { from } : {}) }, "latest"]);
      return { ok: true, data: r };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** Sends a transaction from an impersonated account on the private fork and waits for the receipt. */
  async send(from: string, to: string, data: string, value = 0n): Promise<{ ok: boolean; error?: string }> {
    await this.impersonate(from);
    await this.setBalance(from, 10n ** 21n);
    try {
      const hash = await this.rpc<string>("eth_sendTransaction", [
        { from, to, data, value: "0x" + value.toString(16), gas: "0x1c9c380" },
      ]);
      // Auto-mining usually mines before the hash returns, but poll briefly to be safe.
      for (let i = 0; i < 25; i++) {
        const receipt = await this.rpc<{ status: string } | null>("eth_getTransactionReceipt", [hash]);
        if (receipt) return { ok: receipt.status === "0x1" };
        await new Promise((r) => setTimeout(r, 40));
      }
      return { ok: false, error: "no receipt" };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
