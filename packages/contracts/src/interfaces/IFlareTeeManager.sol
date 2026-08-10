// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Read-only subset of the official FlareTeeManager used by PayGuard.
/// @dev The release manifest must bind the deployed manager address resolved
/// from the supported Flare source. Keeping the address constructor-bound
/// avoids silently changing the authority of an already deployed registry.
interface IFlareTeeManager {
    struct TeeMachine {
        address teeId;
        address teeProxyId;
        string url;
    }

    struct TeeMachineAttestation {
        address teeId;
        address initialTeeId;
        string url;
        bytes32 codeHash;
        bytes32 platform;
    }

    function getTeeMachine(
        address teeId
    ) external view returns (TeeMachine memory machine);

    function getTeeMachineWithAttestationData(
        address teeId
    ) external view returns (TeeMachineAttestation memory attestation);

    function getTeeMachineStatus(
        address teeId
    ) external view returns (uint8 status);

    function getExtensionId(
        address teeId
    ) external view returns (uint256 extensionId);

    function isCodeHashPlatformSupported(
        uint256 extensionId,
        bytes32 codeHash,
        bytes32 platform
    ) external view returns (bool supported);

    function isCodeHashPlatformDisabled(
        uint256 extensionId,
        bytes32 codeHash,
        bytes32 platform
    ) external view returns (bool disabled);
}
