// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice DEMO ONLY. Implementation whose initializer anyone can call, and which can
/// be upgraded by a single key through an EIP-1967 proxy.
contract OpenInitImpl {
    address public owner;
    uint256 public treasury;

    bytes32 internal constant IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    function initialize(address newOwner) external {
        owner = newOwner; // missing "already initialised" check
    }

    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "not owner");
        owner = newOwner;
    }

    function upgradeTo(address newImpl) external {
        require(msg.sender == owner, "not owner");
        assembly {
            sstore(IMPL_SLOT, newImpl)
        }
    }

    function fund() external payable {
        treasury += msg.value;
    }

    function sweep(address payable to) external {
        require(msg.sender == owner, "not owner");
        uint256 amount = address(this).balance;
        treasury = 0;
        to.transfer(amount);
    }
}

contract DemoProxy {
    bytes32 internal constant IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    bytes32 internal constant ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    constructor(address impl, address admin) {
        assembly {
            sstore(IMPL_SLOT, impl)
            sstore(ADMIN_SLOT, admin)
        }
    }

    fallback() external payable {
        assembly {
            let impl := sload(IMPL_SLOT)
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    receive() external payable {}
}
