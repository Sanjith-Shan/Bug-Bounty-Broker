// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title VulnerableVault
/// @notice Intentionally vulnerable demo contract for B³ Demo Day.
///         Anyone can deposit ETH; `withdraw` sends before updating balance,
///         classic re-entrancy. Do not deploy this anywhere serious.
contract VulnerableVault {
    mapping(address => uint256) public balances;

    event Deposit(address indexed sender, uint256 amount);
    event Withdraw(address indexed sender, uint256 amount);

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    /// @dev Vulnerable: external call BEFORE state update (CEI violated).
    ///      `unchecked` on the post-call decrement preserves the classic
    ///      drain pattern even in Solidity 0.8+; without it, safe math
    ///      blocks the second nested withdraw and only steals seed×1.
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient");
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
        unchecked {
            balances[msg.sender] -= amount;
        }
        emit Withdraw(msg.sender, amount);
    }

    function totalBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        balances[msg.sender] += msg.value;
    }
}
