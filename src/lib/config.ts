import path from "node:path";

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}
function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== "" && process.env[name] !== undefined ? v : fallback;
}
function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

/** All runtime configuration. Secrets are read lazily and never logged. */
export const config = {
  get dataDir() { return path.resolve(str("DATA_DIR", "./data")); },
  get publicBaseUrl() { return str("PUBLIC_BASE_URL", "http://localhost:3000"); },

  // Network (read-only)
  get elysiumRpcUrl() { return str("ELYSIUM_RPC_URL"); },
  get elysiumTestnetRpcUrl() { return str("ELYSIUM_TESTNET_RPC_URL", "https://testnet-rpc.elysium.kinetiq.xyz"); },
  get explorerApiUrl() { return str("EXPLORER_API_URL", "https://elyscan.live/api"); },
  get explorerApiKey() { return str("EXPLORER_API_KEY"); },
  get demoMode() { return bool("DEMO_MODE", true); },

  // Tools
  get anvilPath() { return str("ANVIL_PATH", "anvil"); },
  get forgePath() { return str("FORGE_PATH", "forge"); },
  get slitherPath() { return str("SLITHER_PATH", "slither"); },
  get solcPath() { return str("SOLC_PATH", "solc"); },
  get forkPortBase() { return num("FORK_PORT_BASE", 8600); },

  // AI
  get aiModel() { return str("AI_MODEL", "claude-opus-5-5"); },
  get aiEffort() { return str("AI_EFFORT", "high") as "low" | "medium" | "high" | "xhigh" | "max"; },
  get aiDailyBudgetUsd() { return num("AI_DAILY_BUDGET_USD", 5); },
  get aiMaxInputTokensPerScan() { return num("AI_MAX_INPUT_TOKENS_PER_SCAN", 60_000); },
  get aiMaxOutputTokensPerScan() { return num("AI_MAX_OUTPUT_TOKENS_PER_SCAN", 8_000); },
  get aiConfigured() { return str("ANTHROPIC_API_KEY") !== ""; },

  // Limits
  get scansPerIpPerHour() { return num("SCANS_PER_IP_PER_HOUR", 12); },
  get watcherEnabled() { return bool("WATCHER_ENABLED", false); },
  get watcherMaxAnalysesPerHour() { return num("WATCHER_MAX_ANALYSES_PER_HOUR", 20); },
  get runWorkerInProcess() { return bool("RUN_WORKER_IN_PROCESS", true); },
  get disclosureWaitDays() { return num("DISCLOSURE_WAIT_DAYS", 90); },
};

/** Secrets: returned only to the code that needs them. Never pass to logs or responses. */
export const secrets = {
  proofKeyHex: () => str("PROOF_ENCRYPTION_KEY"),
  sessionSecretHex: () => str("SESSION_SECRET"),
  operatorToken: () => str("OPERATOR_TOKEN"),
};

/** Redacts anything that looks like a key before text goes to logs or the UI. */
export function redact(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_\-]+/g, "[redacted-key]")
    .replace(/\b0x[0-9a-fA-F]{64}\b/g, (m) => (/^0x0{24}/.test(m) ? m : "[redacted-32-bytes]"))
    .replace(/([?&](apikey|api_key|key)=)[^&\s]+/gi, "$1[redacted]");
}
