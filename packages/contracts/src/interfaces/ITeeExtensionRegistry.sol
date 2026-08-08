// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Minimal interface for the official Flare Confidential Compute extension registry.
/// @dev Replace with the supported Flare package interface once it is published there.
interface ITeeExtensionRegistry {
    struct TeeInstructionParams {
        bytes32 opType;
        bytes32 opCommand;
        bytes message;
        address[] cosigners;
        uint64 cosignersThreshold;
        address claimBackAddress;
    }

    function sendInstructions(
        address[] calldata teeIds,
        TeeInstructionParams calldata params
    ) external payable returns (bytes32 instructionId);

    function nextPublicExtensionId() external view returns (uint256);

    function getTeeExtensionInstructionsSender(
        uint256 extensionId
    ) external view returns (address);
}
