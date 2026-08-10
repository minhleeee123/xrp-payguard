// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardActionRouter } from "../src/PayGuardActionRouter.sol";
import { PayGuardPolicyRegistryV2 } from "../src/PayGuardPolicyRegistryV2.sol";
import { PayGuardTypes } from "../src/PayGuardTypes.sol";
import { PayGuardVault } from "../src/PayGuardVault.sol";
import { IFlareTeeManager } from "../src/interfaces/IFlareTeeManager.sol";
import { TestBase } from "./TestBase.sol";

contract FlareTeeManagerMock is IFlareTeeManager {
    struct Entry {
        TeeMachine machine;
        TeeMachineAttestation attestation;
        uint8 status;
        uint256 extensionId;
    }

    mapping(address teeId => Entry entry) private entries;
    bool private codeHashPlatformSupported = true;
    bool private codeHashPlatformDisabled;

    function setMachine(
        address teeId,
        uint256 extensionId,
        bytes32 codeHash,
        bytes32 platform
    ) external {
        entries[teeId] = Entry({
            machine: TeeMachine({
                teeId: teeId,
                teeProxyId: address(uint160(teeId) ^ uint160(1)),
                url: "https://machine.example"
            }),
            attestation: TeeMachineAttestation({
                teeId: teeId,
                initialTeeId: teeId,
                url: "https://machine.example",
                codeHash: codeHash,
                platform: platform
            }),
            status: 2,
            extensionId: extensionId
        });
    }

    function setStatus(
        address teeId,
        uint8 status
    ) external {
        entries[teeId].status = status;
    }

    function setExtensionId(
        address teeId,
        uint256 extensionId
    ) external {
        entries[teeId].extensionId = extensionId;
    }

    function setCodeHash(
        address teeId,
        bytes32 codeHash
    ) external {
        entries[teeId].attestation.codeHash = codeHash;
    }

    function setCodePolicy(
        bool supported,
        bool disabled
    ) external {
        codeHashPlatformSupported = supported;
        codeHashPlatformDisabled = disabled;
    }

    function getTeeMachine(
        address teeId
    ) external view returns (TeeMachine memory) {
        return entries[teeId].machine;
    }

    function getTeeMachineWithAttestationData(
        address teeId
    ) external view returns (TeeMachineAttestation memory) {
        return entries[teeId].attestation;
    }

    function getTeeMachineStatus(
        address teeId
    ) external view returns (uint8) {
        return entries[teeId].status;
    }

    function getExtensionId(
        address teeId
    ) external view returns (uint256) {
        return entries[teeId].extensionId;
    }

    function isCodeHashPlatformSupported(
        uint256,
        bytes32,
        bytes32
    ) external view returns (bool) {
        return codeHashPlatformSupported;
    }

    function isCodeHashPlatformDisabled(
        uint256,
        bytes32,
        bytes32
    ) external view returns (bool) {
        return codeHashPlatformDisabled;
    }
}

contract PayGuardPolicyRegistryV2Test is TestBase {
    uint256 internal constant EXTENSION_ID = 66_037;
    bytes32 internal constant CODE_HASH = keccak256("payguard-code");
    bytes32 internal constant PLATFORM = keccak256("AMD_SEV_SNP");

    FlareTeeManagerMock internal manager;
    PayGuardPolicyRegistryV2 internal registry;
    PayGuardVault internal vault;
    PayGuardActionRouter internal router;
    address internal owner;
    uint256[3] internal machineKeys;
    bytes32[3] internal machineIds;
    bytes32[3] internal fingerprints;
    PayGuardTypes.PolicyBinding internal binding;

    function setUp() public {
        vm.chainId(114);
        vm.warp(1_050);
        owner = vm.addr(_key("v2-owner"));
        manager = new FlareTeeManagerMock();
        registry = new PayGuardPolicyRegistryV2(
            address(this), address(manager), EXTENSION_ID, CODE_HASH
        );
        vault = new PayGuardVault(address(this));
        router = new PayGuardActionRouter(address(registry), address(vault));
        vault.setRouter(address(router));

        for (uint256 index; index < 3; index++) {
            machineKeys[index] =
                _key(index == 0 ? "v2-machine-a" : index == 1 ? "v2-machine-b" : "v2-machine-c");
            address teeId = vm.addr(machineKeys[index]);
            machineIds[index] = bytes32(uint256(uint160(teeId)));
            fingerprints[index] = bytes32(
                (uint256(keccak256(abi.encode("fingerprint", index))) & ~uint256(type(uint160).max))
                    | uint160(teeId)
            );
            manager.setMachine(teeId, EXTENSION_ID, CODE_HASH, PLATFORM);
        }

        binding = PayGuardTypes.PolicyBinding({
            chainId: 114,
            registry: address(registry),
            vault: address(vault),
            router: address(router),
            owner: owner,
            policyId: keccak256("v2-policy"),
            policyVersion: 1,
            policyCommitment: keccak256("v2-policy-commitment"),
            schema: PayGuardTypes.POLICY_SCHEMA_V1,
            extensionId: bytes32(EXTENSION_ID),
            codeVersion: CODE_HASH,
            machineIds: machineIds,
            keyFingerprints: fingerprints,
            custodyThreshold: 3,
            resultThreshold: 2,
            policyNonce: 1
        });
    }

    function testOfficialMachineSetRegistersAndIsRechecked() public {
        registry.registerPolicy(binding, _receipts(binding));
        address teeId = vm.addr(machineKeys[0]);
        assertEq(
            registry.isFrozenSigner(
                binding.policyCommitment, machineIds[0], fingerprints[0], teeId
            ),
            true
        );

        manager.setStatus(teeId, 1);
        assertEq(
            registry.isFrozenSigner(
                binding.policyCommitment, machineIds[0], fingerprints[0], teeId
            ),
            false
        );
        manager.setStatus(teeId, 2);
        manager.setCodeHash(teeId, keccak256("rotated-code"));
        assertEq(
            registry.isFrozenSigner(
                binding.policyCommitment, machineIds[0], fingerprints[0], teeId
            ),
            false
        );
        manager.setCodeHash(teeId, CODE_HASH);
        manager.setCodePolicy(true, true);
        assertEq(
            registry.isFrozenSigner(
                binding.policyCommitment, machineIds[0], fingerprints[0], teeId
            ),
            false
        );
    }

    function testWrongOfficialExtensionAndCodeFailRegistration() public {
        manager.setExtensionId(vm.addr(machineKeys[1]), EXTENSION_ID + 1);
        vm.expectRevert();
        registry.registerPolicy(binding, _receipts(binding));

        manager.setExtensionId(vm.addr(machineKeys[1]), EXTENSION_ID);
        manager.setCodeHash(vm.addr(machineKeys[2]), keccak256("wrong-code"));
        vm.expectRevert();
        registry.registerPolicy(binding, _receipts(binding));
    }

    function testFingerprintSubstitutionInvalidatesReceiptSignature() public {
        PayGuardTypes.PolicyReceipt[3] memory receipts = _receipts(binding);
        binding.keyFingerprints[0] = bytes32(
            (uint256(keccak256("substituted-fingerprint")) & ~uint256(type(uint160).max))
                | uint160(vm.addr(machineKeys[0]))
        );
        receipts[0].keyFingerprint = binding.keyFingerprints[0];
        vm.expectRevert(PayGuardPolicyRegistryV2.InvalidSignature.selector);
        registry.registerPolicy(binding, receipts);
    }

    function testFingerprintMustDeriveTheOfficialTeeSigner() public {
        binding.keyFingerprints[0] = keccak256("foreign-public-key-fingerprint");
        PayGuardTypes.PolicyReceipt[3] memory receipts = _receipts(binding);
        vm.expectRevert();
        registry.registerPolicy(binding, receipts);
    }

    function testAdminCannotControlIndividualPolicyButCanPauseGlobally() public {
        registry.registerPolicy(binding, _receipts(binding));
        vm.expectRevert(PayGuardPolicyRegistryV2.NotPolicyOwner.selector);
        registry.stopPolicy(binding.policyCommitment);

        vm.prank(owner);
        registry.stopPolicy(binding.policyCommitment);
        assertEq(registry.policyStatus(binding.policyCommitment), 2);
        vm.prank(owner);
        registry.resumePolicy(binding.policyCommitment);
        assertEq(registry.policyStatus(binding.policyCommitment), 1);

        registry.setGlobalPause(true);
        assertEq(registry.policyStatus(binding.policyCommitment), 2);
        vm.expectRevert(PayGuardPolicyRegistryV2.InvalidState.selector);
        registry.setGlobalPause(true);
        registry.setGlobalPause(false);
        assertEq(registry.policyStatus(binding.policyCommitment), 1);
    }

    function testAdminCanOnlyRenounceWhileGloballyUnpaused() public {
        registry.setGlobalPause(true);
        vm.expectRevert(PayGuardPolicyRegistryV2.InvalidState.selector);
        registry.renounceAdmin();
        registry.setGlobalPause(false);
        registry.renounceAdmin();
        assertEq(registry.admin(), address(0));
        vm.expectRevert(PayGuardPolicyRegistryV2.NotAdmin.selector);
        registry.setGlobalPause(true);
    }

    function testRouterRejectsResultAfterOfficialMachineRemoval() public {
        registry.registerPolicy(binding, _receipts(binding));
        PayGuardTypes.ActionRequest memory request = _request();
        vm.prank(owner);
        router.createRequest(request);

        PayGuardTypes.EvaluationResult memory result = PayGuardTypes.EvaluationResult({
            request: request,
            decision: 1,
            publicReasonClass: 0,
            reservedAmount: request.amount,
            resultingCheckpoint: PayGuardTypes.nextSpendCheckpoint(request, 1_050),
            resultNonce: request.requestId,
            attempt: request.attempt,
            issuedAt: 1_050,
            expiry: request.expiry,
            machineId: machineIds[0],
            keyFingerprint: fingerprints[0]
        });
        manager.setStatus(vm.addr(machineKeys[0]), 1);
        vm.expectRevert(PayGuardActionRouter.InvalidSignature.selector);
        router.submitEvaluation(
            result, _signature(machineKeys[0], PayGuardTypes.evaluationAttestationDigest(result))
        );
    }

    function _request() private view returns (PayGuardTypes.ActionRequest memory request) {
        request = PayGuardTypes.ActionRequest({
            chainId: 114,
            registry: address(registry),
            vault: address(vault),
            router: address(router),
            policyId: binding.policyId,
            policyVersion: binding.policyVersion,
            policyCommitment: binding.policyCommitment,
            requestId: keccak256("v2-request"),
            requestNonce: 1,
            attempt: 0,
            requester: owner,
            target: address(0xCAFE),
            asset: address(0xA55E7),
            actionType: PayGuardTypes.ACTION_FTESTXRP_TRANSFER,
            amount: 10,
            scheduleSlot: 1_000,
            occurrence: 1,
            spendCheckpoint: PayGuardTypes.genesisSpendCheckpoint(binding.policyCommitment),
            balanceCheckpoint: keccak256("v2-balance"),
            inputCommitment: bytes32(0),
            createdAt: 1_000,
            graceDeadline: 1_100,
            expiry: 1_200
        });
    }

    function _receipts(
        PayGuardTypes.PolicyBinding memory receiptBinding
    ) private returns (PayGuardTypes.PolicyReceipt[3] memory receipts) {
        for (uint256 index; index < 3; index++) {
            receipts[index] = PayGuardTypes.PolicyReceipt({
                machineId: receiptBinding.machineIds[index],
                keyFingerprint: receiptBinding.keyFingerprints[index],
                submissionNonce: keccak256("v2-submission"),
                receiptNonce: receiptBinding.policyNonce,
                issuedAt: 1_000,
                expiry: 2_000,
                signature: ""
            });
            receipts[index].signature = _signature(
                machineKeys[index],
                PayGuardTypes.receiptAttestationDigest(receiptBinding, receipts[index])
            );
        }
    }

    function _signature(
        uint256 privateKey,
        bytes32 digest
    ) private returns (bytes memory signature) {
        bytes32 ethSigned = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, ethSigned);
        return abi.encodePacked(r, s, v);
    }

    function _key(
        string memory label
    ) private pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }
}
