// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title AccessControlBug
/// @notice Intentionally broken access control: `setOwner` is missing a guard,
///         so anyone can take over and drain the treasury.
contract AccessControlBug {
    address public owner;
    uint256 public treasury;

    event OwnerChanged(address indexed previous, address indexed next);
    event Drain(address indexed by, uint256 amount);

    constructor() payable {
        owner = msg.sender;
        treasury = msg.value;
    }

    /// @dev BUG: forgot `onlyOwner` modifier.
    function setOwner(address next) external {
        emit OwnerChanged(owner, next);
        owner = next;
    }

    function drain() external {
        require(msg.sender == owner, "not owner");
        uint256 amount = treasury;
        treasury = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
        emit Drain(msg.sender, amount);
    }

    receive() external payable {
        treasury += msg.value;
    }
}
