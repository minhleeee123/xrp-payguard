// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Cross-language UTC slot arithmetic reference. It is not called by
/// the public router and receives no policy plaintext in production.
library PayGuardScheduleMath {
    error InvalidSchedule();
    error ScheduleOverflow();

    function scheduleWindowV1(
        uint64 startAt,
        uint64 intervalSeconds,
        uint64 graceSeconds,
        uint256 occurrence
    ) internal pure returns (uint64 slot, uint64 deadline) {
        if (
            intervalSeconds == 0 || graceSeconds == 0 || graceSeconds >= intervalSeconds
                || occurrence == 0 || occurrence > type(uint32).max
        ) revert InvalidSchedule();
        uint256 computedSlot = uint256(startAt) + (occurrence - 1) * uint256(intervalSeconds);
        if (computedSlot > type(uint64).max) revert ScheduleOverflow();
        uint256 computedDeadline = computedSlot + uint256(graceSeconds);
        if (computedDeadline > type(uint64).max) revert ScheduleOverflow();
        // Both values are bounded above before these casts.
        // forge-lint: disable-next-line(unsafe-typecast)
        slot = uint64(computedSlot);
        // forge-lint: disable-next-line(unsafe-typecast)
        deadline = uint64(computedDeadline);
    }
}
