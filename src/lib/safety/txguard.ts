/**
 * Live-network transaction guard.
 *
 * Hard rule: WHITEHAT never sends a transaction, signature request or state-changing
 * RPC call to a live network (mainnet or testnet). Anything that changes state is only
 * allowed against a private local Anvil fork that this process spawned itself.
 *
 * Every JSON-RPC request the app makes goes through `guardedRequest`. Forge invocations
 * go through `assertSafeForgeArgs`.
 */

export class LiveNetworkGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveNetworkGuardError";
  }
}

/** Read-only methods allowed against live networks. Allow-list, not deny-list. */
export const READ_ONLY_METHODS = new Set([
  "eth_chainId",
  "net_version",
  "web3_clientVersion",
  "eth_blockNumber",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_call",
  "eth_estimateGas",
  "eth_getTransactionCount",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getBlockReceipts",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getLogs",
  "eth_gasPrice",
  "eth_feeHistory",
  "eth_maxPriorityFeePerGas",
  "eth_getProof",
]);

/** Ports of Anvil forks spawned by this process. Only these may receive state-changing calls. */
const registeredForks = new Map<number, { chainId: number; liveChainId: number | null }>();

export function registerFork(port: number, chainId: number, liveChainId: number | null) {
  if (liveChainId !== null && chainId === liveChainId) {
    throw new LiveNetworkGuardError("Fork chain ID must differ from the live chain ID so signed payloads cannot be replayed on a live network.");
  }
  registeredForks.set(port, { chainId, liveChainId });
}
export function unregisterFork(port: number) {
  registeredForks.delete(port);
}
export function isRegisteredFork(port: number) {
  return registeredForks.has(port);
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function isLoopbackUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return (u.protocol === "http:" || u.protocol === "ws:") && LOOPBACK_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** True when `rawUrl` is a private fork this process started. */
export function isPrivateForkUrl(rawUrl: string): boolean {
  if (!isLoopbackUrl(rawUrl)) return false;
  const port = Number(new URL(rawUrl).port);
  return registeredForks.has(port);
}

export type RpcRequest = { method: string; params?: unknown };

/** Throws unless `req` is allowed against `url`. */
export function assertRpcAllowed(url: string, req: RpcRequest): void {
  if (isPrivateForkUrl(url)) return; // private local fork: anything goes, nothing leaves the machine
  if (!READ_ONLY_METHODS.has(req.method)) {
    throw new LiveNetworkGuardError(
      `Blocked "${req.method}" to ${safeHost(url)}: only read-only calls are allowed outside a private local fork.`,
    );
  }
  // eth_call / eth_estimateGas are simulations, but never let a "from" with a state override sneak through
  if ((req.method === "eth_call" || req.method === "eth_estimateGas") && Array.isArray(req.params) && req.params.length > 2) {
    throw new LiveNetworkGuardError("Blocked state-override eth_call against a live network.");
  }
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

/** Single choke point for JSON-RPC. Supports batches. */
export async function guardedRequest(url: string, body: RpcRequest | RpcRequest[], init?: { signal?: AbortSignal }) {
  const list = Array.isArray(body) ? body : [body];
  for (const r of list) assertRpcAllowed(url, r);
  const payload = list.map((r, i) => ({ jsonrpc: "2.0", id: i + 1, method: r.method, params: r.params ?? [] }));
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Array.isArray(body) ? payload : payload[0]),
    signal: init?.signal,
  });
  if (!res.ok) throw new Error(`RPC ${safeHost(url)} answered HTTP ${res.status}`);
  return res.json();
}

/** Forge may only run tests/builds, and only against registered private forks. */
export function assertSafeForgeArgs(args: string[]): void {
  const sub = args[0];
  if (sub !== "test" && sub !== "build") {
    throw new LiveNetworkGuardError(`Blocked forge subcommand "${sub}". Only "test" and "build" are allowed.`);
  }
  const banned = ["--broadcast", "--private-key", "--mnemonic", "--keystore", "--ledger", "--trezor", "--unlocked", "--etherscan-api-key", "--verify"];
  for (const a of args) {
    if (banned.some((b) => a === b || a.startsWith(b + "="))) {
      throw new LiveNetworkGuardError(`Blocked forge flag "${a}".`);
    }
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const isUrlFlag = a === "--fork-url" || a === "--rpc-url" || a === "-f";
    const inline = a.startsWith("--fork-url=") || a.startsWith("--rpc-url=");
    if (isUrlFlag || inline) {
      const url = inline ? a.split("=").slice(1).join("=") : args[i + 1];
      if (!url || !isPrivateForkUrl(url)) {
        throw new LiveNetworkGuardError("Forge may only fork from a private local Anvil instance started by WHITEHAT.");
      }
    }
  }
}

/** Environment passed to child processes: strips anything that could sign or reach a live RPC by accident. */
export function sanitizedChildEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  const keep = ["PATH", "HOME", "LANG", "TMPDIR", "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy"];
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  // Make sure forge never picks up an RPC or key from the environment.
  env.FOUNDRY_OFFLINE = "true";
  return { ...env, ...extra } as NodeJS.ProcessEnv;
}
