// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Minimal interface for the official Flare Confidential Compute machine registry.
/// @dev Replace with the supported Flare package interface once it is published there.
interface ITeeMachineRegistry {
    function getRandomTeeIds(
        uint256 extensionId,
        uint256 count
    ) external view returns (address[] memory teeIds);
}
