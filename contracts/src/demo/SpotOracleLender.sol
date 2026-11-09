// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

/// @notice DEMO ONLY. Minimal constant-product pair with no fee.
contract DemoPair {
    IERC20Like public immutable token0;
    IERC20Like public immutable token1;
    uint112 public reserve0;
    uint112 public reserve1;

    constructor(IERC20Like t0, IERC20Like t1) {
        token0 = t0;
        token1 = t1;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, 0);
    }

    function sync() public {
        reserve0 = uint112(token0.balanceOf(address(this)));
        reserve1 = uint112(token1.balanceOf(address(this)));
    }

    /// Sends `amountOut` of token1 for token0 already transferred in (or vice versa).
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external {
        if (amount0Out > 0) token0.transfer(to, amount0Out);
        if (amount1Out > 0) token1.transfer(to, amount1Out);
        uint256 b0 = token0.balanceOf(address(this));
        uint256 b1 = token1.balanceOf(address(this));
        require(b0 * b1 >= uint256(reserve0) * uint256(reserve1), "K");
        reserve0 = uint112(b0);
        reserve1 = uint112(b1);
    }
}

/// @notice DEMO ONLY. Prices collateral with the pair's spot reserves, which one trade can move.
contract SpotOracleLender {
    DemoPair public immutable pair;
    IERC20Like public immutable collateral; // token0
    IERC20Like public immutable debt; // token1
    mapping(address => uint256) public collateralOf;
    mapping(address => uint256) public debtOf;

    constructor(DemoPair p) {
        pair = p;
        collateral = p.token0();
        debt = p.token1();
    }

    function price() public view returns (uint256) {
        (uint112 r0, uint112 r1, ) = pair.getReserves();
        return (uint256(r1) * 1e18) / uint256(r0);
    }

    function depositCollateral(uint256 amount) external {
        collateral.transferFrom(msg.sender, address(this), amount);
        collateralOf[msg.sender] += amount;
    }

    function borrow(uint256 amount) external {
        uint256 value = (collateralOf[msg.sender] * price()) / 1e18;
        require(debtOf[msg.sender] + amount <= (value * 80) / 100, "undercollateralised");
        debtOf[msg.sender] += amount;
        debt.transfer(msg.sender, amount);
    }
}
