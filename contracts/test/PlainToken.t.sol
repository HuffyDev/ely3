// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {PlainToken} from "../src/demo/PlainToken.sol";

contract PlainTokenTest is TestBase {
    PlainToken token;

    function setUp() public {
        token = new PlainToken(1_000e18);
    }

    /// Fuzz: transfers conserve supply.
    function testFuzz_transferConservesSupply(address to, uint256 amount) public {
        vm.assume(to != address(this) && to != address(0));
        amount = amount % 1_000e18;
        token.transfer(to, amount);
        assertEq(token.balanceOf(to) + token.balanceOf(address(this)), 1_000e18, "supply changed");
    }
}
