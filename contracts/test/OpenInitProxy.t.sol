// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {OpenInitImpl, DemoProxy} from "../src/demo/OpenInitProxy.sol";

contract OpenInitProxyTest is TestBase {
    OpenInitImpl proxied;
    address deployer = address(0xD3);
    address stranger = address(0xBAD);

    function setUp() public {
        OpenInitImpl impl = new OpenInitImpl();
        DemoProxy proxy = new DemoProxy(address(impl), deployer);
        proxied = OpenInitImpl(address(proxy));
        proxied.initialize(deployer);
        vm.deal(address(this), 5 ether);
        proxied.fund{value: 5 ether}();
    }

    function test_anyoneCanReinitialiseAndTakeOwnership() public {
        vm.prank(stranger);
        proxied.initialize(stranger);
        assertTrue(proxied.owner() == stranger, "owner unchanged");
    }

    function test_singleKeyCanReplaceCode() public {
        OpenInitImpl other = new OpenInitImpl();
        vm.prank(deployer);
        proxied.upgradeTo(address(other));
        bytes32 slot = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
        address impl = address(uint160(uint256(vm.load(address(proxied), slot))));
        assertTrue(impl == address(other), "implementation not replaced");
    }
}
