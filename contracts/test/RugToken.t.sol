// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {RugToken} from "../src/demo/RugToken.sol";

/// Proofs for the owner-power findings, on our own demo token.
contract RugTokenTest is TestBase {
    RugToken token;
    address holder = address(0xB0B);
    address buyer = address(0xCAFE);

    function setUp() public {
        token = new RugToken(1_000_000e18);
        token.transfer(holder, 1_000e18);
    }

    function test_ownerCanMintUnlimited() public {
        uint256 before = token.totalSupply();
        token.mint(address(this), 1e30);
        assertTrue(token.totalSupply() == before + 1e30, "mint did not increase supply");
    }

    function test_ownerCanFreezeHolder() public {
        token.setBlacklist(holder, true);
        vm.prank(holder);
        vm.expectRevert(bytes("blacklisted"));
        token.transfer(buyer, 1e18);
    }

    function test_ownerCanBlockSells() public {
        token.setTradingEnabled(false);
        vm.prank(holder);
        vm.expectRevert(bytes("trading off"));
        token.transfer(buyer, 1e18);
    }

    function test_ownerCanSetSellTaxTo100Percent() public {
        token.setSellFee(10_000);
        address pair = token.pair();
        vm.prank(holder);
        token.transfer(pair, 100e18);
        assertEq(token.balanceOf(pair), 0, "pair should receive nothing at 100% tax");
    }

    /// Fuzz: a non-owner can never mint.
    function testFuzz_nonOwnerCannotMint(address caller, uint256 amount) public {
        vm.assume(caller != address(this));
        vm.prank(caller);
        vm.expectRevert(bytes("not owner"));
        token.mint(caller, amount);
    }
}
