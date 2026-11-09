import { describe, it, expect, beforeEach } from "vitest";
import {
  assertRpcAllowed,
  assertSafeForgeArgs,
  LiveNetworkGuardError,
  registerFork,
  unregisterFork,
  isPrivateForkUrl,
  READ_ONLY_METHODS,
} from "@/lib/safety/txguard";

const MAINNET = "https://rpc.elysium.kinetiq.xyz";
const TESTNET = "https://testnet-rpc.elysium.kinetiq.xyz";
const LIVE = MAINNET;
const FORK = "http://127.0.0.1:8611";
const STATE_CHANGING = ["eth_sendTransaction", "eth_sendRawTransaction", "anvil_setBalance", "anvil_setCode", "anvil_impersonateAccount", "evm_snapshot", "evm_mine", "personal_sign", "eth_sign"];

describe("no attack/test transaction can reach a live network, including TESTNET", () => {
  beforeEach(() => unregisterFork(8611));

  it("blocks every state-changing RPC to mainnet AND testnet", () => {
    for (const url of [MAINNET, TESTNET]) {
      for (const m of STATE_CHANGING) {
        expect(() => assertRpcAllowed(url, { method: m }), `${m} -> ${url}`).toThrow(LiveNetworkGuardError);
      }
    }
  });

  it("blocks forge --broadcast / forking from testnet", () => {
    registerFork(8611, 31337, 99801);
    expect(() => assertSafeForgeArgs(["test", "--fork-url", TESTNET])).toThrow(LiveNetworkGuardError);
    expect(() => assertSafeForgeArgs(["script", "Deploy", "--broadcast", "--rpc-url", TESTNET])).toThrow(LiveNetworkGuardError);
    unregisterFork(8611);
  });

  it("read-only calls to testnet are allowed (we still inspect it)", () => {
    for (const m of ["eth_chainId", "eth_getCode", "eth_call", "eth_getBalance", "eth_getTransactionByHash"]) {
      expect(() => assertRpcAllowed(TESTNET, { method: m })).not.toThrow();
    }
  });
});

describe("live-network transaction guard", () => {
  beforeEach(() => {
    unregisterFork(8611);
  });

  it("allows read-only calls to a live network", () => {
    for (const m of ["eth_chainId", "eth_getCode", "eth_call", "eth_getLogs"]) {
      expect(() => assertRpcAllowed(LIVE, { method: m })).not.toThrow();
    }
  });

  it("blocks any state-changing call to a live network", () => {
    for (const m of ["eth_sendTransaction", "eth_sendRawTransaction", "anvil_setBalance", "evm_snapshot", "personal_sign"]) {
      expect(() => assertRpcAllowed(LIVE, { method: m })).toThrow(LiveNetworkGuardError);
    }
  });

  it("blocks state-override eth_call on a live network", () => {
    expect(() => assertRpcAllowed(LIVE, { method: "eth_call", params: [{}, "latest", { "0x": {} }] })).toThrow(LiveNetworkGuardError);
  });

  it("allows everything on a registered private fork", () => {
    registerFork(8611, 31337, 99801);
    expect(isPrivateForkUrl(FORK)).toBe(true);
    for (const m of ["eth_sendTransaction", "anvil_setBalance", "evm_snapshot", "anvil_impersonateAccount"]) {
      expect(() => assertRpcAllowed(FORK, { method: m })).not.toThrow();
    }
  });

  it("does not treat an unregistered loopback port as a fork", () => {
    expect(isPrivateForkUrl("http://127.0.0.1:9999")).toBe(false);
    expect(() => assertRpcAllowed("http://127.0.0.1:9999", { method: "eth_sendTransaction" })).toThrow(LiveNetworkGuardError);
  });

  it("refuses to register a fork whose chain ID equals the live chain ID", () => {
    expect(() => registerFork(8611, 99801, 99801)).toThrow(LiveNetworkGuardError);
  });

  it("the read-only allow-list contains no state-changing methods", () => {
    for (const m of READ_ONLY_METHODS) {
      expect(m.startsWith("eth_send")).toBe(false);
      expect(m.startsWith("anvil_")).toBe(false);
      expect(m.startsWith("evm_")).toBe(false);
    }
  });
});

describe("forge argument guard", () => {
  beforeEach(() => registerFork(8611, 31337, 99801));

  it("allows test/build", () => {
    expect(() => assertSafeForgeArgs(["test"])).not.toThrow();
    expect(() => assertSafeForgeArgs(["build", "--root", "contracts"])).not.toThrow();
  });

  it("blocks broadcasting and private keys", () => {
    expect(() => assertSafeForgeArgs(["script", "--broadcast"])).toThrow();
    expect(() => assertSafeForgeArgs(["test", "--private-key", "0xabc"])).toThrow();
    expect(() => assertSafeForgeArgs(["test", "--fork-url", "https://rpc.elysium.kinetiq.xyz"])).toThrow();
  });

  it("allows forking only from a registered private fork", () => {
    expect(() => assertSafeForgeArgs(["test", "--fork-url", "http://127.0.0.1:8611"])).not.toThrow();
    expect(() => assertSafeForgeArgs(["test", "--fork-url", "http://127.0.0.1:1"])).toThrow();
  });
});
