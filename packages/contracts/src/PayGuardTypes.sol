// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Shared V1 wire types and hash functions. Private policy fields are
/// deliberately absent: only commitments and public request/result fields live
/// in this package.
library PayGuardTypes {
    bytes32 internal constant POLICY_SCHEMA_V1 = keccak256("POLICY_SCHEMA_V1");
    bytes32 internal constant ACTION_REQUEST_V1 = keccak256("ACTION_REQUEST_V1");
    bytes32 internal constant SPEND_CHECKPOINT_V1 = keccak256("SPEND_CHECKPOINT_V1");
    bytes32 internal constant EVALUATION_RESULT_V1 = keccak256("EVALUATION_RESULT_V1");
    bytes32 internal constant ACTION_FTESTXRP_TRANSFER = keccak256("FTESTXRP_TRANSFER_V1");

    struct PolicyBinding {
        uint256 chainId;
        address registry;
        address vault;
        address router;
        address owner;
        bytes32 policyId;
        uint32 policyVersion;
        bytes32 policyCommitment;
        bytes32 schema;
        bytes32 extensionId;
        bytes32 codeVersion;
        bytes32[3] machineIds;
        bytes32[3] keyFingerprints;
        uint8 custodyThreshold;
        uint8 resultThreshold;
        uint64 policyNonce;
    }

    struct PolicyReceipt {
        bytes32 machineId;
        bytes32 keyFingerprint;
        bytes32 submissionNonce;
        uint64 receiptNonce;
        uint64 issuedAt;
        uint64 expiry;
        bytes signature;
    }

    struct ActionRequest {
        uint256 chainId;
        address registry;
        address vault;
        address router;
        bytes32 policyId;
        uint32 policyVersion;
        bytes32 policyCommitment;
        bytes32 requestId;
        uint256 requestNonce;
        uint32 attempt;
        address requester;
        address target;
        address asset;
        bytes32 actionType;
        uint256 amount;
        uint64 scheduleSlot;
        uint32 occurrence;
        bytes32 spendCheckpoint;
        bytes32 balanceCheckpoint;
        bytes32 inputCommitment;
        uint64 createdAt;
        uint64 graceDeadline;
        uint64 expiry;
    }

    struct EvaluationResult {
        ActionRequest request;
        uint8 decision;
        uint8 publicReasonClass;
        uint256 reservedAmount;
        bytes32 resultingCheckpoint;
        bytes32 resultNonce;
        uint32 attempt;
        uint64 issuedAt;
        uint64 expiry;
        bytes32 machineId;
        bytes32 keyFingerprint;
    }

    function genesisSpendCheckpoint(
        bytes32 policyCommitment
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(SPEND_CHECKPOINT_V1, policyCommitment, uint32(0)));
    }

    function receiptDigest(
        PolicyBinding memory binding,
        PolicyReceipt memory receipt
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                POLICY_SCHEMA_V1,
                binding.chainId,
                binding.registry,
                binding.vault,
                binding.router,
                binding.owner,
                binding.policyId,
                binding.policyVersion,
                binding.policyCommitment,
                binding.schema,
                binding.extensionId,
                binding.codeVersion,
                binding.machineIds,
                binding.keyFingerprints,
                binding.custodyThreshold,
                binding.resultThreshold,
                binding.policyNonce,
                receipt.machineId,
                receipt.keyFingerprint,
                receipt.submissionNonce,
                receipt.receiptNonce,
                receipt.issuedAt,
                receipt.expiry
            )
        );
    }

    function requestHash(
        ActionRequest memory request
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ACTION_REQUEST_V1,
                request.chainId,
                request.registry,
                request.vault,
                request.router,
                request.policyId,
                request.policyVersion,
                request.policyCommitment,
                request.requestId,
                request.requestNonce,
                request.attempt,
                request.requester,
                request.target,
                request.asset,
                request.actionType,
                request.amount,
                request.scheduleSlot,
                request.occurrence,
                request.spendCheckpoint,
                request.balanceCheckpoint,
                request.inputCommitment,
                request.createdAt,
                request.graceDeadline,
                request.expiry
            )
        );
    }

    function evaluationDigest(
        EvaluationResult memory result
    ) internal pure returns (bytes32) {
        ActionRequest memory request = result.request;
        return keccak256(
            abi.encode(
                EVALUATION_RESULT_V1,
                ACTION_REQUEST_V1,
                request.chainId,
                request.registry,
                request.vault,
                request.router,
                request.policyId,
                request.policyVersion,
                request.policyCommitment,
                request.requestId,
                request.requestNonce,
                request.attempt,
                request.requester,
                request.target,
                request.asset,
                request.actionType,
                request.amount,
                request.scheduleSlot,
                request.occurrence,
                request.spendCheckpoint,
                request.balanceCheckpoint,
                request.inputCommitment,
                request.createdAt,
                request.graceDeadline,
                request.expiry,
                requestHash(request),
                result.decision,
                result.publicReasonClass,
                result.reservedAmount,
                result.resultingCheckpoint,
                result.resultNonce,
                result.attempt,
                result.issuedAt,
                result.expiry
            )
        );
    }
}
