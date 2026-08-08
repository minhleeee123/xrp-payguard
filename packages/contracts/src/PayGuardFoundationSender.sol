// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { ITeeExtensionRegistry } from "./interfaces/ITeeExtensionRegistry.sol";
import { ITeeMachineRegistry } from "./interfaces/ITeeMachineRegistry.sol";

/// @title PayGuardFoundationSender
/// @notice Dispatches a public-safe, domain-bound PING_V1 to one registered FCC machine.
/// @dev This is a foundation gate only. It cannot dispatch or authorize a PayGuard payment.
contract PayGuardFoundationSender {
    uint256 private constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;

    uint256 public constant COSTON2_CHAIN_ID = 114;
    uint16 public constant FOUNDATION_SCHEMA_VERSION = 1;
    uint16 public constant FOUNDATION_SENDER_VERSION = 1;
    bytes32 public constant FOUNDATION_DOMAIN = keccak256("PAYGUARD_FCC_FOUNDATION_V1");
    bytes32 public constant CODE_VERSION = keccak256("0.1.0-payguard");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_TYPE = bytes32("PAYGUARD");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_COMMAND = bytes32("PING_V1");

    ITeeExtensionRegistry public immutable teeExtensionRegistry;
    ITeeMachineRegistry public immutable teeMachineRegistry;
    address public immutable owner;

    uint256 private extensionId;

    struct FoundationRequest {
        uint16 schemaVersion;
        uint256 chainId;
        address sender;
        uint256 extensionId;
        bytes32 codeVersion;
        bytes32 requestNonce;
        bytes32 payloadHash;
    }

    error ExtensionIdAlreadySet();
    error InvalidExtensionId();
    error InvalidInstructionId();
    error InvalidRegistry();
    error InvalidRequest();
    error NoTeeSelected();
    error Unauthorized();
    error WrongChain();

    event ExtensionIdConfigured(uint256 indexed extensionId);
    event FoundationPingDispatched(
        bytes32 indexed instructionId,
        bytes32 indexed requestNonce,
        bytes32 indexed bindingHash,
        address teeId
    );

    constructor(
        ITeeExtensionRegistry extensionRegistry,
        ITeeMachineRegistry machineRegistry
    ) {
        if (block.chainid != COSTON2_CHAIN_ID) revert WrongChain();
        if (
            address(extensionRegistry) == address(0) || address(machineRegistry) == address(0)
                || address(extensionRegistry).code.length == 0
                || address(machineRegistry).code.length == 0
        ) {
            revert InvalidRegistry();
        }
        teeExtensionRegistry = extensionRegistry;
        teeMachineRegistry = machineRegistry;
        owner = msg.sender;
    }

    /// @notice Binds the exact public extension ID assigned to this sender by the registry.
    function setExtensionIdExplicit(
        uint256 candidate
    ) external {
        if (msg.sender != owner) revert Unauthorized();
        if (extensionId != 0) revert ExtensionIdAlreadySet();
        uint256 nextId = teeExtensionRegistry.nextPublicExtensionId();
        if (
            candidate < FIRST_PUBLIC_EXTENSION_ID || candidate >= nextId
                || teeExtensionRegistry.getTeeExtensionInstructionsSender(candidate)
                    != address(this)
        ) {
            revert InvalidExtensionId();
        }
        extensionId = candidate;
        emit ExtensionIdConfigured(candidate);
    }

    function getExtensionId() external view returns (uint256) {
        return extensionId;
    }

    /// @notice Sends one public-safe PING_V1; no private policy or payment data is accepted.
    function sendFoundationPing(
        bytes32 requestNonce,
        bytes32 payloadHash
    ) external payable returns (bytes32 instructionId) {
        uint256 configuredExtensionId = extensionId;
        if (requestNonce == bytes32(0) || payloadHash == bytes32(0) || configuredExtensionId == 0) {
            revert InvalidRequest();
        }

        FoundationRequest memory request = FoundationRequest({
            schemaVersion: FOUNDATION_SCHEMA_VERSION,
            chainId: block.chainid,
            sender: address(this),
            extensionId: configuredExtensionId,
            codeVersion: CODE_VERSION,
            requestNonce: requestNonce,
            payloadHash: payloadHash
        });
        address[] memory teeIds = teeMachineRegistry.getRandomTeeIds(configuredExtensionId, 1);
        if (teeIds.length != 1 || teeIds[0] == address(0)) revert NoTeeSelected();

        address[] memory cosigners = new address[](0);
        ITeeExtensionRegistry.TeeInstructionParams memory params =
            ITeeExtensionRegistry.TeeInstructionParams({
                opType: OP_TYPE,
                opCommand: OP_COMMAND,
                message: abi.encode(request),
                cosigners: cosigners,
                cosignersThreshold: 0,
                claimBackAddress: msg.sender
            });
        instructionId = teeExtensionRegistry.sendInstructions{ value: msg.value }(teeIds, params);
        if (instructionId == bytes32(0)) revert InvalidInstructionId();
        emit FoundationPingDispatched(
            instructionId, requestNonce, _foundationBindingHash(request), teeIds[0]
        );
    }

    function foundationBindingHash(
        FoundationRequest calldata request
    ) external pure returns (bytes32) {
        return _foundationBindingHash(request);
    }

    function _foundationBindingHash(
        FoundationRequest memory request
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                FOUNDATION_DOMAIN,
                OP_TYPE,
                OP_COMMAND,
                request.schemaVersion,
                request.chainId,
                request.sender,
                request.extensionId,
                request.codeVersion,
                request.requestNonce,
                request.payloadHash
            )
        );
    }
}
