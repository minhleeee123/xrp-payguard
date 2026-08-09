// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardActionRouter } from "./PayGuardActionRouter.sol";
import { PayGuardTypes } from "./PayGuardTypes.sol";
import { IFlareContractRegistry } from "./interfaces/IFlareContractRegistry.sol";
import { IXRPPayment, IXRPPaymentVerification } from "./interfaces/IXRPPaymentVerification.sol";

/// @title PayGuardXrplFdcTrigger
/// @notice Atomically consumes one verified XRPL FDC payment and creates one
/// canonical pending PayGuard request bound to that exact public proof.
/// @dev This contract never decides ALLOW. The router still requires the
/// configured two-of-three FCC evaluation threshold before execution.
contract PayGuardXrplFdcTrigger {
    uint256 public constant COSTON2_CHAIN_ID = 114;
    // ASCII literal is shorter than 32 bytes and Solidity right-pads it.
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant FDC_XRP_PAYMENT_V1 = bytes32("XRPPayment");
    // ASCII literal is shorter than 32 bytes and Solidity right-pads it.
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant XRPL_TESTNET_SOURCE_ID = bytes32("testXRP");

    IFlareContractRegistry public immutable flareContractRegistry;
    IXRPPaymentVerification public immutable fdcVerification;
    PayGuardActionRouter public immutable router;
    uint64 public immutable maxProofAgeSeconds;

    mapping(bytes32 transactionId => bool consumed) public transactionConsumed;
    mapping(bytes32 proofCommitment => bool consumed) public proofConsumed;

    error InvalidConfiguration();
    error InvalidProof();
    error InvalidPayment();
    error RequestMismatch();
    error ProofExpired();
    error RuntimeDrift();
    error VerificationFailed();
    error TransactionAlreadyConsumed();
    error ProofAlreadyConsumed();

    event XrplFdcTriggerConsumed(
        bytes32 indexed transactionId,
        bytes32 indexed proofCommitment,
        bytes32 indexed requestId,
        bytes32 inputCommitment
    );

    constructor(
        IFlareContractRegistry flareContractRegistry_,
        IXRPPaymentVerification fdcVerification_,
        PayGuardActionRouter router_,
        uint64 maxProofAgeSeconds_
    ) {
        if (block.chainid != COSTON2_CHAIN_ID) revert InvalidConfiguration();
        if (
            address(flareContractRegistry_) == address(0) || address(fdcVerification_) == address(0)
                || address(router_) == address(0)
                || address(flareContractRegistry_).code.length == 0
                || address(fdcVerification_).code.length == 0 || address(router_).code.length == 0
                || maxProofAgeSeconds_ == 0
        ) {
            revert InvalidConfiguration();
        }
        flareContractRegistry = flareContractRegistry_;
        fdcVerification = fdcVerification_;
        router = router_;
        maxProofAgeSeconds = maxProofAgeSeconds_;
    }

    /// @notice Verifies, consumes, and creates atomically. Any verifier or
    /// router revert rolls both replay markers back with the whole transaction.
    function consumeAndCreateRequest(
        IXRPPayment.Proof calldata proof,
        PayGuardTypes.ActionRequest calldata request
    ) external returns (bytes32 requestId) {
        IXRPPayment.Response calldata data = proof.data;
        IXRPPayment.ResponseBody calldata payment = data.responseBody;
        bytes32 transactionId = data.requestBody.transactionId;

        if (
            data.attestationType != FDC_XRP_PAYMENT_V1 || data.sourceId != XRPL_TESTNET_SOURCE_ID
                || data.votingRound == 0 || transactionId == bytes32(0)
                || data.requestBody.proofOwner != address(this)
                || data.lowestUsedTimestamp != payment.blockTimestamp
                || proof.merkleProof.length == 0 || proof.merkleProof.length > 256
        ) {
            revert InvalidProof();
        }
        if (transactionConsumed[transactionId]) revert TransactionAlreadyConsumed();
        if (
            payment.status != 0 || payment.blockNumber == 0
                || payment.sourceAddressHash == bytes32(0)
                || payment.sourceAddressHash != keccak256(bytes(payment.sourceAddress))
                || payment.receivingAddressHash == bytes32(0)
                || payment.receivingAddressHash != payment.intendedReceivingAddressHash
                || payment.receivedAmount <= 0
                || payment.receivedAmount != payment.intendedReceivedAmount || !payment.hasMemoData
                || payment.firstMemoData.length != 32
        ) {
            revert InvalidPayment();
        }
        if (
            payment.blockTimestamp > block.timestamp
                || block.timestamp - payment.blockTimestamp > maxProofAgeSeconds
        ) {
            revert ProofExpired();
        }
        if (
            request.requester != address(this) || request.createdAt < payment.blockTimestamp
                || request.amount > uint256(type(int256).max)
                || uint256(payment.receivedAmount) != request.amount
                || abi.decode(payment.firstMemoData, (bytes32)) != request.requestId
        ) {
            revert RequestMismatch();
        }

        bytes32 proofCommitment = xrplProofCommitment(proof);
        if (proofConsumed[proofCommitment]) revert ProofAlreadyConsumed();
        bytes32 inputCommitment = xrplInputCommitment(proof);
        if (request.inputCommitment != inputCommitment) revert RequestMismatch();

        address runtimeVerification =
            flareContractRegistry.getContractAddressByName("FdcVerification");
        if (runtimeVerification != address(fdcVerification)) revert RuntimeDrift();
        if (!fdcVerification.verifyXRPPayment(proof)) revert VerificationFailed();

        transactionConsumed[transactionId] = true;
        proofConsumed[proofCommitment] = true;
        requestId = router.createRequest(request);
        if (requestId != request.requestId) revert RequestMismatch();
        emit XrplFdcTriggerConsumed(transactionId, proofCommitment, requestId, inputCommitment);
    }

    /// @notice Matches keccak256 of the official verifyXRPPayment calldata.
    function xrplProofCommitment(
        IXRPPayment.Proof calldata proof
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encodeWithSelector(IXRPPaymentVerification.verifyXRPPayment.selector, proof)
        );
    }

    /// @notice Matches the domain-separated TypeScript XRPPayment trigger
    /// commitment. The Merkle proof itself is separately replay-protected.
    function xrplInputCommitment(
        IXRPPayment.Proof calldata proof
    ) public pure returns (bytes32) {
        IXRPPayment.Response calldata data = proof.data;
        IXRPPayment.ResponseBody calldata payment = data.responseBody;
        return keccak256(
            abi.encode(
                FDC_XRP_PAYMENT_V1,
                data.sourceId,
                data.requestBody.transactionId,
                data.requestBody.proofOwner,
                data.votingRound,
                data.lowestUsedTimestamp,
                payment.blockNumber,
                payment.blockTimestamp,
                keccak256(bytes(payment.sourceAddress)),
                payment.sourceAddressHash,
                payment.receivingAddressHash,
                payment.intendedReceivingAddressHash,
                payment.spentAmount,
                payment.intendedSpentAmount,
                payment.receivedAmount,
                payment.intendedReceivedAmount,
                payment.hasMemoData,
                keccak256(payment.firstMemoData),
                payment.hasDestinationTag,
                payment.destinationTag,
                payment.status
            )
        );
    }
}
