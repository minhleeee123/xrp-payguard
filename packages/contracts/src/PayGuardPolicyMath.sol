// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Shared checked arithmetic for public FTSO-denominated policy inputs.
/// It is a reference primitive for FCC cross-language agreement; it does not
/// evaluate or expose private policy rules on-chain.
library PayGuardPolicyMath {
    error InvalidPrice();
    error InvalidDecimals();
    error MultiplicationOverflow();

    /// @notice Returns ceil(amount * price / 10**priceDecimals).
    function referenceValueV1(
        uint256 amount,
        uint256 price,
        uint8 priceDecimals
    ) internal pure returns (uint256) {
        if (price == 0) revert InvalidPrice();
        if (priceDecimals > 36) revert InvalidDecimals();
        if (amount != 0 && price > type(uint256).max / amount) {
            revert MultiplicationOverflow();
        }
        uint256 product = amount * price;
        uint256 scale = 10 ** uint256(priceDecimals);
        uint256 quotient = product / scale;
        return quotient + (product % scale == 0 ? 0 : 1);
    }
}
