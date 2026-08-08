// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardFoundationSender } from "../src/PayGuardFoundationSender.sol";
import { ITeeExtensionRegistry } from "../src/interfaces/ITeeExtensionRegistry.sol";
import { ITeeMachineRegistry } from "../src/interfaces/ITeeMachineRegistry.sol";
import { TestBase } from "./TestBase.sol";

contract FoundationRegistryMock is ITeeExtensionRegistry {
    uint256 public nextId = 66_002;
    mapping(uint256 => address) public senderById;
    bytes32 public instructionId = keccak256("PAYGUARD_FOUNDATION_INSTRUCTION");

    address public selectedTee;
    bytes32 public opType;
    bytes32 public opCommand;
    bytes public message;
    uint256 public cosignerCount;
    uint64 public cosignersThreshold;
    address public claimBackAddress;

    function setNextId(
        uint256 value
    ) external {
        nextId = value;
    }

    function setSender(
        uint256 id,
        address sender
    ) external {
        senderById[id] = sender;
    }

    function setInstructionId(
        bytes32 value
    ) external {
        instructionId = value;
    }

    function nextPublicExtensionId() external view returns (uint256) {
        return nextId;
    }

    function getTeeExtensionInstructionsSender(
        uint256 id
    ) external view returns (address) {
        return senderById[id];
    }

    function sendInstructions(
        address[] calldata teeIds,
        TeeInstructionParams calldata params
    ) external payable returns (bytes32) {
        selectedTee = teeIds[0];
        opType = params.opType;
        opCommand = params.opCommand;
        message = params.message;
        cosignerCount = params.cosigners.length;
        cosignersThreshold = params.cosignersThreshold;
        claimBackAddress = params.claimBackAddress;
        return instructionId;
    }
}

contract FoundationMachineRegistryMock is ITeeMachineRegistry {
    uint256 public expectedExtensionId = 66_001;
    address public selectedTee = address(0xFCCA);
    uint256 public responseCount = 1;

    function setSelectedTee(
        address value
    ) external {
        selectedTee = value;
    }

    function setResponseCount(
        uint256 value
    ) external {
        responseCount = value;
    }

    function getRandomTeeIds(
        uint256 id,
        uint256 count
    ) external view returns (address[] memory ids) {
        if (id != expectedExtensionId || count != 1) return new address[](0);
        ids = new address[](responseCount);
        if (responseCount != 0) ids[0] = selectedTee;
    }
}

contract PayGuardFoundationSenderTest is TestBase {
    uint256 private constant EXTENSION_ID = 66_001;
    address private constant CALLER = address(0xCA11);
    address private constant VECTOR_SENDER = address(0x1000000000000000000000000000000000000001);
    bytes32 private constant NONCE = bytes32(uint256(0x1234));
    bytes32 private constant PAYLOAD_HASH = bytes32(uint256(0xabcd));

    FoundationRegistryMock private extensionRegistry;
    FoundationMachineRegistryMock private machineRegistry;
    PayGuardFoundationSender private sender;

    function setUp() public {
        vm.chainId(114);
        extensionRegistry = new FoundationRegistryMock();
        machineRegistry = new FoundationMachineRegistryMock();
        sender = new PayGuardFoundationSender(extensionRegistry, machineRegistry);
        extensionRegistry.setSender(EXTENSION_ID, address(sender));
    }

    function testConstructorRejectsMissingRegistryContracts() external {
        vm.expectRevert(PayGuardFoundationSender.InvalidRegistry.selector);
        new PayGuardFoundationSender(
            ITeeExtensionRegistry(address(0)), ITeeMachineRegistry(address(machineRegistry))
        );

        vm.expectRevert(PayGuardFoundationSender.InvalidRegistry.selector);
        new PayGuardFoundationSender(
            ITeeExtensionRegistry(address(0x1234)), ITeeMachineRegistry(address(machineRegistry))
        );
    }

    function testConstructorRejectsWrongChain() external {
        vm.chainId(115);
        vm.expectRevert(PayGuardFoundationSender.WrongChain.selector);
        new PayGuardFoundationSender(extensionRegistry, machineRegistry);
    }

    function testExplicitBindingAcceptsOnlyExactAssignedPublicId() external {
        sender.setExtensionIdExplicit(EXTENSION_ID);
        assertEq(sender.getExtensionId(), EXTENSION_ID);
        assertEq(sender.owner(), address(this));

        vm.expectRevert(PayGuardFoundationSender.ExtensionIdAlreadySet.selector);
        sender.setExtensionIdExplicit(EXTENSION_ID);
    }

    function testExplicitBindingRejectsUnauthorizedReservedFutureAndForeignIds() external {
        vm.prank(CALLER);
        vm.expectRevert(PayGuardFoundationSender.Unauthorized.selector);
        sender.setExtensionIdExplicit(EXTENSION_ID);

        vm.expectRevert(PayGuardFoundationSender.InvalidExtensionId.selector);
        sender.setExtensionIdExplicit(65_535);

        vm.expectRevert(PayGuardFoundationSender.InvalidExtensionId.selector);
        sender.setExtensionIdExplicit(66_002);

        vm.expectRevert(PayGuardFoundationSender.InvalidExtensionId.selector);
        sender.setExtensionIdExplicit(66_000);
    }

    function testDispatchConstructsExactDomainAndClaimsBackToCaller() external {
        sender.setExtensionIdExplicit(EXTENSION_ID);

        vm.prank(CALLER);
        bytes32 instructionId = sender.sendFoundationPing(NONCE, PAYLOAD_HASH);
        assertEq(instructionId, extensionRegistry.instructionId());
        assertEq(extensionRegistry.selectedTee(), machineRegistry.selectedTee());
        assertEq(extensionRegistry.opType(), sender.OP_TYPE());
        assertEq(extensionRegistry.opCommand(), sender.OP_COMMAND());
        assertEq(extensionRegistry.cosignerCount(), 0);
        assertEq(uint256(extensionRegistry.cosignersThreshold()), 0);
        assertEq(extensionRegistry.claimBackAddress(), CALLER);

        PayGuardFoundationSender.FoundationRequest memory request =
            abi.decode(extensionRegistry.message(), (PayGuardFoundationSender.FoundationRequest));
        assertEq(uint256(request.schemaVersion), 1);
        assertEq(request.chainId, 114);
        assertEq(request.sender, address(sender));
        assertEq(request.extensionId, EXTENSION_ID);
        assertEq(request.codeVersion, keccak256("0.1.0-payguard"));
        assertEq(request.requestNonce, NONCE);
        assertEq(request.payloadHash, PAYLOAD_HASH);
    }

    function testDispatchRejectsUnsetEmptyAndInvalidMachineSelection() external {
        vm.expectRevert(PayGuardFoundationSender.InvalidRequest.selector);
        sender.sendFoundationPing(NONCE, PAYLOAD_HASH);

        sender.setExtensionIdExplicit(EXTENSION_ID);
        vm.expectRevert(PayGuardFoundationSender.InvalidRequest.selector);
        sender.sendFoundationPing(bytes32(0), PAYLOAD_HASH);
        vm.expectRevert(PayGuardFoundationSender.InvalidRequest.selector);
        sender.sendFoundationPing(NONCE, bytes32(0));

        machineRegistry.setResponseCount(0);
        vm.expectRevert(PayGuardFoundationSender.NoTeeSelected.selector);
        sender.sendFoundationPing(NONCE, PAYLOAD_HASH);

        machineRegistry.setResponseCount(2);
        vm.expectRevert(PayGuardFoundationSender.NoTeeSelected.selector);
        sender.sendFoundationPing(NONCE, PAYLOAD_HASH);

        machineRegistry.setResponseCount(1);
        machineRegistry.setSelectedTee(address(0));
        vm.expectRevert(PayGuardFoundationSender.NoTeeSelected.selector);
        sender.sendFoundationPing(NONCE, PAYLOAD_HASH);
    }

    function testDispatchRejectsEmptyInstructionId() external {
        sender.setExtensionIdExplicit(EXTENSION_ID);
        extensionRegistry.setInstructionId(bytes32(0));
        vm.expectRevert(PayGuardFoundationSender.InvalidInstructionId.selector);
        sender.sendFoundationPing(NONCE, PAYLOAD_HASH);
    }

    function testFoundationBindingGoldenVector() external view {
        PayGuardFoundationSender.FoundationRequest memory request =
            PayGuardFoundationSender.FoundationRequest({
                schemaVersion: 1,
                chainId: 114,
                sender: VECTOR_SENDER,
                extensionId: EXTENSION_ID,
                codeVersion: keccak256("0.1.0-payguard"),
                requestNonce: NONCE,
                payloadHash: PAYLOAD_HASH
            });
        assertEq(
            sender.foundationBindingHash(request),
            0x55f3ec0e0465f6db52b6c4b411e89120a09e7f01740b22a3844ee3685d4f492a
        );
    }
}
