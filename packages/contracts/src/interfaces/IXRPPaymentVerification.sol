// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice ABI-compatible subset of the official FDC IXRPPayment types.
library IXRPPayment {
    struct RequestBody {
        bytes32 transactionId;
        address proofOwner;
    }

    struct ResponseBody {
        uint64 blockNumber;
        uint64 blockTimestamp;
        string sourceAddress;
        bytes32 sourceAddressHash;
        bytes32 receivingAddressHash;
        bytes32 intendedReceivingAddressHash;
        int256 spentAmount;
        int256 intendedSpentAmount;
        int256 receivedAmount;
        int256 intendedReceivedAmount;
        bool hasMemoData;
        bytes firstMemoData;
        bool hasDestinationTag;
        uint256 destinationTag;
        uint8 status;
    }

    struct Response {
        bytes32 attestationType;
        bytes32 sourceId;
        uint64 votingRound;
        uint64 lowestUsedTimestamp;
        RequestBody requestBody;
        ResponseBody responseBody;
    }

    struct Proof {
        bytes32[] merkleProof;
        Response data;
    }
}

interface IXRPPaymentVerification {
    function verifyXRPPayment(
        IXRPPayment.Proof calldata proof
    ) external view returns (bool proved);
}
