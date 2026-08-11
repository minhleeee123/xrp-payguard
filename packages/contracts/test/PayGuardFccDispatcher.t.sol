// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardFccDispatcher } from "../src/PayGuardFccDispatcher.sol";
import { ITeeExtensionRegistry } from "../src/interfaces/ITeeExtensionRegistry.sol";
import { ITeeMachineRegistry } from "../src/interfaces/ITeeMachineRegistry.sol";
import { TestBase } from "./TestBase.sol";

contract DispatcherRegistryMock is ITeeExtensionRegistry {
    uint256 public nextId = 66_038;
    mapping(uint256 => address) public senderById;
    bytes32 public instructionId = keccak256("PAYGUARD_DISPATCH");
    address[] public recipients;
    bytes32 public opType;
    bytes32 public opCommand;
    bytes public message;
    address public claimBackAddress;

    function setSender(
        uint256 id,
        address sender
    ) external {
        senderById[id] = sender;
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
        delete recipients;
        for (uint256 index; index < teeIds.length; index++) {
            recipients.push(teeIds[index]);
        }
        opType = params.opType;
        opCommand = params.opCommand;
        message = params.message;
        claimBackAddress = params.claimBackAddress;
        return instructionId;
    }

    function recipient(
        uint256 index
    ) external view returns (address) {
        return recipients[index];
    }

    function recipientCount() external view returns (uint256) {
        return recipients.length;
    }
}

contract DispatcherMachineRegistryMock is ITeeMachineRegistry {
    function getRandomTeeIds(
        uint256,
        uint256 count
    ) external pure returns (address[] memory ids) {
        ids = new address[](count);
        if (count > 0) ids[0] = address(0xA1);
    }
}

contract PayGuardFccDispatcherTest is TestBase {
    uint256 private constant EXTENSION_ID = 66_037;
    DispatcherRegistryMock private registry;
    DispatcherMachineRegistryMock private machines;
    PayGuardFccDispatcher private dispatcher;

    function setUp() public {
        vm.chainId(114);
        registry = new DispatcherRegistryMock();
        machines = new DispatcherMachineRegistryMock();
        dispatcher = new PayGuardFccDispatcher(registry, machines);
        registry.setSender(EXTENSION_ID, address(dispatcher));
        dispatcher.setExtensionIdExplicit(EXTENSION_ID);
    }

    function testEvaluationDispatchUsesExactlyThreeMachinesAndNoDecisionArgument() external {
        address[3] memory recipients = [address(0xA1), address(0xB2), address(0xC3)];
        bytes memory publicPayload = bytes("{\"request\":{},\"state\":{}}");
        bytes32 instructionId = dispatcher.sendEvaluation(recipients, publicPayload);
        assertEq(instructionId, registry.instructionId());
        assertEq(registry.recipientCount(), 3);
        assertEq(registry.recipient(0), recipients[0]);
        assertEq(registry.recipient(1), recipients[1]);
        assertEq(registry.recipient(2), recipients[2]);
        assertEq(registry.opType(), dispatcher.OP_TYPE());
        assertEq(registry.opCommand(), dispatcher.OP_COMMAND_EVALUATE());
        assertEq(keccak256(registry.message()), keccak256(publicPayload));
        assertEq(registry.claimBackAddress(), address(this));
    }

    function testEvaluationDispatchRejectsUnauthorizedDuplicateEmptyAndOversized() external {
        address[3] memory recipients = [address(0xA1), address(0xB2), address(0xC3)];
        vm.prank(address(0xCA11));
        vm.expectRevert(PayGuardFccDispatcher.Unauthorized.selector);
        dispatcher.sendEvaluation(recipients, bytes("public"));

        recipients[2] = recipients[0];
        vm.expectRevert(PayGuardFccDispatcher.DuplicateMachine.selector);
        dispatcher.sendEvaluation(recipients, bytes("public"));

        recipients[2] = address(0xC3);
        vm.expectRevert(PayGuardFccDispatcher.InvalidRequest.selector);
        dispatcher.sendEvaluation(recipients, bytes(""));

        vm.expectRevert(PayGuardFccDispatcher.InvalidRequest.selector);
        dispatcher.sendEvaluation(recipients, new bytes(32_769));
    }

    function testFoundationPingRemainsAvailable() external {
        bytes32 instructionId =
            dispatcher.sendFoundationPing(bytes32(uint256(1)), bytes32(uint256(2)));
        assertEq(instructionId, registry.instructionId());
        assertEq(registry.opCommand(), dispatcher.OP_COMMAND_PING());
        assertEq(registry.recipientCount(), 1);
    }
}
