import type { Hex, PublicClient } from "viem";

export const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
export const EIP1967_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
export const EIP1967_BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

export type BytecodeFacts = {
  size: number;
  selectors: Set<string>;
  opcodes: { selfdestruct: boolean; delegatecall: boolean; callcode: boolean; create2: boolean; tload: boolean };
  usesEcrecover: boolean;
  isEip7702Delegation: boolean;
  delegationTarget?: string;
  minimalProxyTarget?: string;
};

const OP = { PUSH1: 0x60, PUSH4: 0x63, PUSH32: 0x7f, STATICCALL: 0xfa, DELEGATECALL: 0xf4, CALLCODE: 0xf2, SELFDESTRUCT: 0xff, CREATE2: 0xf5, TLOAD: 0x5c, GAS: 0x5a };

/** Walks the bytecode once, skipping PUSH data, and collects facts. Heuristic by nature. */
export function analyseBytecode(code: Hex): BytecodeFacts {
  const hex = code.startsWith("0x") ? code.slice(2) : code;
  const bytes = Buffer.from(hex, "hex");
  const facts: BytecodeFacts = {
    size: bytes.length,
    selectors: new Set(),
    opcodes: { selfdestruct: false, delegatecall: false, callcode: false, create2: false, tload: false },
    usesEcrecover: false,
    isEip7702Delegation: false,
  };

  if (bytes.length === 23 && bytes[0] === 0xef && bytes[1] === 0x01 && bytes[2] === 0x00) {
    facts.isEip7702Delegation = true;
    facts.delegationTarget = "0x" + bytes.subarray(3).toString("hex");
    return facts;
  }
  // EIP-1167 minimal proxy: 363d3d373d3d3d363d73<20 bytes>5af43d82803e903d91602b57fd5bf3
  const m = hex.toLowerCase().match(/^363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/);
  if (m) facts.minimalProxyTarget = "0x" + m[1];

  // Track the last few opcodes to spot `PUSH1 0x01 ... GAS STATICCALL` (precompile 0x01 = ecrecover).
  let lastPushOneAt = -100;
  let i = 0;
  let opIndex = 0;
  while (i < bytes.length) {
    const op = bytes[i];
    if (op >= OP.PUSH1 && op <= OP.PUSH32) {
      const n = op - OP.PUSH1 + 1;
      if (op === OP.PUSH4 && i + 4 < bytes.length) {
        facts.selectors.add("0x" + bytes.subarray(i + 1, i + 5).toString("hex"));
      }
      if (n === 1 && bytes[i + 1] === 0x01) lastPushOneAt = opIndex;
      i += n + 1;
      opIndex++;
      continue;
    }
    switch (op) {
      case OP.SELFDESTRUCT: facts.opcodes.selfdestruct = true; break;
      case OP.DELEGATECALL: facts.opcodes.delegatecall = true; break;
      case OP.CALLCODE: facts.opcodes.callcode = true; break;
      case OP.CREATE2: facts.opcodes.create2 = true; break;
      case OP.TLOAD: facts.opcodes.tload = true; break;
      case OP.STATICCALL:
        if (opIndex - lastPushOneAt <= 6) facts.usesEcrecover = true;
        break;
    }
    i++;
    opIndex++;
  }
  // Metadata/data sections can contain 0xff bytes; only trust SELFDESTRUCT if the selector set is non-trivial.
  return facts;
}

export type ProxyInfo = { kind: "eip1967" | "beacon" | "minimal" | null; implementation?: string; admin?: string; beacon?: string };

const ZERO = "0x" + "0".repeat(64);
const toAddr = (word: string) => "0x" + word.slice(-40);

export async function detectProxy(client: PublicClient, address: Hex, facts: BytecodeFacts): Promise<ProxyInfo> {
  if (facts.minimalProxyTarget) return { kind: "minimal", implementation: facts.minimalProxyTarget };
  const [impl, admin, beacon] = await Promise.all([
    client.getStorageAt({ address, slot: EIP1967_IMPL_SLOT }),
    client.getStorageAt({ address, slot: EIP1967_ADMIN_SLOT }),
    client.getStorageAt({ address, slot: EIP1967_BEACON_SLOT }),
  ]);
  if (impl && impl !== ZERO) {
    return { kind: "eip1967", implementation: toAddr(impl), admin: admin && admin !== ZERO ? toAddr(admin) : undefined };
  }
  if (beacon && beacon !== ZERO) return { kind: "beacon", beacon: toAddr(beacon) };
  return { kind: null };
}
