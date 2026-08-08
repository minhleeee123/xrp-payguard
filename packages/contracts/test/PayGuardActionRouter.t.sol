// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardActionRouter } from "../src/PayGuardActionRouter.sol";
import { PayGuardPolicyRegistry } from "../src/PayGuardPolicyRegistry.sol";
import { PayGuardTypes } from "../src/PayGuardTypes.sol";
import { PayGuardVault } from "../src/PayGuardVault.sol";
import { MockToken } from "./MockToken.sol";
import { TestBase } from "./TestBase.sol";

contract PayGuardActionRouterTest is TestBase {
    address internal owner;
    address internal payee;
    uint256 internal machineAKey;
    uint256 internal machineBKey;
    uint256 internal machineCKey;
    bytes32 internal commitment = keccak256("synthetic-policy-commitment");
    bytes32 internal policyId = keccak256("policy-id");
    bytes32 internal machineA = keccak256("machine-a");
    bytes32 internal machineB = keccak256("machine-b");
    bytes32 internal machineC = keccak256("machine-c");
    bytes32 internal keyA = keccak256("key-a");
    bytes32 internal keyB = keccak256("key-b");
    bytes32 internal keyC = keccak256("key-c");
    PayGuardPolicyRegistry internal registry;
    PayGuardVault internal vault;
    PayGuardActionRouter internal router;
    MockToken internal token;
    PayGuardTypes.PolicyBinding internal binding;

    function setUp() public {
        vm.chainId(114);
        vm.warp(1050);
        owner = vm.addr(_key("payguard-owner"));
        payee = vm.addr(_key("payguard-payee"));
        registry = new PayGuardPolicyRegistry(address(this));
        vault = new PayGuardVault(address(this));
        router = new PayGuardActionRouter(address(registry), address(vault));
        vault.setRouter(address(router));
        token = new MockToken();
        vault.setSupportedAsset(address(token), true);
        machineAKey = _key("payguard-machine-a");
        machineBKey = _key("payguard-machine-b");
        machineCKey = _key("payguard-machine-c");
        address signerA = vm.addr(machineAKey);
        address signerB = vm.addr(machineBKey);
        address signerC = vm.addr(machineCKey);
        registry.registerMachine(machineA, keyA, signerA);
        registry.registerMachine(machineB, keyB, signerB);
        registry.registerMachine(machineC, keyC, signerC);

        binding = PayGuardTypes.PolicyBinding({
            chainId: 114,
            registry: address(registry),
            vault: address(vault),
            router: address(router),
            owner: owner,
            policyId: policyId,
            policyVersion: 1,
            policyCommitment: commitment,
            schema: PayGuardTypes.POLICY_SCHEMA_V1,
            extensionId: keccak256("extension-v1"),
            codeVersion: keccak256("code-v1"),
            machineIds: [machineA, machineB, machineC],
            keyFingerprints: [keyA, keyB, keyC],
            custodyThreshold: 3,
            resultThreshold: 2,
            policyNonce: 1
        });
        PayGuardTypes.PolicyReceipt[3] memory receipts;
        receipts[0] = _receiptFor(binding, machineA, keyA, machineAKey);
        receipts[1] = _receiptFor(binding, machineB, keyB, machineBKey);
        receipts[2] = _receiptFor(binding, machineC, keyC, machineCKey);
        registry.registerPolicy(binding, receipts);

        token.mint(owner, 500);
        vm.prank(owner);
        token.approve(address(vault), 500);
        vm.prank(owner);
        vault.deposit(address(token), 500, owner);
    }

    function testGoldenHashesMatchTypeScriptFixture() public pure {
        PayGuardTypes.PolicyBinding memory goldenBinding = PayGuardTypes.PolicyBinding({
            chainId: 114,
            registry: address(0xA1),
            vault: address(0xB2),
            router: address(0xC3),
            owner: address(0xA1),
            policyId: _b(0x706f6c6963792d31),
            policyVersion: 1,
            policyCommitment: 0xb241920018ba735b00993170ea61aeafdba73de705e95f2bcae093c7528a38f1,
            schema: _b(0x736368656d61),
            extensionId: _b(0x657874656e73696f6e),
            codeVersion: _b(0x636f6465),
            machineIds: [
                _b(0x6d616368696e652d61), _b(0x6d616368696e652d62), _b(0x6d616368696e652d63)
            ],
            keyFingerprints: [_b(0x6b65792d61), _b(0x6b65792d62), _b(0x6b65792d63)],
            custodyThreshold: 3,
            resultThreshold: 2,
            policyNonce: 1
        });
        PayGuardTypes.PolicyReceipt memory goldenReceipt = PayGuardTypes.PolicyReceipt({
            machineId: _b(0x6d616368696e652d61),
            keyFingerprint: _b(0x6b65792d61),
            submissionNonce: _b(0x7375626d6974),
            receiptNonce: 1,
            issuedAt: 1000,
            expiry: 2000,
            signature: ""
        });
        require(
            PayGuardTypes.receiptDigest(goldenBinding, goldenReceipt)
                == 0xaf54f890d4aad11e9945c9035df1ec0e29ab29b9ee5554e09d130f0ed93fbbd9,
            "receipt digest"
        );
        PayGuardTypes.ActionRequest memory request = PayGuardTypes.ActionRequest({
            chainId: 114,
            registry: address(0xA1),
            vault: address(0xB2),
            router: address(0xC3),
            policyId: _b(0x706f6c6963792d31),
            policyVersion: 1,
            policyCommitment: 0xb241920018ba735b00993170ea61aeafdba73de705e95f2bcae093c7528a38f1,
            requestId: _b(0x726571756573742d31),
            requestNonce: 1,
            attempt: 0,
            requester: address(0xA1),
            target: address(0xC3),
            asset: address(0xB2),
            actionType: 0x7724a7df37c3be471ea167687fac27a66f7665ba11b82088e76b3e132f962df1,
            amount: 75,
            scheduleSlot: 1000,
            occurrence: 0,
            spendCheckpoint: _b(0x7370656e642d30),
            balanceCheckpoint: _b(0x62616c616e63652d30),
            inputCommitment: bytes32(0),
            createdAt: 1001,
            graceDeadline: 1100,
            expiry: 1200
        });
        require(
            PayGuardTypes.requestHash(request)
                == 0xb4bc17cf6fd24db78796ecd81a67a0b03e33e171525da5ff5406a17104e88be9,
            "request hash"
        );
        PayGuardTypes.EvaluationResult memory result = PayGuardTypes.EvaluationResult({
            request: request,
            decision: 1,
            publicReasonClass: 0,
            reservedAmount: 75,
            resultingCheckpoint: 0x9bb91f1d5b4144e755f4d20bf7ba7e78de1d589904a9be9d3cdb42282c56efde,
            resultNonce: _b(0x726571756573742d31),
            attempt: 0,
            issuedAt: 1050,
            expiry: 1200,
            machineId: _b(0x6d616368696e652d61),
            keyFingerprint: _b(0x6b65792d61)
        });
        require(
            PayGuardTypes.evaluationDigest(result)
                == 0x04ca2499b5d6b2d645085c88094239b34df037d04fdb51c887f6fc1e816ad364,
            "evaluation digest"
        );
    }

    function testTwoDistinctMatchingResultsExecuteOnceAndConserve() public {
        PayGuardTypes.ActionRequest memory request =
            _request(keccak256("request-1"), 1, _b(0x7370656e642d31), 100);
        vm.prank(owner);
        router.createRequest(request);
        PayGuardTypes.EvaluationResult memory result =
            _allowResult(request, 100, keccak256("checkpoint-1"));
        router.submitEvaluation(
            result, _signature(machineAKey, PayGuardTypes.evaluationDigest(result))
        );
        PayGuardActionRouter.StoredRequest memory pending = router.getRequest(request.requestId);
        assertEq(uint8(pending.status), uint8(PayGuardActionRouter.RequestStatus.Pending));
        result.machineId = machineB;
        result.keyFingerprint = keyB;
        router.submitEvaluation(
            result, _signature(machineBKey, PayGuardTypes.evaluationDigest(result))
        );
        PayGuardActionRouter.StoredRequest memory allowed = router.getRequest(request.requestId);
        assertEq(uint8(allowed.status), uint8(PayGuardActionRouter.RequestStatus.Allowed));
        router.execute(request.requestId);
        assertEq(token.balanceOf(payee), 100);
        PayGuardVault.Accounting memory accounting = vault.accounting(owner, address(token));
        assertEq(accounting.deposited, 500);
        assertEq(accounting.available, 400);
        assertEq(accounting.reserved, 0);
        assertEq(accounting.spent, 100);
        vm.expectRevert(PayGuardActionRouter.InvalidState.selector);
        router.execute(request.requestId);
    }

    function testDenyReleasesReservationAndWrongSignerFailsClosed() public {
        PayGuardTypes.ActionRequest memory request =
            _request(keccak256("request-deny"), 1, _b(0x7370656e642d31), 100);
        vm.prank(owner);
        router.createRequest(request);
        PayGuardTypes.EvaluationResult memory denied = _denyResult(request, 11);
        bytes32 digest = PayGuardTypes.evaluationDigest(denied);
        uint256 unregisteredKey = _key("payguard-unregistered");
        vm.expectRevert(PayGuardActionRouter.InvalidSignature.selector);
        router.submitEvaluation(denied, _signature(unregisteredKey, digest));
        router.submitEvaluation(denied, _signature(machineAKey, digest));
        denied.machineId = machineB;
        denied.keyFingerprint = keyB;
        digest = PayGuardTypes.evaluationDigest(denied);
        router.submitEvaluation(denied, _signature(machineBKey, digest));
        PayGuardActionRouter.StoredRequest memory stored = router.getRequest(request.requestId);
        assertEq(uint8(stored.status), uint8(PayGuardActionRouter.RequestStatus.Denied));
        PayGuardVault.Accounting memory accounting = vault.accounting(owner, address(token));
        assertEq(accounting.available, 500);
        assertEq(accounting.reserved, 0);
    }

    function testFrozenMachineRegistrationCannotBeSilentlyReplaced() public {
        vm.expectRevert(PayGuardPolicyRegistry.MachineAlreadyRegistered.selector);
        address replacementSigner = vm.addr(_key("payguard-replacement"));
        registry.registerMachine(machineA, keccak256("replacement-key"), replacementSigner);
    }

    function testRegistryRejectsNonCanonicalSchema() public {
        PayGuardTypes.PolicyBinding memory invalid = binding;
        invalid.schema = keccak256("unsupported-schema");
        PayGuardTypes.PolicyReceipt[3] memory emptyReceipts;
        vm.expectRevert(PayGuardPolicyRegistry.InvalidBinding.selector);
        registry.registerPolicy(invalid, emptyReceipts);
    }

    function testReplacementMachineAppliesOnlyToNewPolicyVersion() public {
        bytes32 replacementMachine = keccak256("replacement-machine");
        bytes32 replacementFingerprint = keccak256("replacement-fingerprint");
        uint256 replacementKey = _key("payguard-replacement-machine");
        address replacementSigner = vm.addr(replacementKey);
        registry.registerMachine(replacementMachine, replacementFingerprint, replacementSigner);

        bytes32 replacementCommitment = keccak256("replacement-policy-commitment");
        PayGuardTypes.PolicyBinding memory replacement = binding;
        replacement.policyVersion = 2;
        replacement.policyCommitment = replacementCommitment;
        replacement.policyNonce = 2;
        replacement.machineIds[0] = replacementMachine;
        replacement.keyFingerprints[0] = replacementFingerprint;
        PayGuardTypes.PolicyReceipt[3] memory replacementReceipts;
        replacementReceipts[0] =
            _receiptFor(replacement, replacementMachine, replacementFingerprint, replacementKey);
        replacementReceipts[1] = _receiptFor(replacement, machineB, keyB, machineBKey);
        replacementReceipts[2] = _receiptFor(replacement, machineC, keyC, machineCKey);
        registry.registerPolicy(replacement, replacementReceipts);

        assertTrue(registry.isFrozenSigner(commitment, machineA, keyA, vm.addr(machineAKey)));
        assertEq(
            registry.isFrozenSigner(
                commitment, replacementMachine, replacementFingerprint, replacementSigner
            ),
            false
        );
        assertTrue(
            registry.isFrozenSigner(
                replacementCommitment, replacementMachine, replacementFingerprint, replacementSigner
            )
        );
        assertEq(
            registry.isFrozenSigner(replacementCommitment, machineA, keyA, vm.addr(machineAKey)),
            false
        );

        PayGuardTypes.ActionRequest memory oldRequest =
            _request(keccak256("old-policy-request"), 1, _b(0x7370656e642d31), 25);
        vm.prank(owner);
        router.createRequest(oldRequest);
        PayGuardTypes.EvaluationResult memory oldResult =
            _allowResult(oldRequest, 25, keccak256("old-policy-next"));
        oldResult.machineId = replacementMachine;
        oldResult.keyFingerprint = replacementFingerprint;
        vm.expectRevert(PayGuardActionRouter.InvalidSignature.selector);
        router.submitEvaluation(
            oldResult, _signature(replacementKey, PayGuardTypes.evaluationDigest(oldResult))
        );
        vm.prank(owner);
        router.cancel(oldRequest.requestId);

        PayGuardTypes.ActionRequest memory newRequest =
            _request(keccak256("new-policy-request"), 1, _b(0x6e65772d7370656e64), 25);
        newRequest.policyVersion = 2;
        newRequest.policyCommitment = replacementCommitment;
        vm.prank(owner);
        router.createRequest(newRequest);
        PayGuardTypes.EvaluationResult memory newResult =
            _allowResult(newRequest, 25, keccak256("new-policy-next"));
        newResult.machineId = replacementMachine;
        newResult.keyFingerprint = replacementFingerprint;
        router.submitEvaluation(
            newResult, _signature(replacementKey, PayGuardTypes.evaluationDigest(newResult))
        );
        newResult.machineId = machineB;
        newResult.keyFingerprint = keyB;
        router.submitEvaluation(
            newResult, _signature(machineBKey, PayGuardTypes.evaluationDigest(newResult))
        );
        router.execute(newRequest.requestId);
        assertEq(token.balanceOf(payee), 25);
    }

    function testStaleCheckpointAndCancellationAreSafe() public {
        PayGuardTypes.ActionRequest memory first =
            _request(keccak256("request-state"), 1, _b(0x7370656e642d31), 100);
        vm.prank(owner);
        router.createRequest(first);
        PayGuardTypes.EvaluationResult memory allowed =
            _allowResult(first, 100, keccak256("checkpoint-state"));
        router.submitEvaluation(
            allowed, _signature(machineAKey, PayGuardTypes.evaluationDigest(allowed))
        );
        allowed.machineId = machineB;
        allowed.keyFingerprint = keyB;
        router.submitEvaluation(
            allowed, _signature(machineBKey, PayGuardTypes.evaluationDigest(allowed))
        );
        router.execute(first.requestId);

        PayGuardTypes.ActionRequest memory stale =
            _request(keccak256("request-stale"), 2, _b(0x7370656e642d31), 50);
        vm.prank(owner);
        vm.expectRevert(PayGuardActionRouter.InvalidRequest.selector);
        router.createRequest(stale);

        PayGuardTypes.ActionRequest memory second =
            _request(keccak256("request-cancel"), 2, keccak256("checkpoint-state"), 50);
        vm.prank(owner);
        router.createRequest(second);
        vm.prank(owner);
        router.cancel(second.requestId);
        PayGuardActionRouter.StoredRequest memory cancelled = router.getRequest(second.requestId);
        assertEq(uint8(cancelled.status), uint8(PayGuardActionRouter.RequestStatus.Cancelled));
        PayGuardVault.Accounting memory accounting = vault.accounting(owner, address(token));
        assertEq(accounting.available, 400);
        assertEq(accounting.spent, 100);
        assertEq(accounting.reserved, 0);
    }

    function _receiptFor(
        PayGuardTypes.PolicyBinding memory receiptBinding,
        bytes32 machineId,
        bytes32 keyFingerprint,
        uint256 privateKey
    ) internal returns (PayGuardTypes.PolicyReceipt memory receipt) {
        receipt = PayGuardTypes.PolicyReceipt({
            machineId: machineId,
            keyFingerprint: keyFingerprint,
            submissionNonce: keccak256("submission"),
            receiptNonce: receiptBinding.policyNonce,
            issuedAt: 1000,
            expiry: 2000,
            signature: ""
        });
        receipt.signature =
            _signature(privateKey, PayGuardTypes.receiptDigest(receiptBinding, receipt));
    }

    function _signature(
        uint256 privateKey,
        bytes32 digest
    ) internal returns (bytes memory signature) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        signature = abi.encodePacked(r, s, v);
    }

    function _request(
        bytes32 requestId,
        uint256 requestNonce,
        bytes32 checkpoint,
        uint256 amount
    ) internal view returns (PayGuardTypes.ActionRequest memory request) {
        request = PayGuardTypes.ActionRequest({
            chainId: 114,
            registry: address(registry),
            vault: address(vault),
            router: address(router),
            policyId: policyId,
            policyVersion: 1,
            policyCommitment: commitment,
            requestId: requestId,
            requestNonce: requestNonce,
            attempt: 0,
            requester: owner,
            target: payee,
            asset: address(token),
            actionType: PayGuardTypes.ACTION_FTESTXRP_TRANSFER,
            amount: amount,
            scheduleSlot: uint64(1000 + requestNonce),
            occurrence: uint32(requestNonce),
            spendCheckpoint: checkpoint,
            balanceCheckpoint: keccak256(abi.encode("balance", requestNonce)),
            inputCommitment: bytes32(0),
            createdAt: 1001,
            graceDeadline: 1100,
            expiry: 1200
        });
    }

    function _allowResult(
        PayGuardTypes.ActionRequest memory request,
        uint256 amount,
        bytes32 checkpoint
    ) internal view returns (PayGuardTypes.EvaluationResult memory result) {
        result = PayGuardTypes.EvaluationResult({
            request: request,
            decision: 1,
            publicReasonClass: 0,
            reservedAmount: amount,
            resultingCheckpoint: checkpoint,
            resultNonce: request.requestId,
            attempt: request.attempt,
            issuedAt: 1050,
            expiry: request.expiry,
            machineId: machineA,
            keyFingerprint: keyA
        });
    }

    function _denyResult(
        PayGuardTypes.ActionRequest memory request,
        uint8 reason
    ) internal view returns (PayGuardTypes.EvaluationResult memory result) {
        result = PayGuardTypes.EvaluationResult({
            request: request,
            decision: 0,
            publicReasonClass: reason,
            reservedAmount: 0,
            resultingCheckpoint: request.spendCheckpoint,
            resultNonce: request.requestId,
            attempt: request.attempt,
            issuedAt: 1050,
            expiry: request.expiry,
            machineId: machineA,
            keyFingerprint: keyA
        });
    }

    function _b(
        uint256 value
    ) internal pure returns (bytes32) {
        return bytes32(value);
    }

    function _key(
        string memory label
    ) internal pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }
}
