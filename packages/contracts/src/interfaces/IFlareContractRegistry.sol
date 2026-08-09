// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Minimal supported Flare Contract Registry boundary used by PayGuard.
interface IFlareContractRegistry {
    function getContractAddressByName(
        string calldata name
    ) external view returns (address contractAddress);
}
