import { toFunctionSelector } from "viem";

/** Function signatures the probes and bytecode checks look for. Selector → signature is computed, not hardcoded. */
export const SIGS = {
  owner: ["owner()", "getOwner()", "admin()"],
  erc20: ["totalSupply()", "balanceOf(address)", "transfer(address,uint256)"],
  pairGetter: ["pair()", "uniswapV2Pair()", "lpPair()", "uniswapPair()", "mainPair()"],
  mint: ["mint(address,uint256)", "mintTo(address,uint256)", "issue(address,uint256)", "mint(uint256)"],
  blacklist: [
    "setBlacklist(address,bool)",
    "blacklist(address)",
    "addToBlacklist(address)",
    "setBot(address,bool)",
    "setBlocked(address,bool)",
    "freeze(address)",
    "setIsBlacklisted(address,bool)",
  ],
  tradingSwitch: ["setTradingEnabled(bool)", "enableTrading(bool)", "setTrading(bool)", "setSwapEnabled(bool)", "pause()"],
  feeSetter: ["setSellFee(uint256)", "setFee(uint256)", "setSellTax(uint256)", "setTaxFee(uint256)", "setFees(uint256,uint256)", "setTaxes(uint256,uint256)", "setHookFee(uint24)"],
  takeover: ["initialize(address)", "initialize()", "transferOwnership(address)", "setOwner(address)", "changeOwner(address)"],
  upgrade: ["upgradeTo(address)", "upgradeToAndCall(address,bytes)"],
  selfdestructish: ["kill()", "destroy()", "selfDestruct()"],
  arbitraryCall: ["execute(address,bytes)", "call(address,uint256,bytes)", "multicall(address[],bytes[])", "execute(address,uint256,bytes)"],
  permit: ["permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"],
  // Spot price sources that a single trade can move (manipulable), vs. a feed (not the same risk).
  spotOracle: ["getReserves()", "slot0()", "getAmountsOut(uint256,address[])"],
  feedOracle: ["latestAnswer()", "latestRoundData()", "getRoundData(uint80)"],
  borrowLike: ["borrow(uint256)", "borrow(uint256,address)", "mint(uint256)", "mint(address,uint256)", "openPosition(uint256)", "leverage(uint256)"],
  priceGetter: ["price()", "getPrice()", "getPrice(address)", "currentPrice()", "assetPrice(address)"],
  hook: [
    "getHookPermissions()",
    "beforeSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),bytes)",
    "afterSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),int256,bytes)",
    "beforeSwap(address,bytes,bytes,bytes)",
  ],
  reentrancyPair: [["deposit()", "withdraw()"], ["deposit()", "withdraw(uint256)"], ["stake()", "unstake()"]] as [string, string][],
} as const;

const cache = new Map<string, string>();
export function selectorOf(sig: string): string {
  let s = cache.get(sig);
  if (!s) {
    s = toFunctionSelector(sig).toLowerCase();
    cache.set(sig, s);
  }
  return s;
}

export function presentSigs(selectors: Set<string>, sigs: readonly string[]): string[] {
  return sigs.filter((s) => selectors.has(selectorOf(s)));
}
