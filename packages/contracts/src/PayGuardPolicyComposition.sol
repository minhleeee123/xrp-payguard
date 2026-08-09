// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Cross-language reference for deterministic private-rule precedence.
/// The input is only a violation bitmask; policy plaintext and intermediate
/// values remain outside Solidity and the public execution path.
library PayGuardPolicyComposition {
    uint8 internal constant DECISION_DENY = 0;
    uint8 internal constant DECISION_ALLOW = 1;

    uint8 internal constant REASON_OK = 0;
    uint8 internal constant REASON_POLICY_DENIED = 1;
    uint8 internal constant REASON_MALFORMED = 2;
    uint8 internal constant REASON_INSUFFICIENT_BALANCE = 8;
    uint8 internal constant REASON_CAP_EXCEEDED = 9;
    uint8 internal constant REASON_OCCURRENCE_EXCEEDED = 10;
    uint8 internal constant REASON_TARGET_DENIED = 11;
    uint8 internal constant REASON_REQUESTER_DENIED = 12;
    uint8 internal constant REASON_ACTION_DENIED = 13;
    uint8 internal constant REASON_FTSO_INVALID = 14;
    uint8 internal constant REASON_COOLDOWN = 15;
    uint8 internal constant REASON_FDC_INVALID = 16;

    uint256 internal constant POLICY_DENIED = 1 << 0;
    uint256 internal constant TARGET_DENIED = 1 << 1;
    uint256 internal constant REQUESTER_DENIED = 1 << 2;
    uint256 internal constant ACTION_DENIED = 1 << 3;
    uint256 internal constant OCCURRENCE_EXCEEDED = 1 << 4;
    uint256 internal constant COOLDOWN = 1 << 5;
    uint256 internal constant INSUFFICIENT_BALANCE = 1 << 6;
    uint256 internal constant FTSO_INVALID = 1 << 7;
    uint256 internal constant CAP_EXCEEDED = 1 << 8;
    uint256 internal constant FDC_INVALID = 1 << 9;
    uint256 internal constant KNOWN_MASK = (1 << 10) - 1;

    function composePolicyDecisionV1(
        uint256 violations
    ) internal pure returns (uint8 decision, uint8 reason) {
        if (violations & ~KNOWN_MASK != 0) return (DECISION_DENY, REASON_MALFORMED);
        if (violations & POLICY_DENIED != 0) return (DECISION_DENY, REASON_POLICY_DENIED);
        if (violations & TARGET_DENIED != 0) return (DECISION_DENY, REASON_TARGET_DENIED);
        if (violations & REQUESTER_DENIED != 0) {
            return (DECISION_DENY, REASON_REQUESTER_DENIED);
        }
        if (violations & ACTION_DENIED != 0) return (DECISION_DENY, REASON_ACTION_DENIED);
        if (violations & OCCURRENCE_EXCEEDED != 0) {
            return (DECISION_DENY, REASON_OCCURRENCE_EXCEEDED);
        }
        if (violations & COOLDOWN != 0) return (DECISION_DENY, REASON_COOLDOWN);
        if (violations & INSUFFICIENT_BALANCE != 0) {
            return (DECISION_DENY, REASON_INSUFFICIENT_BALANCE);
        }
        if (violations & FDC_INVALID != 0) return (DECISION_DENY, REASON_FDC_INVALID);
        if (violations & FTSO_INVALID != 0) return (DECISION_DENY, REASON_FTSO_INVALID);
        if (violations & CAP_EXCEEDED != 0) return (DECISION_DENY, REASON_CAP_EXCEEDED);
        return (DECISION_ALLOW, REASON_OK);
    }
}
