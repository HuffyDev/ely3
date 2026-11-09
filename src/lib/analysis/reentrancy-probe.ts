import fs from "node:fs";
import path from "node:path";
import { encodeFunctionData, parseAbiItem, type AbiFunction } from "viem";
import { ForkRpc } from "./fork";
import { SIGS, selectorOf } from "./signatures";
import { makeFinding } from "./evidence";
import type { Finding, ForkProof } from "./types";
import type { ProbeContext } from "./probes";

/**
 * Reentrancy confirmation on a private fork.
 *
 * For a target exposing a deposit/withdraw style pair, we deploy a disposable attacker contract
 * (ReentrancyAttacker) onto the fork, seed the target with a victim deposit, and let the attacker
 * re-enter withdraw(). If the attacker ends with more ETH than it put in, the reentrancy is real.
 * This only ever runs against a private local fork; the attacker is never deployed anywhere else.
 */

const ATTACKER_ARTIFACT = path.join(process.cwd(), "contracts", "out", "ReentrancyAttacker.sol", "ReentrancyAttacker.json");
const ATTACKER = "0x00000000000000000000000000000000005a3e77"; // deterministic probe address on the fork
const VICTIM = "0x00000000000000000000000000000000005a3e88";

function enc(sig: string, args: unknown[] = []) {
  const item = parseAbiItem(`function ${sig}`) as AbiFunction;
  return encodeFunctionData({ abi: [item], functionName: item.name, args });
}
const word = (hex?: string) => (hex && hex.length >= 66 ? BigInt(hex.slice(0, 66)) : 0n);

export async function runReentrancyProbe(ctx: ProbeContext): Promise<Finding[]> {
  if (!fs.existsSync(ATTACKER_ARTIFACT)) return [];
  const rpc = new ForkRpc(ctx.fork);

  // Find a deposit/withdraw pair present in the target.
  let pair: [string, string] | null = null;
  for (const [dep, wit] of SIGS.reentrancyPair) {
    if (ctx.selectors.has(selectorOf(dep)) && ctx.selectors.has(selectorOf(wit))) {
      pair = [dep, wit];
      break;
    }
  }
  if (!pair) return [];
  const [depositSig, withdrawSig] = pair;
  const withdrawTakesAmount = withdrawSig.includes("uint");

  const art = JSON.parse(fs.readFileSync(ATTACKER_ARTIFACT, "utf8")) as { bytecode: { object: string }; deployedBytecode: { object: string } };
  const runtime = "0x" + art.deployedBytecode.object.replace(/^0x/, "");

  const id = await rpc.snapshot();
  try {
    // Place the attacker runtime code directly at a known address.
    await rpc.setCode(ATTACKER, runtime);
    await rpc.setBalance(ATTACKER, 2n * 10n ** 18n);

    // Seed the target with a victim deposit so there is something to steal.
    await rpc.setBalance(VICTIM, 20n * 10n ** 18n);
    const victimDeposit = await rpc.send(VICTIM, ctx.target, enc(depositSig), 5n * 10n ** 18n);
    if (!victimDeposit.ok) return [];

    const depositCalldata = enc(depositSig);
    const withdrawCalldata = withdrawTakesAmount ? enc(withdrawSig, [10n ** 18n]) : enc(withdrawSig);
    const attack = enc("run(address,bytes,bytes)", [ctx.target, depositCalldata, withdrawCalldata]);
    const res = await rpc.send(ATTACKER, ATTACKER, attack, 10n ** 18n);
    if (!res.ok) return [];

    const profitRes = await rpc.call(ATTACKER, enc("profit()"));
    const profit = profitRes.ok ? word(profitRes.data) : 0n;
    if (profit > 0n) {
      const proof: ForkProof = {
        forkChainId: ctx.fork.chainId,
        liveChainId: ctx.fork.liveChainId,
        forkBlock: ctx.fork.forkBlock,
        test: "probe:reentrancy",
        observations: [
          `A victim deposited 5 ETH into ${depositSig}`,
          `An attacker deposited 1 ETH and re-entered ${withdrawSig} from its receive() hook`,
          `The attacker ended with more ETH than it deposited (net gain observed)`,
        ],
        passed: true,
      };
      return [
        makeFinding({
          key: "reentrancy:withdraw",
          title: "Funds can be drained by reentrancy",
          plain: "A malicious contract can repeatedly re-enter the withdraw path and take more than it deposited — including other users' funds.",
          severity: "critical",
          category: "reentrancy",
          exposure: "exploitable",
          sources: ["fork"],
          technical: `On the private fork, an attacker contract re-entered ${withdrawSig} during the external ETH transfer and withdrew more than it deposited. The balance is updated after the external call (classic checks-effects-interactions violation).`,
          location: withdrawSig,
          recommendation: "Update balances before making the external call, or add a reentrancy guard (for example OpenZeppelin's nonReentrant).",
          proof,
        }),
      ];
    }
    return [];
  } finally {
    await rpc.revert(id);
  }
}
