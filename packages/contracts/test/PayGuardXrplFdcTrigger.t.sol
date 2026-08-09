// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardActionRouter } from "../src/PayGuardActionRouter.sol";
import { PayGuardPolicyRegistry } from "../src/PayGuardPolicyRegistry.sol";
import { PayGuardTypes } from "../src/PayGuardTypes.sol";
import { PayGuardVault } from "../src/PayGuardVault.sol";
import { PayGuardXrplFdcTrigger } from "../src/PayGuardXrplFdcTrigger.sol";
import { IFlareContractRegistry } from "../src/interfaces/IFlareContractRegistry.sol";
import {
    IXRPPayment,
    IXRPPaymentVerification
} from "../src/interfaces/IXRPPaymentVerification.sol";
import { TestBase } from "./TestBase.sol";

contract FdcContractRegistryMock is IFlareContractRegistry {
    address public verification;

    function setVerification(
        address value
    ) external {
        verification = value;
    }

    function getContractAddressByName(
        string calldata name
    ) external view returns (address) {
        if (keccak256(bytes(name)) != keccak256("FdcVerification")) return address(0);
        return verification;
    }
}

contract XrplPaymentVerificationMock is IXRPPaymentVerification {
    bool public proved = true;

    function setProved(
        bool value
    ) external {
        proved = value;
    }

    function verifyXRPPayment(
        IXRPPayment.Proof calldata
    ) external view returns (bool) {
        return proved;
    }
}

contract FdcTriggerRouterMock {
    error RouterRejected();

    PayGuardTypes.ActionRequest public lastRequest;
    uint256 public calls;
    bool public reject;

    function setReject(
        bool value
    ) external {
        reject = value;
    }

    function createRequest(
        PayGuardTypes.ActionRequest calldata request
    ) external returns (bytes32) {
        if (reject) revert RouterRejected();
        calls += 1;
        lastRequest = request;
        return request.requestId;
    }

    function lastInputCommitment() external view returns (bytes32) {
        return lastRequest.inputCommitment;
    }
}

contract PayGuardXrplFdcTriggerHarness is PayGuardXrplFdcTrigger {
    constructor(
        IFlareContractRegistry contractRegistry,
        IXRPPaymentVerification verification,
        PayGuardActionRouter actionRouter,
        uint64 maxProofAge
    ) PayGuardXrplFdcTrigger(contractRegistry, verification, actionRouter, maxProofAge) { }

    function markProofConsumed(
        bytes32 proofCommitment
    ) external {
        proofConsumed[proofCommitment] = true;
    }
}

contract PayGuardXrplFdcTriggerTest is TestBase {
    uint64 private constant MAX_PROOF_AGE = 600;
    bytes32 private constant TRANSACTION_ID = keccak256("xrpl-transaction");
    bytes32 private constant REQUEST_ID = keccak256("payguard-request");
    bytes32 private constant SOURCE_HASH = keccak256(bytes("rSource"));
    bytes32 private constant RECEIVER_HASH = keccak256("rDestination");

    FdcContractRegistryMock private contractRegistry;
    XrplPaymentVerificationMock private verifier;
    FdcTriggerRouterMock private router;
    PayGuardXrplFdcTriggerHarness private trigger;

    function setUp() external {
        vm.chainId(114);
        vm.warp(2_000);
        contractRegistry = new FdcContractRegistryMock();
        verifier = new XrplPaymentVerificationMock();
        router = new FdcTriggerRouterMock();
        contractRegistry.setVerification(address(verifier));
        trigger = new PayGuardXrplFdcTriggerHarness(
            contractRegistry, verifier, PayGuardActionRouter(address(router)), MAX_PROOF_AGE
        );
    }

    function testVerifiedProofIsConsumedWithCanonicalRequest() external {
        IXRPPayment.Proof memory proof = _proof();
        PayGuardTypes.ActionRequest memory request = _request();
        bytes32 proofCommitment = trigger.xrplProofCommitment(proof);
        bytes32 inputCommitment = trigger.xrplInputCommitment(proof);
        request.inputCommitment = inputCommitment;

        bytes32 created = trigger.consumeAndCreateRequest(proof, request);

        assertEq(created, REQUEST_ID);
        assertEq(router.calls(), 1);
        assertEq(router.lastInputCommitment(), inputCommitment);
        assertTrue(trigger.transactionConsumed(TRANSACTION_ID));
        assertTrue(trigger.proofConsumed(proofCommitment));
    }

    function testOfficialVerifierSelectorMatchesCanonicalAbi() external pure {
        require(
            IXRPPaymentVerification.verifyXRPPayment.selector == bytes4(0x6a34a7cd),
            "official verifier selector"
        );
    }

    function testInputCommitmentMatchesTypeScriptGoldenVector() external view {
        IXRPPayment.Proof memory proof = _proof();
        proof.data.requestBody.proofOwner = address(0xC3);
        assertEq(
            trigger.xrplInputCommitment(proof),
            0x0b5a30154dc9ca903d642d9d67136ca5e6104fdcafdac7c270d3370ab96b67f6
        );
    }

    function testTransactionAndProofReplayFailClosed() external {
        IXRPPayment.Proof memory proof = _proof();
        PayGuardTypes.ActionRequest memory request = _request();
        request.inputCommitment = trigger.xrplInputCommitment(proof);
        trigger.consumeAndCreateRequest(proof, request);

        vm.expectRevert(PayGuardXrplFdcTrigger.TransactionAlreadyConsumed.selector);
        trigger.consumeAndCreateRequest(proof, request);

        proof.data.requestBody.transactionId = keccak256("other-transaction");
        request.requestId = keccak256("other-request");
        proof.data.responseBody.firstMemoData = abi.encode(request.requestId);
        request.inputCommitment = trigger.xrplInputCommitment(proof);
        bytes32 duplicateProofCommitment = trigger.xrplProofCommitment(proof);
        // The proof bytes changed with the transaction and memo, so explicitly
        // mark this independent commitment to exercise the canonical guard.
        trigger.markProofConsumed(duplicateProofCommitment);
        vm.expectRevert(PayGuardXrplFdcTrigger.ProofAlreadyConsumed.selector);
        trigger.consumeAndCreateRequest(proof, request);
    }

    function testVerifierFailureRollsBackReplayMarkers() external {
        verifier.setProved(false);
        IXRPPayment.Proof memory proof = _proof();
        PayGuardTypes.ActionRequest memory request = _request();
        request.inputCommitment = trigger.xrplInputCommitment(proof);
        bytes32 proofCommitment = trigger.xrplProofCommitment(proof);

        vm.expectRevert(PayGuardXrplFdcTrigger.VerificationFailed.selector);
        trigger.consumeAndCreateRequest(proof, request);

        assertEq(trigger.transactionConsumed(TRANSACTION_ID), false);
        assertEq(trigger.proofConsumed(proofCommitment), false);
        assertEq(router.calls(), 0);
    }

    function testRouterFailureRollsBackReplayMarkers() external {
        router.setReject(true);
        IXRPPayment.Proof memory proof = _proof();
        PayGuardTypes.ActionRequest memory request = _request();
        request.inputCommitment = trigger.xrplInputCommitment(proof);
        bytes32 proofCommitment = trigger.xrplProofCommitment(proof);

        vm.expectRevert(FdcTriggerRouterMock.RouterRejected.selector);
        trigger.consumeAndCreateRequest(proof, request);

        assertEq(trigger.transactionConsumed(TRANSACTION_ID), false);
        assertEq(trigger.proofConsumed(proofCommitment), false);
        assertEq(router.calls(), 0);
    }

    function testRuntimeVerifierDriftFailsClosed() external {
        contractRegistry.setVerification(address(0xBEEF));
        IXRPPayment.Proof memory proof = _proof();
        PayGuardTypes.ActionRequest memory request = _request();
        request.inputCommitment = trigger.xrplInputCommitment(proof);

        vm.expectRevert(PayGuardXrplFdcTrigger.RuntimeDrift.selector);
        trigger.consumeAndCreateRequest(proof, request);
        assertEq(router.calls(), 0);
    }

    function testProofOwnerTypeSourceAndMerkleBoundaryFailClosed() external {
        IXRPPayment.Proof memory proof = _proof();
        PayGuardTypes.ActionRequest memory request = _request();
        proof.data.requestBody.proofOwner = address(this);
        request.inputCommitment = trigger.xrplInputCommitment(proof);
        vm.expectRevert(PayGuardXrplFdcTrigger.InvalidProof.selector);
        trigger.consumeAndCreateRequest(proof, request);

        proof = _proof();
        proof.data.sourceId = bytes32("XRP");
        request.inputCommitment = trigger.xrplInputCommitment(proof);
        vm.expectRevert(PayGuardXrplFdcTrigger.InvalidProof.selector);
        trigger.consumeAndCreateRequest(proof, request);

        proof = _proof();
        proof.merkleProof = new bytes32[](0);
        request.inputCommitment = trigger.xrplInputCommitment(proof);
        vm.expectRevert(PayGuardXrplFdcTrigger.InvalidProof.selector);
        trigger.consumeAndCreateRequest(proof, request);
    }

    function testPaymentStatusHashAmountAndMemoFailClosed() external {
        IXRPPayment.Proof memory proof = _proof();
        PayGuardTypes.ActionRequest memory request = _request();
        proof.data.responseBody.status = 1;
        request.inputCommitment = trigger.xrplInputCommitment(proof);
        vm.expectRevert(PayGuardXrplFdcTrigger.InvalidPayment.selector);
        trigger.consumeAndCreateRequest(proof, request);

        proof = _proof();
        proof.data.responseBody.sourceAddressHash = keccak256("wrong");
        request.inputCommitment = trigger.xrplInputCommitment(proof);
        vm.expectRevert(PayGuardXrplFdcTrigger.InvalidPayment.selector);
        trigger.consumeAndCreateRequest(proof, request);

        proof = _proof();
        proof.data.responseBody.receivedAmount = 99;
        proof.data.responseBody.intendedReceivedAmount = 99;
        request.inputCommitment = trigger.xrplInputCommitment(proof);
        vm.expectRevert(PayGuardXrplFdcTrigger.RequestMismatch.selector);
        trigger.consumeAndCreateRequest(proof, request);

        proof = _proof();
        proof.data.responseBody.firstMemoData = abi.encode(keccak256("wrong-request"));
        request.inputCommitment = trigger.xrplInputCommitment(proof);
        vm.expectRevert(PayGuardXrplFdcTrigger.RequestMismatch.selector);
        trigger.consumeAndCreateRequest(proof, request);
    }

    function testFutureAndExpiredProofsFailClosed() external {
        IXRPPayment.Proof memory proof = _proof();
        PayGuardTypes.ActionRequest memory request = _request();
        proof.data.lowestUsedTimestamp = 2_001;
        proof.data.responseBody.blockTimestamp = 2_001;
        request.createdAt = 2_001;
        request.inputCommitment = trigger.xrplInputCommitment(proof);
        vm.expectRevert(PayGuardXrplFdcTrigger.ProofExpired.selector);
        trigger.consumeAndCreateRequest(proof, request);

        proof = _proof();
        proof.data.lowestUsedTimestamp = 1_399;
        proof.data.responseBody.blockTimestamp = 1_399;
        request = _request();
        request.inputCommitment = trigger.xrplInputCommitment(proof);
        vm.expectRevert(PayGuardXrplFdcTrigger.ProofExpired.selector);
        trigger.consumeAndCreateRequest(proof, request);
    }

    function testConstructorRejectsWrongChainAndMissingConfiguration() external {
        vm.chainId(115);
        vm.expectRevert(PayGuardXrplFdcTrigger.InvalidConfiguration.selector);
        new PayGuardXrplFdcTrigger(
            contractRegistry, verifier, PayGuardActionRouter(address(router)), MAX_PROOF_AGE
        );

        vm.chainId(114);
        vm.expectRevert(PayGuardXrplFdcTrigger.InvalidConfiguration.selector);
        new PayGuardXrplFdcTrigger(
            contractRegistry, verifier, PayGuardActionRouter(address(router)), 0
        );
    }

    function _proof() private view returns (IXRPPayment.Proof memory proof) {
        bytes32[] memory merkleProof = new bytes32[](1);
        merkleProof[0] = keccak256("merkle-node");
        proof = IXRPPayment.Proof({
            merkleProof: merkleProof,
            data: IXRPPayment.Response({
                attestationType: bytes32("XRPPayment"),
                sourceId: bytes32("testXRP"),
                votingRound: 42,
                lowestUsedTimestamp: 1_900,
                requestBody: IXRPPayment.RequestBody({
                    transactionId: TRANSACTION_ID, proofOwner: address(trigger)
                }),
                responseBody: IXRPPayment.ResponseBody({
                    blockNumber: 99,
                    blockTimestamp: 1_900,
                    sourceAddress: "rSource",
                    sourceAddressHash: SOURCE_HASH,
                    receivingAddressHash: RECEIVER_HASH,
                    intendedReceivingAddressHash: RECEIVER_HASH,
                    spentAmount: 100,
                    intendedSpentAmount: 100,
                    receivedAmount: 100,
                    intendedReceivedAmount: 100,
                    hasMemoData: true,
                    firstMemoData: abi.encode(REQUEST_ID),
                    hasDestinationTag: false,
                    destinationTag: 0,
                    status: 0
                })
            })
        });
    }

    function _request() private view returns (PayGuardTypes.ActionRequest memory) {
        return PayGuardTypes.ActionRequest({
            chainId: 114,
            registry: address(0xA1),
            vault: address(0xB2),
            router: address(router),
            policyId: keccak256("policy"),
            policyVersion: 1,
            policyCommitment: keccak256("commitment"),
            requestId: REQUEST_ID,
            requestNonce: 1,
            attempt: 0,
            requester: address(trigger),
            target: address(0xCAFE),
            asset: address(0xFACA),
            actionType: PayGuardTypes.ACTION_FTESTXRP_TRANSFER,
            amount: 100,
            scheduleSlot: 0,
            occurrence: 1,
            spendCheckpoint: keccak256("spend"),
            balanceCheckpoint: keccak256("balance"),
            inputCommitment: bytes32(0),
            createdAt: 1_950,
            graceDeadline: 2_100,
            expiry: 2_200
        });
    }
}

contract PayGuardXrplFdcTriggerRouterIntegrationTest is TestBase {
    bytes32 private constant POLICY_ID = keccak256("fdc-policy");
    bytes32 private constant POLICY_COMMITMENT = keccak256("fdc-policy-commitment");
    bytes32 private constant REQUEST_ID = keccak256("fdc-canonical-request");
    bytes32 private constant TRANSACTION_ID = keccak256("fdc-xrpl-transaction");

    FdcContractRegistryMock private flareRegistry;
    XrplPaymentVerificationMock private verifier;
    PayGuardPolicyRegistry private policyRegistry;
    PayGuardVault private vault;
    PayGuardActionRouter private router;
    PayGuardXrplFdcTrigger private trigger;

    function setUp() external {
        vm.chainId(114);
        vm.warp(2_000);
        flareRegistry = new FdcContractRegistryMock();
        verifier = new XrplPaymentVerificationMock();
        policyRegistry = new PayGuardPolicyRegistry(address(this));
        vault = new PayGuardVault(address(this));
        router = new PayGuardActionRouter(address(policyRegistry), address(vault));
        vault.setRouter(address(router));
        flareRegistry.setVerification(address(verifier));
        trigger = new PayGuardXrplFdcTrigger(flareRegistry, verifier, router, 600);
        _registerPolicy();
    }

    function testVerifiedPaymentCreatesPendingRequestInRealRouterAtomically() external {
        IXRPPayment.Proof memory proof = _proof();
        PayGuardTypes.ActionRequest memory request = _request();
        request.inputCommitment = trigger.xrplInputCommitment(proof);

        trigger.consumeAndCreateRequest(proof, request);

        PayGuardActionRouter.StoredRequest memory stored = router.getRequest(REQUEST_ID);
        assertEq(uint256(stored.status), uint256(PayGuardActionRouter.RequestStatus.Pending));
        assertEq(stored.request.requester, address(trigger));
        assertEq(stored.request.inputCommitment, request.inputCommitment);
        assertEq(stored.requestHash, PayGuardTypes.requestHash(request));
        assertTrue(trigger.transactionConsumed(TRANSACTION_ID));
    }

    function _registerPolicy() private {
        bytes32[3] memory machineIds =
            [keccak256("fdc-machine-a"), keccak256("fdc-machine-b"), keccak256("fdc-machine-c")];
        bytes32[3] memory fingerprints =
            [keccak256("fdc-key-a"), keccak256("fdc-key-b"), keccak256("fdc-key-c")];
        uint256[3] memory privateKeys = [
            uint256(keccak256("fdc-private-a")),
            uint256(keccak256("fdc-private-b")),
            uint256(keccak256("fdc-private-c"))
        ];
        for (uint256 index; index < 3; index++) {
            policyRegistry.registerMachine(
                machineIds[index], fingerprints[index], vm.addr(privateKeys[index])
            );
        }
        PayGuardTypes.PolicyBinding memory binding = PayGuardTypes.PolicyBinding({
            chainId: 114,
            registry: address(policyRegistry),
            vault: address(vault),
            router: address(router),
            owner: address(0xABCD),
            policyId: POLICY_ID,
            policyVersion: 1,
            policyCommitment: POLICY_COMMITMENT,
            schema: PayGuardTypes.POLICY_SCHEMA_V1,
            extensionId: keccak256("fdc-extension"),
            codeVersion: keccak256("fdc-code"),
            machineIds: machineIds,
            keyFingerprints: fingerprints,
            custodyThreshold: 3,
            resultThreshold: 2,
            policyNonce: 1
        });
        PayGuardTypes.PolicyReceipt[3] memory receipts;
        for (uint256 index; index < 3; index++) {
            receipts[index] = PayGuardTypes.PolicyReceipt({
                machineId: machineIds[index],
                keyFingerprint: fingerprints[index],
                submissionNonce: keccak256("fdc-submission"),
                receiptNonce: 1,
                issuedAt: 1_900,
                expiry: 3_000,
                signature: ""
            });
            receipts[index].signature = _signature(
                privateKeys[index], PayGuardTypes.receiptAttestationDigest(binding, receipts[index])
            );
        }
        policyRegistry.registerPolicy(binding, receipts);
    }

    function _proof() private view returns (IXRPPayment.Proof memory proof) {
        bytes32[] memory merkleProof = new bytes32[](1);
        merkleProof[0] = keccak256("fdc-merkle-node");
        bytes32 receiverHash = keccak256("fdc-receiver");
        proof = IXRPPayment.Proof({
            merkleProof: merkleProof,
            data: IXRPPayment.Response({
                attestationType: bytes32("XRPPayment"),
                sourceId: bytes32("testXRP"),
                votingRound: 43,
                lowestUsedTimestamp: 1_900,
                requestBody: IXRPPayment.RequestBody({
                    transactionId: TRANSACTION_ID, proofOwner: address(trigger)
                }),
                responseBody: IXRPPayment.ResponseBody({
                    blockNumber: 100,
                    blockTimestamp: 1_900,
                    sourceAddress: "rCanonicalSource",
                    sourceAddressHash: keccak256(bytes("rCanonicalSource")),
                    receivingAddressHash: receiverHash,
                    intendedReceivingAddressHash: receiverHash,
                    spentAmount: 100,
                    intendedSpentAmount: 100,
                    receivedAmount: 100,
                    intendedReceivedAmount: 100,
                    hasMemoData: true,
                    firstMemoData: abi.encode(REQUEST_ID),
                    hasDestinationTag: false,
                    destinationTag: 0,
                    status: 0
                })
            })
        });
    }

    function _request() private view returns (PayGuardTypes.ActionRequest memory) {
        return PayGuardTypes.ActionRequest({
            chainId: 114,
            registry: address(policyRegistry),
            vault: address(vault),
            router: address(router),
            policyId: POLICY_ID,
            policyVersion: 1,
            policyCommitment: POLICY_COMMITMENT,
            requestId: REQUEST_ID,
            requestNonce: 1,
            attempt: 0,
            requester: address(trigger),
            target: address(0xCAFE),
            asset: address(0xFACA),
            actionType: PayGuardTypes.ACTION_FTESTXRP_TRANSFER,
            amount: 100,
            scheduleSlot: 0,
            occurrence: 1,
            spendCheckpoint: PayGuardTypes.genesisSpendCheckpoint(POLICY_COMMITMENT),
            balanceCheckpoint: keccak256("fdc-balance"),
            inputCommitment: bytes32(0),
            createdAt: 1_950,
            graceDeadline: 2_100,
            expiry: 2_200
        });
    }

    function _signature(
        uint256 privateKey,
        bytes32 digest
    ) private returns (bytes memory signature) {
        bytes32 ethSigned = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, ethSigned);
        return abi.encodePacked(r, s, v);
    }
}
