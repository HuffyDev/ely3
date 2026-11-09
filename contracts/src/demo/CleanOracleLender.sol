// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFeed {
    function latestAnswer() external view returns (int256);
}

/// @notice DEMO control — prices collateral from a Chainlink-style feed (latestAnswer),
/// not from a spot AMM pool. The oracle-manipulation check should NOT flag this.
contract CleanOracleLender {
    IFeed public immutable feed;
    mapping(address => uint256) public debtOf;

    constructor(IFeed f) {
        feed = f;
    }

    function price() public view returns (uint256) {
        return uint256(feed.latestAnswer());
    }

    function borrow(uint256 amount) external {
        require(amount <= price(), "limit");
        debtOf[msg.sender] += amount;
    }
}

contract FixedFeed is IFeed {
    int256 public answer = 2000e8;
    function latestAnswer() external view returns (int256) {
        return answer;
    }
}
