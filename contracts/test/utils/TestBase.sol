// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal cheatcode interface so the repo has no git submodules.
interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function deal(address, uint256) external;
    function expectRevert(bytes calldata) external;
    function expectRevert() external;
    function addr(uint256) external pure returns (address);
    function sign(uint256, bytes32) external pure returns (uint8, bytes32, bytes32);
    function assume(bool) external pure;
    function label(address, string calldata) external;
    function load(address, bytes32) external view returns (bytes32);
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bool public IS_TEST = true;

    function assertTrue(bool c, string memory why) internal pure {
        require(c, why);
    }

    function assertEq(uint256 a, uint256 b, string memory why) internal pure {
        require(a == b, why);
    }
}

abstract contract InvariantBase is TestBase {
    address[] private _targets;

    function targetContract(address t) internal {
        _targets.push(t);
    }

    function targetContracts() public view returns (address[] memory) {
        return _targets;
    }
}
