// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Cross-language calendar/sliding-window arithmetic reference. The
/// public router never receives or processes this private-evaluator history.
library PayGuardSpendWindowMath {
    error InvalidSpendHistory();
    uint256 internal constant MAX_ENTRIES = 4096;

    function spendWindowTotalsV1(
        uint256[] memory values,
        uint64[] memory executedAt,
        uint64 nowTimestamp,
        uint64 rollingWindowSeconds
    ) internal pure returns (uint256 dailySpend, uint256 rollingSpend) {
        if (
            rollingWindowSeconds == 0 || values.length != executedAt.length
                || values.length > MAX_ENTRIES
        ) revert InvalidSpendHistory();
        uint64 dayStart = nowTimestamp / 86400 * 86400;
        bool hasLowerBound = nowTimestamp >= rollingWindowSeconds;
        uint64 rollingLowerBound = hasLowerBound ? nowTimestamp - rollingWindowSeconds : uint64(0);
        uint64 priorTimestamp;
        for (uint256 index; index < values.length; index++) {
            uint64 timestamp = executedAt[index];
            if (
                values[index] == 0 || timestamp > nowTimestamp
                    || (index > 0 && timestamp < priorTimestamp)
            ) revert InvalidSpendHistory();
            priorTimestamp = timestamp;
            if (timestamp >= dayStart) dailySpend += values[index];
            if (!hasLowerBound || timestamp > rollingLowerBound) {
                rollingSpend += values[index];
            }
        }
    }
}
