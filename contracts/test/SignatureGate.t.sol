// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {SignatureGate} from "../src/demo/SignatureGate.sol";

contract SignatureGateTest is TestBase {
    SignatureGate gate;
    uint256 constant PK = 0xA11CE;

    function setUp() public {
        gate = new SignatureGate(vm.addr(PK));
    }

    function test_signatureCanBeReplayed() public {
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encode(address(gate), uint256(7)))));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PK, digest);
        gate.setLimit(7, v, r, s);
        gate.setLimit(7, v, r, s); // replay accepted: no nonce
        assertEq(gate.limit(), 7, "limit");
    }
}
