// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {FeeHook} from "../src/demo/FeeHook.sol";

contract FeeHookTest is TestBase {
    FeeHook hook;
    address pm = address(0x9999);

    function setUp() public {
        hook = new FeeHook(pm);
    }

    function test_callbackDoesNotCheckPoolManager() public {
        vm.prank(address(0xBAD));
        (bytes4 sel, , ) = hook.beforeSwap(address(1), "", "", "");
        assertTrue(sel == FeeHook.beforeSwap.selector, "callable by anyone");
    }

    function test_ownerCanBlockSwapsForAddress() public {
        hook.setBlocked(address(0xB0B), true);
        vm.prank(pm);
        vm.expectRevert(bytes("blocked"));
        hook.beforeSwap(address(0xB0B), "", "", "");
    }

    function test_ownerCanSetHookFeeTo100Percent() public {
        hook.setHookFee(1_000_000);
        (, int256 delta, ) = hook.beforeSwap(address(1), "", "", "");
        assertTrue(delta == 1_000_000, "fee");
    }
}
