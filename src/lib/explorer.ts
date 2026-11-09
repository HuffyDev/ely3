import { config } from "./config";

/**
 * Read-only explorer client. Supports Blockscout v2 and Etherscan-compatible APIs.
 * The Elysium explorer's exact API shape is not verified from this build environment; both are
 * tried, and callers treat a null result as "history unavailable" rather than an error.
 */

export type SourceFile = { path: string; content: string };
export type VerifiedSource = { name: string; files: SourceFile[]; compiler?: string; abi?: unknown[] };
export type TxSummary = {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  timestamp?: number;
  method?: string;
  isContractCreation?: boolean;
};

async function getJson(url: string, timeoutMs = 15_000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Explorer answered HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function base() {
  return config.explorerApiUrl.replace(/\/+$/, "");
}
function keyParam() {
  return config.explorerApiKey ? `&apikey=${encodeURIComponent(config.explorerApiKey)}` : "";
}

export function explorerConfigured() {
  return !!config.explorerApiUrl;
}

export async function fetchVerifiedSource(address: string): Promise<VerifiedSource | null> {
  if (!explorerConfigured()) return null;
  // Blockscout v2
  try {
    const j = (await getJson(`${base()}/v2/smart-contracts/${address}`)) as {
      name?: string;
      source_code?: string;
      file_path?: string;
      additional_sources?: { file_path: string; source_code: string }[];
      compiler_version?: string;
      abi?: unknown[];
    };
    if (j?.source_code) {
      const files: SourceFile[] = [{ path: j.file_path || `${j.name || "Contract"}.sol`, content: j.source_code }];
      for (const s of j.additional_sources ?? []) files.push({ path: s.file_path, content: s.source_code });
      return { name: j.name || "Contract", files, compiler: j.compiler_version, abi: j.abi };
    }
  } catch {
    /* try next */
  }
  // Etherscan-compatible
  try {
    const j = (await getJson(`${base()}?module=contract&action=getsourcecode&address=${address}${keyParam()}`)) as {
      result?: { SourceCode?: string; ContractName?: string; CompilerVersion?: string; ABI?: string }[];
    };
    const r = j?.result?.[0];
    if (r?.SourceCode) {
      let files: SourceFile[] = [];
      const raw = r.SourceCode.trim();
      if (raw.startsWith("{")) {
        const parsed = JSON.parse(raw.startsWith("{{") ? raw.slice(1, -1) : raw) as { sources?: Record<string, { content: string }> } & Record<string, { content: string }>;
        const sources = parsed.sources ?? parsed;
        files = Object.entries(sources).map(([path, v]) => ({ path, content: v.content }));
      } else {
        files = [{ path: `${r.ContractName || "Contract"}.sol`, content: raw }];
      }
      let abi: unknown[] | undefined;
      try {
        abi = r.ABI ? JSON.parse(r.ABI) : undefined;
      } catch {
        abi = undefined;
      }
      return { name: r.ContractName || "Contract", files, compiler: r.CompilerVersion, abi };
    }
  } catch {
    /* none */
  }
  return null;
}

/** Recent transactions involving an address (newest first). Returns null when the explorer is unavailable. */
export async function fetchAddressTxs(address: string, limit = 200): Promise<TxSummary[] | null> {
  if (!explorerConfigured()) return null;
  try {
    const j = (await getJson(`${base()}/v2/addresses/${address}/transactions`)) as {
      items?: { hash: string; from: { hash: string }; to: { hash: string } | null; value: string; timestamp?: string; method?: string; created_contract?: unknown }[];
    };
    if (Array.isArray(j?.items)) {
      return j.items.slice(0, limit).map((t) => ({
        hash: t.hash,
        from: t.from.hash.toLowerCase(),
        to: t.to?.hash?.toLowerCase() ?? null,
        value: t.value,
        timestamp: t.timestamp ? Date.parse(t.timestamp) : undefined,
        method: t.method ?? undefined,
        isContractCreation: !!t.created_contract,
      }));
    }
  } catch {
    /* try next */
  }
  try {
    const j = (await getJson(`${base()}?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=${limit}${keyParam()}`)) as {
      result?: { hash: string; from: string; to: string; value: string; timeStamp: string; functionName?: string; contractAddress?: string }[];
    };
    if (Array.isArray(j?.result)) {
      return j.result.map((t) => ({
        hash: t.hash,
        from: t.from.toLowerCase(),
        to: t.to ? t.to.toLowerCase() : null,
        value: t.value,
        timestamp: Number(t.timeStamp) * 1000,
        method: t.functionName?.split("(")[0] || undefined,
        isContractCreation: !t.to && !!t.contractAddress,
      }));
    }
  } catch {
    /* none */
  }
  return null;
}
