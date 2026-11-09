// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice DEMO ONLY. Admin actions authorised by an ECDSA signature (ecrecover).
/// Used to show the quantum-readiness contract check. Also missing a nonce, so a
/// signature can be replayed.
contract SignatureGate {
    address public signer;
    uint256 public limit;

    constructor(address s) {
        signer = s;
    }

    function setLimit(uint256 newLimit, uint8 v, bytes32 r, bytes32 s) external {
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encode(address(this), newLimit))));
        require(ecrecover(digest, v, r, s) == signer, "bad sig");
        limit = newLimit;
    }
}
