// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice DEMO ONLY. Shaped like a Uniswap v4 hook (same callback names and permission
/// flags) without depending on v4-core. Problems on purpose:
///  - callbacks don't check msg.sender == poolManager
///  - beforeSwap can return a delta, and the owner can set the hook fee to 100%
///  - the owner can block swaps for any address (a sell restriction)
contract FeeHook {
    struct Permissions {
        bool beforeInitialize;
        bool afterInitialize;
        bool beforeAddLiquidity;
        bool afterAddLiquidity;
        bool beforeRemoveLiquidity;
        bool afterRemoveLiquidity;
        bool beforeSwap;
        bool afterSwap;
        bool beforeDonate;
        bool afterDonate;
        bool beforeSwapReturnDelta;
        bool afterSwapReturnDelta;
        bool afterAddLiquidityReturnDelta;
        bool afterRemoveLiquidityReturnDelta;
    }

    address public immutable poolManager;
    address public owner;
    uint24 public hookFeePips = 3000;
    mapping(address => bool) public blocked;

    constructor(address pm) {
        poolManager = pm;
        owner = msg.sender;
    }

    function getHookPermissions() external pure returns (Permissions memory p) {
        p.beforeSwap = true;
        p.afterSwap = true;
        p.beforeSwapReturnDelta = true;
    }

    function setHookFee(uint24 fee) external {
        require(msg.sender == owner, "not owner");
        require(fee <= 1_000_000, "fee");
        hookFeePips = fee;
    }

    function setBlocked(address who, bool value) external {
        require(msg.sender == owner, "not owner");
        blocked[who] = value;
    }

    /// Same selector shape as v4 IHooks.beforeSwap(address,PoolKey,SwapParams,bytes).
    function beforeSwap(address sender, bytes calldata, bytes calldata, bytes calldata) external view returns (bytes4, int256, uint24) {
        require(!blocked[sender], "blocked");
        int256 delta = int256(uint256(hookFeePips));
        return (this.beforeSwap.selector, delta, 0);
    }

    function afterSwap(address, bytes calldata, int256, bytes calldata) external pure returns (bytes4, int128) {
        return (this.afterSwap.selector, 0);
    }
}
