// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardScheduleMath } from "../src/PayGuardScheduleMath.sol";
import { TestBase } from "./TestBase.sol";

contract PayGuardScheduleMathTest is TestBase {
    function testScheduleWindowMatchesSharedFixture() public {
        string memory json = vm.readFile("../protocol/fixtures/schedule-v1.json");
        uint256 count = vm.parseJsonUint(json, ".caseCount");
        for (uint256 index; index < count; index++) {
            string memory prefix = string.concat(".cases[", vm.toString(index), "]");
            string memory name = vm.parseJsonString(json, string.concat(prefix, ".name"));
            uint64 startAt = _fixtureUint64(json, string.concat(prefix, ".startAt"));
            uint64 interval = _fixtureUint64(json, string.concat(prefix, ".interval"));
            uint64 grace = _fixtureUint64(json, string.concat(prefix, ".grace"));
            uint256 occurrence =
                vm.parseUint(vm.parseJsonString(json, string.concat(prefix, ".occurrence")));
            if (!vm.parseJsonBool(json, string.concat(prefix, ".valid"))) {
                vm.expectRevert();
                this.scheduleWindowExternal(startAt, interval, grace, occurrence);
                continue;
            }
            (uint64 slot, uint64 deadline) =
                PayGuardScheduleMath.scheduleWindowV1(startAt, interval, grace, occurrence);
            require(slot == _fixtureUint64(json, string.concat(prefix, ".slot")), name);
            require(deadline == _fixtureUint64(json, string.concat(prefix, ".deadline")), name);
        }
    }

    function scheduleWindowExternal(
        uint64 startAt,
        uint64 interval,
        uint64 grace,
        uint256 occurrence
    ) external pure returns (uint64, uint64) {
        return PayGuardScheduleMath.scheduleWindowV1(startAt, interval, grace, occurrence);
    }

    function _fixtureUint64(
        string memory json,
        string memory path
    ) private pure returns (uint64) {
        uint256 value = vm.parseUint(vm.parseJsonString(json, path));
        require(value <= type(uint64).max, "fixture uint64");
        // The fixture guard above proves this cast cannot truncate.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(value);
    }
}
