import { createPublicClient, custom, defineChain, type PublicClient, type Chain } from "viem";
import { config } from "./config";
import { guardedRequest, assertRpcAllowed } from "./safety/txguard";

export type NetworkId = "elysium" | "elysium-testnet" | "local";

export const NETWORKS: Record<NetworkId, { label: string; expectedChainId?: number; explorer?: string }> = {
  elysium: { label: "Elysium", explorer: "https://elyscan.live" },
  "elysium-testnet": { label: "Elysium testnet", expectedChainId: 99801, explorer: "https://testnet.elysium.kinetiq.xyz" },
  local: { label: "Local demo chain" },
};

export function rpcUrlFor(network: NetworkId): string {
  if (network === "elysium") return config.elysiumRpcUrl;
  if (network === "elysium-testnet") return config.elysiumTestnetRpcUrl;
  if (network === "local") return config.demoMode ? process.env.LOCAL_DEMO_RPC_URL || "http://127.0.0.1:8545" : "";
  return "";
}

/** viem transport that routes every request through the live-network guard. */
export function guardedTransport(url: string) {
  return custom({
    async request({ method, params }) {
      assertRpcAllowed(url, { method, params });
      const json = (await guardedRequest(url, { method, params })) as { result?: unknown; error?: { message: string; code: number } };
      if (json.error) {
        const err = new Error(json.error.message) as Error & { code?: number };
        err.code = json.error.code;
        throw err;
      }
      return json.result;
    },
  });
}

const chainIdCache = new Map<string, number>();

/** Reads the chain ID from the RPC itself (eth_chainId). Never hardcoded. */
export async function readChainId(url: string): Promise<number> {
  const cached = chainIdCache.get(url);
  if (cached) return cached;
  const json = (await guardedRequest(url, { method: "eth_chainId" })) as { result?: string; error?: unknown };
  if (!json.result) throw new Error("RPC did not return a chain ID");
  const id = Number(BigInt(json.result));
  chainIdCache.set(url, id);
  return id;
}

export async function getClient(network: NetworkId): Promise<{ client: PublicClient; chainId: number; url: string }> {
  const url = rpcUrlFor(network);
  if (!url) throw new Error(`No RPC configured for ${NETWORKS[network].label}. Set it in .env.`);
  const chainId = await readChainId(url);
  const expected = NETWORKS[network].expectedChainId;
  if (expected && chainId !== expected) {
    throw new Error(`${NETWORKS[network].label} RPC reported chain ${chainId}, expected ${expected}. Refusing to continue.`);
  }
  const chain: Chain = defineChain({
    id: chainId,
    name: NETWORKS[network].label,
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
  const client = createPublicClient({ chain, transport: guardedTransport(url) }) as PublicClient;
  return { client, chainId, url };
}

export function availableNetworks(): NetworkId[] {
  const list: NetworkId[] = [];
  if (config.elysiumRpcUrl) list.push("elysium");
  if (config.elysiumTestnetRpcUrl) list.push("elysium-testnet");
  if (config.demoMode) list.push("local");
  return list;
}
