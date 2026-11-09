// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice DEMO control — a reentrancy-SAFE vault (checks-effects-interactions + guard).
/// The scanner must NOT confirm a drain here (true negative).
contract SafeVault {
    mapping(address => uint256) public balances;
    uint256 private _locked;

    modifier nonReentrant() {
        require(_locked == 0, "reentrant");
        _locked = 1;
        _;
        _locked = 0;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "nothing");
        balances[msg.sender] = 0; // effect before interaction
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
    }
}

/// @notice DEMO control — a plain Ownable token with a hard-capped fee (max 5%), no mint,
/// no blacklist, no trading switch. Owner exists but holds no dangerous power.
/// The scanner should find NOTHING confirmed here (false-positive check for benign ownership).
