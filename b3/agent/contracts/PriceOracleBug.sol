// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title PriceOracleBug
/// @notice Pulls "price" from a single setter the deployer forgot to lock down.
///         A flash-style sequence can move the reported price arbitrarily, and
///         `liquidate` uses that price unguarded.
interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract PriceOracleBug {
    address public deployer;
    IERC20Like public collateral;
    uint256 public priceWeiPerToken; // BUG: anyone can set
    mapping(address => uint256) public debt;

    constructor(address _collateral) {
        deployer = msg.sender;
        collateral = IERC20Like(_collateral);
        priceWeiPerToken = 1 ether;
    }

    /// @dev BUG: should be onlyDeployer + TWAP / Chainlink.
    function setPrice(uint256 newPrice) external {
        priceWeiPerToken = newPrice;
    }

    function borrow(uint256 amountWei) external {
        debt[msg.sender] += amountWei;
        (bool ok, ) = msg.sender.call{value: amountWei}("");
        require(ok, "send failed");
    }

    function liquidate(address victim) external {
        uint256 collateralAmt = collateral.balanceOf(victim);
        // Vulnerable: use of mutable price as if it were ground truth.
        uint256 valueWei = collateralAmt * priceWeiPerToken;
        require(valueWei < debt[victim], "still solvent");
        collateral.transfer(msg.sender, collateralAmt);
        delete debt[victim];
    }

    receive() external payable {}
}
