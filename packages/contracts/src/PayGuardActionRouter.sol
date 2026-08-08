// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardPolicyRegistry } from "./PayGuardPolicyRegistry.sol";
import { PayGuardTypes } from "./PayGuardTypes.sol";
import { PayGuardVault } from "./PayGuardVault.sol";

/// @notice V1 request, threshold-result, and atomic-transfer state machine.
/// There is no caller-supplied ALLOW flag: only two distinct frozen FCC
/// signers over one exact evaluation digest can move a request to Allowed.
contract PayGuardActionRouter {
    error InvalidRequest();
    error UnknownRequest();
    error PolicyUnavailable();
    error PolicyStopped();
    error RequesterMismatch();
    error RequestAlreadyExists();
    error NonceAlreadyUsed();
    error InvalidEvaluation();
    error InvalidSignature();
    error DuplicateMachine();
    error ThresholdUnavailable();
    error InvalidState();
    error Expired();
    error NotAuthorized();

    uint8 public constant DECISION_DENY = 0;
    uint8 public constant DECISION_ALLOW = 1;
    uint8 private constant POLICY_STATUS_ACTIVE = 1;
    uint8 private constant POLICY_STATUS_STOPPED = 2;
    uint8 private constant POLICY_STATUS_REVOKED = 3;

    enum RequestStatus {
        None,
        Pending,
        Allowed,
        Denied,
        Executed,
        Expired,
        Cancelled
    }

    struct StoredRequest {
        PayGuardTypes.ActionRequest request;
        RequestStatus status;
        bytes32 requestHash;
        bytes32 approvedDigest;
        uint8 matchingCount;
        uint8 approvedDecision;
        uint8 approvedReason;
        uint256 approvedAmount;
        bytes32 approvedCheckpoint;
        bytes32 approvedNonce;
        uint32 approvedAttempt;
        uint64 approvedIssuedAt;
        uint64 approvedExpiry;
    }

    struct SpendState {
        bytes32 checkpoint;
        uint32 occurrence;
        bool initialized;
    }

    PayGuardPolicyRegistry public immutable registry;
    PayGuardVault public immutable vault;
    mapping(bytes32 requestId => StoredRequest request) private requests;
    mapping(bytes32 requestId => mapping(bytes32 machineId => bool submitted)) public
        machineSubmitted;
    mapping(bytes32 requestId => mapping(bytes32 digest => uint8 count)) public digestCounts;
    mapping(bytes32 policyCommitment => mapping(uint256 requestNonce => bool used)) public
        nonceUsed;
    mapping(bytes32 policyCommitment => SpendState state) public spendState;

    event RequestCreated(
        bytes32 indexed requestId,
        bytes32 indexed policyCommitment,
        address indexed requester,
        uint256 amount
    );
    event EvaluationAccepted(
        bytes32 indexed requestId, bytes32 indexed digest, bytes32 indexed machineId, uint8 decision
    );
    event ThresholdReached(bytes32 indexed requestId, bytes32 indexed digest, uint8 decision);
    event RequestExecuted(
        bytes32 indexed requestId, address indexed target, uint256 amount, bytes32 checkpoint
    );
    event RequestDenied(bytes32 indexed requestId, uint8 reason);
    event RequestExpired(bytes32 indexed requestId);
    event RequestCancelled(bytes32 indexed requestId);

    constructor(
        address registry_,
        address vault_
    ) {
        if (registry_ == address(0) || vault_ == address(0)) revert InvalidRequest();
        registry = PayGuardPolicyRegistry(registry_);
        vault = PayGuardVault(vault_);
    }

    function getRequest(
        bytes32 requestId
    ) external view returns (StoredRequest memory) {
        StoredRequest memory stored = requests[requestId];
        if (stored.status == RequestStatus.None) revert UnknownRequest();
        return stored;
    }

    function requestHash(
        PayGuardTypes.ActionRequest calldata request
    ) external pure returns (bytes32) {
        return PayGuardTypes.requestHash(_copyRequest(request));
    }

    function evaluationDigest(
        PayGuardTypes.EvaluationResult calldata result
    ) external pure returns (bytes32) {
        return PayGuardTypes.evaluationDigest(_copyEvaluation(result));
    }

    function createRequest(
        PayGuardTypes.ActionRequest calldata input
    ) external returns (bytes32 requestId) {
        if (
            input.chainId != block.chainid || input.registry != address(registry)
                || input.vault != address(vault) || input.router != address(this)
                || input.policyCommitment == bytes32(0) || input.requestId == bytes32(0)
                || input.requestNonce == 0 || input.policyId == bytes32(0)
                || input.policyVersion == 0 || input.requester != msg.sender
                || input.target == address(0) || input.asset == address(0)
                || input.actionType != PayGuardTypes.ACTION_FTESTXRP_TRANSFER || input.amount == 0
                || input.occurrence == 0 || input.spendCheckpoint == bytes32(0)
                || input.balanceCheckpoint == bytes32(0) || input.createdAt > block.timestamp
                || input.graceDeadline < input.createdAt || input.expiry < input.graceDeadline
                || input.expiry < block.timestamp
        ) {
            revert InvalidRequest();
        }
        (PayGuardTypes.PolicyBinding memory binding, uint8 status) =
            registry.getPolicy(input.policyCommitment);
        if (status == POLICY_STATUS_STOPPED || status == POLICY_STATUS_REVOKED) {
            revert PolicyStopped();
        }
        if (status != POLICY_STATUS_ACTIVE) revert PolicyUnavailable();
        if (
            binding.chainId != input.chainId || binding.registry != input.registry
                || binding.vault != input.vault || binding.router != input.router
                || binding.owner == address(0) || binding.policyId != input.policyId
                || binding.policyVersion != input.policyVersion
        ) {
            revert InvalidRequest();
        }
        if (requests[input.requestId].status != RequestStatus.None) revert RequestAlreadyExists();
        if (nonceUsed[input.policyCommitment][input.requestNonce]) revert NonceAlreadyUsed();
        SpendState memory prior = spendState[input.policyCommitment];
        if (
            (prior.initialized
                    && (prior.occurrence == type(uint32).max
                        || input.spendCheckpoint != prior.checkpoint
                        || input.occurrence != prior.occurrence + 1))
                || (!prior.initialized
                    && (input.occurrence != 1
                        || input.spendCheckpoint
                            != PayGuardTypes.genesisSpendCheckpoint(input.policyCommitment)))
        ) {
            revert InvalidRequest();
        }
        PayGuardTypes.ActionRequest memory request = _copyRequest(input);
        bytes32 hash = PayGuardTypes.requestHash(request);
        nonceUsed[input.policyCommitment][input.requestNonce] = true;
        requests[input.requestId] = StoredRequest({
            request: request,
            status: RequestStatus.Pending,
            requestHash: hash,
            approvedDigest: bytes32(0),
            matchingCount: 0,
            approvedDecision: 0,
            approvedReason: 0,
            approvedAmount: 0,
            approvedCheckpoint: bytes32(0),
            approvedNonce: bytes32(0),
            approvedAttempt: 0,
            approvedIssuedAt: 0,
            approvedExpiry: 0
        });
        emit RequestCreated(input.requestId, input.policyCommitment, input.requester, input.amount);
        return input.requestId;
    }

    function submitEvaluation(
        PayGuardTypes.EvaluationResult calldata input,
        bytes calldata signature
    ) external {
        StoredRequest storage stored = requests[input.request.requestId];
        if (stored.status != RequestStatus.Pending) revert InvalidState();
        PayGuardTypes.EvaluationResult memory result = _copyEvaluation(input);
        if (
            PayGuardTypes.requestHash(result.request) != stored.requestHash
                || PayGuardTypes.requestHash(result.request)
                    != PayGuardTypes.requestHash(stored.request) || result.decision > DECISION_ALLOW
                || result.resultNonce != result.request.requestId
                || result.attempt != result.request.attempt
                || result.expiry != result.request.expiry || result.issuedAt > block.timestamp
                || result.expiry < block.timestamp || result.issuedAt > result.expiry
                || (result.decision == DECISION_ALLOW
                    && (result.publicReasonClass != 0
                        || result.reservedAmount != result.request.amount
                        || result.resultingCheckpoint == bytes32(0)))
                || (result.decision == DECISION_DENY
                    && (result.reservedAmount != 0 || result.publicReasonClass == 0))
        ) {
            revert InvalidEvaluation();
        }
        if (registry.policyStatus(result.request.policyCommitment) != POLICY_STATUS_ACTIVE) {
            revert PolicyUnavailable();
        }
        if (machineSubmitted[result.request.requestId][result.machineId]) {
            revert DuplicateMachine();
        }
        bytes32 digest = PayGuardTypes.evaluationDigest(result);
        address signer = _recover(digest, signature);
        if (!registry.isFrozenSigner(
                result.request.policyCommitment, result.machineId, result.keyFingerprint, signer
            )) {
            revert InvalidSignature();
        }
        machineSubmitted[result.request.requestId][result.machineId] = true;
        uint8 count = digestCounts[result.request.requestId][digest] + 1;
        digestCounts[result.request.requestId][digest] = count;
        emit EvaluationAccepted(result.request.requestId, digest, result.machineId, result.decision);
        if (count < 2 || stored.approvedDigest != bytes32(0)) return;
        stored.approvedDigest = digest;
        stored.matchingCount = count;
        stored.approvedDecision = result.decision;
        stored.approvedReason = result.publicReasonClass;
        stored.approvedAmount = result.reservedAmount;
        stored.approvedCheckpoint = result.resultingCheckpoint;
        stored.approvedNonce = result.resultNonce;
        stored.approvedAttempt = result.attempt;
        stored.approvedIssuedAt = result.issuedAt;
        stored.approvedExpiry = result.expiry;
        if (result.decision == DECISION_ALLOW) {
            (PayGuardTypes.PolicyBinding memory binding,) =
                registry.getPolicy(result.request.policyCommitment);
            vault.reserve(
                binding.owner, result.request.asset, result.request.requestId, result.request.amount
            );
            stored.status = RequestStatus.Allowed;
        } else {
            stored.status = RequestStatus.Denied;
            emit RequestDenied(result.request.requestId, result.publicReasonClass);
        }
        emit ThresholdReached(result.request.requestId, digest, result.decision);
    }

    function execute(
        bytes32 requestId
    ) external {
        StoredRequest storage stored = requests[requestId];
        if (stored.status != RequestStatus.Allowed || stored.approvedDigest == bytes32(0)) {
            revert InvalidState();
        }
        if (block.timestamp > stored.approvedExpiry) {
            revert Expired();
        }
        SpendState storage state = spendState[stored.request.policyCommitment];
        if (
            (state.initialized
                    && (state.occurrence == type(uint32).max
                        || stored.request.spendCheckpoint != state.checkpoint
                        || stored.request.occurrence != state.occurrence + 1))
                || (!state.initialized
                    && (stored.request.occurrence != 1
                        || stored.request.spendCheckpoint
                            != PayGuardTypes.genesisSpendCheckpoint(
                                stored.request.policyCommitment
                            )))
        ) revert InvalidState();
        stored.status = RequestStatus.Executed;
        state.checkpoint = stored.approvedCheckpoint;
        state.occurrence = stored.request.occurrence;
        state.initialized = true;
        vault.execute(requestId, stored.request.target);
        emit RequestExecuted(
            requestId, stored.request.target, stored.request.amount, stored.approvedCheckpoint
        );
    }

    function expire(
        bytes32 requestId
    ) external {
        StoredRequest storage stored = requests[requestId];
        if (stored.status != RequestStatus.Pending && stored.status != RequestStatus.Allowed) {
            revert InvalidState();
        }
        if (block.timestamp <= stored.request.expiry) revert Expired();
        _expire(stored, requestId);
    }

    function cancel(
        bytes32 requestId
    ) external {
        StoredRequest storage stored = requests[requestId];
        if (stored.status != RequestStatus.Pending && stored.status != RequestStatus.Allowed) {
            revert InvalidState();
        }
        (PayGuardTypes.PolicyBinding memory binding,) =
            registry.getPolicy(stored.request.policyCommitment);
        if (msg.sender != binding.owner && msg.sender != stored.request.requester) {
            revert NotAuthorized();
        }
        bool reserved = stored.status == RequestStatus.Allowed;
        stored.status = RequestStatus.Cancelled;
        if (reserved) vault.release(requestId);
        emit RequestCancelled(requestId);
    }

    function _expire(
        StoredRequest storage stored,
        bytes32 requestId
    ) private {
        bool reserved = stored.status == RequestStatus.Allowed;
        stored.status = RequestStatus.Expired;
        if (reserved) vault.release(requestId);
        emit RequestExpired(requestId);
    }

    function _copyRequest(
        PayGuardTypes.ActionRequest calldata source
    ) private pure returns (PayGuardTypes.ActionRequest memory target) {
        target.chainId = source.chainId;
        target.registry = source.registry;
        target.vault = source.vault;
        target.router = source.router;
        target.policyId = source.policyId;
        target.policyVersion = source.policyVersion;
        target.policyCommitment = source.policyCommitment;
        target.requestId = source.requestId;
        target.requestNonce = source.requestNonce;
        target.attempt = source.attempt;
        target.requester = source.requester;
        target.target = source.target;
        target.asset = source.asset;
        target.actionType = source.actionType;
        target.amount = source.amount;
        target.scheduleSlot = source.scheduleSlot;
        target.occurrence = source.occurrence;
        target.spendCheckpoint = source.spendCheckpoint;
        target.balanceCheckpoint = source.balanceCheckpoint;
        target.inputCommitment = source.inputCommitment;
        target.createdAt = source.createdAt;
        target.graceDeadline = source.graceDeadline;
        target.expiry = source.expiry;
    }

    function _copyEvaluation(
        PayGuardTypes.EvaluationResult calldata source
    ) private pure returns (PayGuardTypes.EvaluationResult memory target) {
        target.request = _copyRequest(source.request);
        target.decision = source.decision;
        target.publicReasonClass = source.publicReasonClass;
        target.reservedAmount = source.reservedAmount;
        target.resultingCheckpoint = source.resultingCheckpoint;
        target.resultNonce = source.resultNonce;
        target.attempt = source.attempt;
        target.issuedAt = source.issuedAt;
        target.expiry = source.expiry;
        target.machineId = source.machineId;
        target.keyFingerprint = source.keyFingerprint;
    }

    function _recover(
        bytes32 digest,
        bytes memory signature
    ) private pure returns (address signer) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
