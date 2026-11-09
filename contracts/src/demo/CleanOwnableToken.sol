// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice DEMO control — a reentrancy-SAFE vault (checks-effects-interactions + guard).
/// The scanner must NOT confirm a drain here (true negative).
contract SafeVault {
    mapping(address => uint256) public balances;
    uint256 private _locked;

    modifier nonReentrant() {
        require(_locked == 0, "reentrant");
        _locked = 1;
        _;
        _locked = 0;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "nothing");
        balances[msg.sender] = 0; // effect before interaction
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
    }
}

/// @notice DEMO control — a plain Ownable token with a hard-capped fee (max 5%), no mint,
/// no blacklist, no trading switch. Owner exists but holds no dangerous power.
/// The scanner should find NOTHING confirmed here (false-positive check for benign ownership).
contract CleanOwnableToken {
    string public name = "Clean Ownable";
    string public symbol = "CLEAN";
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;
    address public owner;
    address public pair;
    uint256 public feeBps; // capped at 500 (5%)

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(uint256 supply) {
        owner = msg.sender;
        totalSupply = supply;
        balanceOf[msg.sender] = supply;
        pair = address(uint160(uint256(keccak256("clean-pair"))));
        emit Transfer(address(0), msg.sender, supply);
    }

    /// Owner may set a fee, but it is hard-capped at 5% in code — not a rug lever.
    function setFee(uint256 bps) external {
        require(msg.sender == owner, "not owner");
        require(bps <= 500, "fee too high");
        feeBps = bps;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        uint256 fee = (to == pair) ? (amount * feeBps) / 10_000 : 0;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - fee;
        if (fee > 0) balanceOf[owner] += fee;
        emit Transfer(from, to, amount - fee);
    }
}

/// @notice DEMO — owner can mint unlimited, but NO blacklist / trading switch / tax.
/// Isolates hidden-mint detection.
