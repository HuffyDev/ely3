import { encodeFunctionData, parseAbiItem, decodeAbiParameters, type AbiFunction } from "viem";
import { ForkRpc, type Fork } from "./fork";
import { SIGS, presentSigs, selectorOf } from "./signatures";
import { makeFinding } from "./evidence";
import type { Finding, ForkProof, CoverageItem } from "./types";
import { EIP1967_IMPL_SLOT, EIP1967_ADMIN_SLOT } from "./bytecode";

/**
 * Fork probes. Each probe runs against a private local fork, inside an EVM snapshot that is
 * reverted afterwards. Nothing here can reach a live network: ForkRpc only talks to a fork
 * registered with the transaction guard.
 */

const STRANGER = "0x00000000000000000000000000000000005a3e01";
const HOLDER = "0x00000000000000000000000000000000005a3e02";
const RECEIVER = "0x00000000000000000000000000000000005a3e03";

function enc(sig: string, args: unknown[]) {
  const item = parseAbiItem(`function ${sig}`) as AbiFunction;
  return encodeFunctionData({ abi: [item], functionName: item.name, args });
}
const word = (hex?: string) => (hex && hex.length >= 66 ? BigInt(hex.slice(0, 66)) : 0n);
const addrOf = (hex?: string) => (hex && hex.length >= 66 ? ("0x" + hex.slice(26, 66)).toLowerCase() : undefined);

export type ProbeContext = { fork: Fork; target: string; selectors: Set<string> };
export type ProbeResult = { findings: Finding[]; coverage: CoverageItem[]; facts: { label: string; value: string; mono?: boolean }[] };

function proof(ctx: ProbeContext, test: string, observations: string[]): ForkProof {
  return { forkChainId: ctx.fork.chainId, liveChainId: ctx.fork.liveChainId, forkBlock: ctx.fork.forkBlock, test, observations, passed: true };
}

async function inSnapshot<T>(rpc: ForkRpc, fn: () => Promise<T>): Promise<T> {
  const id = await rpc.snapshot();
  try {
    return await fn();
  } finally {
    await rpc.revert(id);
  }
}

async function readOwner(rpc: ForkRpc, ctx: ProbeContext): Promise<string | undefined> {
  for (const sig of presentSigs(ctx.selectors, SIGS.owner)) {
    const r = await rpc.call(ctx.target, selectorOf(sig));
    const a = r.ok ? addrOf(r.data) : undefined;
    if (a && a !== "0x0000000000000000000000000000000000000000") return a;
  }
  return undefined;
}

async function balanceOf(rpc: ForkRpc, token: string, who: string) {
  const r = await rpc.call(token, enc("balanceOf(address)", [who]));
  return r.ok ? word(r.data) : 0n;
}
async function totalSupply(rpc: ForkRpc, token: string) {
  const r = await rpc.call(token, selectorOf("totalSupply()"));
  return r.ok ? word(r.data) : 0n;
}
async function transfer(rpc: ForkRpc, token: string, from: string, to: string, amount: bigint) {
  return rpc.send(from, token, enc("transfer(address,uint256)", [to, amount]));
}

function argsFor(sig: string, who: string, flag: boolean | undefined, amount: bigint): unknown[] {
  const inside = sig.slice(sig.indexOf("(") + 1, -1);
  if (!inside) return [];
  return inside.split(",").map((t) => {
    if (t === "address") return who;
    if (t === "bool") return flag ?? true;
    if (t === "address[]") return [who];
    if (t === "bytes") return "0x";
    return amount;
  });
}

/** Gives HOLDER a small token balance by having the owner (or the biggest known holder) send some. */
async function fundHolder(rpc: ForkRpc, ctx: ProbeContext, owner: string | undefined): Promise<bigint> {
  if (!owner) return 0n;
  const ob = await balanceOf(rpc, ctx.target, owner);
  if (ob === 0n) return 0n;
  const amount = ob / 1000n > 0n ? ob / 1000n : ob;
  const r = await transfer(rpc, ctx.target, owner, HOLDER, amount);
  return r.ok ? await balanceOf(rpc, ctx.target, HOLDER) : 0n;
}

async function pairAddress(rpc: ForkRpc, ctx: ProbeContext): Promise<string | undefined> {
  for (const sig of presentSigs(ctx.selectors, SIGS.pairGetter)) {
    const r = await rpc.call(ctx.target, selectorOf(sig));
    const a = r.ok ? addrOf(r.data) : undefined;
    if (a && a !== "0x0000000000000000000000000000000000000000") return a;
  }
  return undefined;
}

export async function runProbes(ctx: ProbeContext): Promise<ProbeResult> {
  const rpc = new ForkRpc(ctx.fork);
  const findings: Finding[] = [];
  const coverage: CoverageItem[] = [];
  const facts: ProbeResult["facts"] = [];
  const owner = await readOwner(rpc, ctx);
  if (owner) facts.push({ label: "Owner", value: owner, mono: true });
  const isErc20 = SIGS.erc20.every((s) => ctx.selectors.has(selectorOf(s)));

  // ---- Ownership takeover by a stranger (exploitable) ----
  const takeover = presentSigs(ctx.selectors, SIGS.takeover);
  if (takeover.length && owner) {
    for (const sig of takeover) {
      const hit = await inSnapshot(rpc, async () => {
        const r = await rpc.send(STRANGER, ctx.target, enc(sig, argsFor(sig, STRANGER, true, 0n)));
        return r.ok && (await readOwner(rpc, ctx)) === STRANGER;
      });
      if (hit) {
        findings.push(
          makeFinding({
            key: "access-control:takeover",
            title: "Anyone can take ownership",
            plain: "Any address can make itself the owner of this contract and use every owner power.",
            severity: "critical",
            category: "access-control",
            exposure: "exploitable",
            sources: ["fork"],
            technical: `Calling ${sig} from an unrelated address changed owner() to that address on the private fork.`,
            location: sig,
            recommendation: "Restrict the function to the current owner, and guard initialisers so they can run only once.",
            proof: proof(ctx, `probe:takeover:${sig}`, [`stranger called ${sig}`, "owner() now returns the stranger"]),
          }),
        );
        break;
      }
    }
    coverage.push({ check: "Ownership takeover by an unrelated address", status: "ran" });
  }

  // ---- Minting ----
  const mints = presentSigs(ctx.selectors, SIGS.mint);
  if (isErc20 && mints.length) {
    for (const sig of mints) {
      const amount = 10n ** 24n;
      const byStranger = await inSnapshot(rpc, async () => {
        const before = await totalSupply(rpc, ctx.target);
        const r = await rpc.send(STRANGER, ctx.target, enc(sig, argsFor(sig, STRANGER, true, amount)));
        return r.ok && (await totalSupply(rpc, ctx.target)) > before;
      });
      if (byStranger) {
        findings.push(
          makeFinding({
            key: "hidden-mint:public",
            title: "Anyone can mint new tokens",
            plain: "Any address can create new tokens, which can dilute every holder to zero.",
            severity: "critical",
            category: "hidden-mint",
            exposure: "exploitable",
            sources: ["fork"],
            technical: `${sig} increased totalSupply when called by an unrelated address on the private fork.`,
            location: sig,
            recommendation: "Remove public minting or restrict it with access control and a hard supply cap.",
            proof: proof(ctx, `probe:mint:stranger:${sig}`, ["unrelated address called the mint function", "totalSupply increased"]),
          }),
        );
        break;
      }
      if (owner) {
        const byOwner = await inSnapshot(rpc, async () => {
          const before = await totalSupply(rpc, ctx.target);
          const r = await rpc.send(owner, ctx.target, enc(sig, argsFor(sig, owner, true, amount)));
          return r.ok && (await totalSupply(rpc, ctx.target)) > before;
        });
        if (byOwner) {
          findings.push(
            makeFinding({
              key: "hidden-mint:owner",
              title: "Owner can mint unlimited tokens",
              plain: "The owner can create new tokens at any time. That would dilute every holder.",
              severity: "high",
              category: "hidden-mint",
              exposure: "privilege",
              sources: ["fork"],
              technical: `${sig}, called by the owner on the private fork, increased totalSupply by 1,000,000 tokens with no cap reached.`,
              location: sig,
              recommendation: "Holders: treat supply as unlimited while this power exists. Projects: cap supply, renounce minting, or put it behind a timelock and multisig.",
              proof: proof(ctx, `probe:mint:owner:${sig}`, ["owner called the mint function", "totalSupply increased by 10^24 units"]),
            }),
          );
          break;
        }
      }
    }
    coverage.push({ check: "Minting by owner and by an unrelated address", status: "ran" });
  }

  // ---- Transfers, blacklist, trading switch, sell tax ----
  if (isErc20) {
    const holderBalance = await inSnapshot(rpc, () => fundHolder(rpc, ctx, owner));
    if (holderBalance === 0n) {
      coverage.push({ check: "Transfer, blacklist and sell-tax probes", status: "skipped", note: "Could not give a test holder a balance on the fork (no owner balance found)." });
    } else {
      const pair = await pairAddress(rpc, ctx);

      // Baseline: can an ordinary holder transfer at all?
      const baseline = await inSnapshot(rpc, async () => {
        await fundHolder(rpc, ctx, owner);
        const r = await transfer(rpc, ctx.target, HOLDER, RECEIVER, holderBalance / 2n);
        let taxBps = -1;
        if (pair) {
          const before = await balanceOf(rpc, ctx.target, pair);
          const amt = holderBalance / 4n;
          const s = await transfer(rpc, ctx.target, HOLDER, pair, amt);
          if (s.ok && amt > 0n) taxBps = Number(((amt - ((await balanceOf(rpc, ctx.target, pair)) - before)) * 10_000n) / amt);
        }
        return { ok: r.ok, taxBps };
      });
      if (!baseline.ok) {
        findings.push(
          makeFinding({
            key: "sell-restriction:honeypot",
            title: "Ordinary holders cannot transfer",
            plain: "A normal holder's transfer failed while the owner's worked. Buyers may not be able to sell.",
            severity: "critical",
            category: "sell-restriction",
            exposure: "privilege",
            sources: ["fork"],
            technical: "On the private fork the owner sent tokens to a fresh holder, then the holder's transfer to another fresh address reverted.",
            recommendation: "Do not buy. Projects: remove transfer gating for ordinary holders.",
            proof: proof(ctx, "probe:transfer:baseline", ["owner → holder transfer succeeded", "holder → receiver transfer reverted"]),
          }),
        );
      }
      if (baseline.taxBps > 0) {
        facts.push({ label: "Measured sell tax", value: `${(baseline.taxBps / 100).toFixed(2)}%` });
      }

      if (owner) {
        for (const sig of presentSigs(ctx.selectors, SIGS.blacklist)) {
          const frozen = await inSnapshot(rpc, async () => {
            await fundHolder(rpc, ctx, owner);
            const set = await rpc.send(owner, ctx.target, enc(sig, argsFor(sig, HOLDER, true, 0n)));
            if (!set.ok) return false;
            const r = await transfer(rpc, ctx.target, HOLDER, RECEIVER, 1n);
            return !r.ok;
          });
          if (frozen) {
            findings.push(
              makeFinding({
                key: "blacklist:owner",
                title: "Owner can freeze any holder",
                plain: "The owner can stop any address from moving its tokens.",
                severity: "high",
                category: "blacklist",
                exposure: "privilege",
                sources: ["fork"],
                technical: `After the owner called ${sig} for a holder on the private fork, that holder's transfer reverted.`,
                location: sig,
                recommendation: "Holders: your tokens can be frozen. Projects: remove the blacklist or limit it with a timelock and public criteria.",
                proof: proof(ctx, `probe:blacklist:${sig}`, ["owner blacklisted a test holder", "holder transfer reverted"]),
              }),
            );
            break;
          }
        }
        for (const sig of presentSigs(ctx.selectors, SIGS.tradingSwitch)) {
          const blocked = await inSnapshot(rpc, async () => {
            await fundHolder(rpc, ctx, owner);
            const set = await rpc.send(owner, ctx.target, enc(sig, argsFor(sig, HOLDER, false, 0n)));
            if (!set.ok) return false;
            const r = await transfer(rpc, ctx.target, HOLDER, pair ?? RECEIVER, 1n);
            return !r.ok;
          });
          if (blocked) {
            findings.push(
              makeFinding({
                key: "sell-restriction:switch",
                title: "Owner can stop all selling",
                plain: "The owner can switch off transfers for everyone except chosen addresses.",
                severity: "high",
                category: "sell-restriction",
                exposure: "privilege",
                sources: ["fork"],
                technical: `After the owner called ${sig} on the private fork, an ordinary holder's transfer${pair ? " to the pool" : ""} reverted.`,
                location: sig,
                recommendation: "Holders: selling can be blocked at any time. Projects: remove the switch or make it one-way (enable only).",
                proof: proof(ctx, `probe:trading:${sig}`, ["owner toggled trading", "holder transfer reverted"]),
              }),
            );
            break;
          }
        }
        if (pair) {
          for (const sig of presentSigs(ctx.selectors, SIGS.feeSetter)) {
            const taken = await inSnapshot(rpc, async () => {
              await fundHolder(rpc, ctx, owner);
              for (const v of [10_000n, 100n, 99n, 50n, 25n]) {
                const set = await rpc.send(owner, ctx.target, enc(sig, argsFor(sig, HOLDER, true, v)));
                if (!set.ok) continue;
                const before = await balanceOf(rpc, ctx.target, pair);
                const amt = 1000n;
                const s = await transfer(rpc, ctx.target, HOLDER, pair, amt);
                if (!s.ok) return { pct: 100 };
                const got = (await balanceOf(rpc, ctx.target, pair)) - before;
                const pct = Number(((amt - got) * 100n) / amt);
                if (pct >= 25) return { pct };
              }
              return null;
            });
            if (taken) {
              findings.push(
                makeFinding({
                  key: "fees:owner-sell-tax",
                  title: `Owner can raise the sell tax to ${taken.pct}%`,
                  plain: `The owner can change the tax so that selling loses ${taken.pct}% of the tokens.`,
                  severity: taken.pct >= 50 ? "high" : "medium",
                  category: "fees",
                  exposure: "privilege",
                  sources: ["fork"],
                  technical: `${sig}, called by the owner on the private fork, made a holder → pool transfer lose ${taken.pct}% of the amount.`,
                  location: sig,
                  recommendation: "Holders: the sell tax is not fixed. Projects: hard-cap fees in code (for example 5%) or remove the setter.",
                  proof: proof(ctx, `probe:fee:${sig}`, ["owner changed the fee", `holder → pool transfer lost ${taken.pct}%`]),
                }),
              );
              break;
            }
          }
        }
      }
      coverage.push({ check: "Transfers, blacklist, trading switch and sell tax", status: "ran", note: pair ? undefined : "No pool address getter found; sell-tax check used plain transfers." });
    }
  }

  // ---- Upgradeability ----
  const implWord = await rpc.getStorage(ctx.target, EIP1967_IMPL_SLOT);
  const isProxy = word(implWord) !== 0n;
  const upgradeSigs = presentSigs(ctx.selectors, SIGS.upgrade);
  if (isProxy || upgradeSigs.length) {
    const impl = isProxy ? "0x" + implWord.slice(26) : undefined;
    const adminWord = await rpc.getStorage(ctx.target, EIP1967_ADMIN_SLOT);
    const admin = word(adminWord) !== 0n ? "0x" + adminWord.slice(26) : undefined;
    const implSelectors = new Set(ctx.selectors);
    if (impl) {
      const implCode = await rpc.getCode(impl);
      const { analyseBytecode } = await import("./bytecode");
      for (const s of analyseBytecode(implCode as `0x${string}`).selectors) implSelectors.add(s);
    }
    const sigs = presentSigs(implSelectors, SIGS.upgrade);
    const candidates = Array.from(new Set([STRANGER, owner, admin].filter(Boolean) as string[]));
    for (const caller of candidates) {
      let done = false;
      for (const sig of sigs) {
        const changed = await inSnapshot(rpc, async () => {
          const dummy = "0x00000000000000000000000000000000005a3e99";
          if (impl) await rpc.setCode(dummy, await rpc.getCode(impl));
          else await rpc.setCode(dummy, "0x00");
          const r = await rpc.send(caller, ctx.target, enc(sig, argsFor(sig, dummy, true, 0n)));
          if (!r.ok) return false;
          const after = await rpc.getStorage(ctx.target, EIP1967_IMPL_SLOT);
          return addrOf(after) === dummy;
        });
        if (changed) {
          const isStranger = caller === STRANGER;
          const callerCode = isStranger ? "0x" : await rpc.getCode(caller);
          const isEoa = !callerCode || callerCode === "0x";
          findings.push(
            makeFinding({
              key: isStranger ? "upgradeability:public" : "upgradeability:single-key",
              title: isStranger ? "Anyone can replace the contract's code" : isEoa ? "One key can replace the contract's code" : "An admin contract can replace the contract's code",
              plain: isStranger
                ? "Any address can swap this contract's logic for its own."
                : isEoa
                  ? "A single private key can swap this contract's logic at any time, with no delay."
                  : "This contract can be upgraded by an admin contract (for example a multisig or timelock). Check who controls it.",
              severity: isStranger ? "critical" : isEoa ? "high" : "medium",
              category: "upgradeability",
              exposure: isStranger ? "exploitable" : "privilege",
              sources: ["fork"],
              technical: `${sig} called by ${isStranger ? "an unrelated address" : caller} changed the EIP-1967 implementation slot on the private fork.`,
              location: sig,
              recommendation: isStranger
                ? "Restrict upgrades to an authorised admin."
                : "Put upgrades behind a multisig and a timelock so users can exit before a change takes effect.",
              proof: proof(ctx, `probe:upgrade:${sig}`, [`${isStranger ? "unrelated address" : "admin"} called the upgrade function`, "implementation slot changed"]),
            }),
          );
          done = true;
          break;
        }
      }
      if (done) break;
    }
    if (impl) facts.push({ label: "Implementation", value: impl, mono: true });
    if (admin) facts.push({ label: "Proxy admin", value: admin, mono: true });
    coverage.push({ check: "Upgrade authority", status: "ran" });
  }

  // ---- Reentrancy (deploys a disposable attacker on the fork) ----
  try {
    const { runReentrancyProbe } = await import("./reentrancy-probe");
    const reentrancy = await runReentrancyProbe(ctx);
    findings.push(...reentrancy);
    coverage.push({ check: "Reentrancy reproduction", status: "ran", note: reentrancy.length ? undefined : "No drain reproduced." });
  } catch (e) {
    coverage.push({ check: "Reentrancy reproduction", status: "skipped", note: (e as Error).message.slice(0, 120) });
  }

  // ---- Uniswap v4 hook callbacks ----
  const hookSigs = presentSigs(ctx.selectors, SIGS.hook);
  if (hookSigs.length) {
    const demoShape = "beforeSwap(address,bytes,bytes,bytes)";
    const realShape = "beforeSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),bytes)";
    let data: string | undefined;
    if (hookSigs.includes(demoShape)) data = enc(demoShape, [STRANGER, "0x", "0x", "0x"]);
    else if (hookSigs.includes(realShape)) {
      data = enc(realShape, [STRANGER, ["0x0000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000002", 3000, 60, ctx.target], [true, -1000n, 4295128740n], "0x"]);
    }
    if (data) {
      const r = await rpc.call(ctx.target, data, STRANGER);
      if (r.ok) {
        findings.push(
          makeFinding({
            key: "uniswap-v4-hook:caller-check",
            title: "Hook callback accepts any caller",
            plain: "The pool hook does not check that the pool manager is calling it, so others can trigger its logic directly.",
            severity: "medium",
            category: "uniswap-v4-hook",
            exposure: "exploitable",
            sources: ["fork"],
            technical: "beforeSwap returned successfully when called from an unrelated address on the private fork (expected: revert unless msg.sender is the PoolManager).",
            location: "beforeSwap",
            recommendation: "Add an onlyPoolManager check to every hook callback.",
            proof: proof(ctx, "probe:hook:caller", ["unrelated address called beforeSwap", "call returned successfully"]),
          }),
        );
      }
      // Owner can block a swapper (sell restriction in hook)
      if (owner) {
        for (const sig of presentSigs(ctx.selectors, ["setBlocked(address,bool)", "setBlacklist(address,bool)"])) {
          const blocked = await inSnapshot(rpc, async () => {
            const set = await rpc.send(owner, ctx.target, enc(sig, [HOLDER, true]));
            if (!set.ok) return false;
            const d2 = hookSigs.includes(demoShape) ? enc(demoShape, [HOLDER, "0x", "0x", "0x"]) : data!.replace(STRANGER.slice(2), HOLDER.slice(2));
            return !(await rpc.call(ctx.target, d2)).ok;
          });
          if (blocked) {
            findings.push(
              makeFinding({
                key: "uniswap-v4-hook:owner-block",
                title: "Hook owner can block swaps for any address",
                plain: "The hook's owner can stop chosen addresses from swapping in pools that use this hook, which can trap sellers.",
                severity: "high",
                category: "sell-restriction",
                exposure: "privilege",
                sources: ["fork"],
                technical: `After the owner called ${sig} on the private fork, beforeSwap reverted for that swapper.`,
                location: sig,
                recommendation: "Avoid pools whose hook can block swappers. Projects: remove per-address blocking from hooks.",
                proof: proof(ctx, `probe:hook:block:${sig}`, ["owner blocked a swapper", "beforeSwap reverted for that swapper"]),
              }),
            );
            break;
          }
        }
      }
    }
    coverage.push({ check: "Uniswap v4 hook callbacks", status: "ran" });
  }

  return { findings, coverage, facts };
}

export function decodeUint(hex: string) {
  return decodeAbiParameters([{ type: "uint256" }], hex as `0x${string}`)[0];
}
