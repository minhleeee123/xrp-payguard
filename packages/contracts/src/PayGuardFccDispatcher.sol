// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { ITeeExtensionRegistry } from "./interfaces/ITeeExtensionRegistry.sol";
import { ITeeMachineRegistry } from "./interfaces/ITeeMachineRegistry.sol";

/// @notice Coston2 FCC dispatcher for PayGuard's public PING and evaluation payloads.
/// @dev Evaluation messages contain only public request/checkpoint state. This
/// contract never accepts a decision, signature, policy, or ciphertext. The
/// recipient machines compute the decision from independently custodied policy.
contract PayGuardFccDispatcher {
    uint256 private constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;
    uint256 private constant MAX_EVALUATION_MESSAGE_BYTES = 32_768;

    uint256 public constant COSTON2_CHAIN_ID = 114;
    uint16 public constant FOUNDATION_SCHEMA_VERSION = 1;
    bytes32 public constant FOUNDATION_DOMAIN = keccak256("PAYGUARD_FCC_FOUNDATION_V1");
    bytes32 public constant CODE_VERSION = keccak256("0.1.0-payguard");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_TYPE = bytes32("PAYGUARD");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_COMMAND_PING = bytes32("PING_V1");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_COMMAND_EVALUATE = bytes32("EVALUATE_V1");

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

    error DuplicateMachine();
    error ExtensionIdAlreadySet();
    error InvalidExtensionId();
    error InvalidInstructionId();
    error InvalidMachine();
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
    event EvaluationDispatched(
        bytes32 indexed instructionId, bytes32 indexed payloadHash, address[3] teeIds
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
        ) revert InvalidRegistry();
        teeExtensionRegistry = extensionRegistry;
        teeMachineRegistry = machineRegistry;
        owner = msg.sender;
    }

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
        ) revert InvalidExtensionId();
        extensionId = candidate;
        emit ExtensionIdConfigured(candidate);
    }

    function getExtensionId() external view returns (uint256) {
        return extensionId;
    }

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
        instructionId = _send(teeIds, OP_COMMAND_PING, abi.encode(request), msg.sender);
        emit FoundationPingDispatched(
            instructionId, requestNonce, _foundationBindingHash(request), teeIds[0]
        );
    }

    /// @notice Sends one exact public request/state payload to all three frozen machines.
    /// @dev The caller cannot provide ALLOW/DENY; malformed or unavailable state
    /// is rejected by the extension. Canonical release tooling must independently
    /// reconcile this public payload with the router/vault checkpoints.
    function sendEvaluation(
        address[3] calldata teeIds,
        bytes calldata message
    ) external payable returns (bytes32 instructionId) {
        if (msg.sender != owner) revert Unauthorized();
        if (
            extensionId == 0 || message.length == 0 || message.length > MAX_EVALUATION_MESSAGE_BYTES
        ) {
            revert InvalidRequest();
        }
        if (teeIds[0] == address(0) || teeIds[1] == address(0) || teeIds[2] == address(0)) {
            revert InvalidMachine();
        }
        if (teeIds[0] == teeIds[1] || teeIds[0] == teeIds[2] || teeIds[1] == teeIds[2]) {
            revert DuplicateMachine();
        }
        address[] memory recipients = new address[](3);
        recipients[0] = teeIds[0];
        recipients[1] = teeIds[1];
        recipients[2] = teeIds[2];
        instructionId = _send(recipients, OP_COMMAND_EVALUATE, message, msg.sender);
        emit EvaluationDispatched(instructionId, keccak256(message), teeIds);
    }

    function foundationBindingHash(
        FoundationRequest calldata request
    ) external pure returns (bytes32) {
        return _foundationBindingHash(request);
    }

    function _send(
        address[] memory teeIds,
        bytes32 command,
        bytes memory message,
        address claimBackAddress
    ) private returns (bytes32 instructionId) {
        address[] memory cosigners = new address[](0);
        ITeeExtensionRegistry.TeeInstructionParams memory params =
            ITeeExtensionRegistry.TeeInstructionParams({
                opType: OP_TYPE,
                opCommand: command,
                message: message,
                cosigners: cosigners,
                cosignersThreshold: 0,
                claimBackAddress: claimBackAddress
            });
        instructionId = teeExtensionRegistry.sendInstructions{ value: msg.value }(teeIds, params);
        if (instructionId == bytes32(0)) revert InvalidInstructionId();
    }

    function _foundationBindingHash(
        FoundationRequest memory request
    ) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                FOUNDATION_DOMAIN,
                OP_TYPE,
                OP_COMMAND_PING,
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

