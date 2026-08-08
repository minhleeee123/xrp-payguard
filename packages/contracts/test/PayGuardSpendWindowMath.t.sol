// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardSpendWindowMath } from "../src/PayGuardSpendWindowMath.sol";
import { TestBase } from "./TestBase.sol";

contract PayGuardSpendWindowMathTest is TestBase {
    function testSpendWindowCapsPrivateHistory() public {
        uint256[] memory values = new uint256[](4097);
        uint64[] memory executedAt = new uint64[](4097);
        vm.expectRevert(PayGuardSpendWindowMath.InvalidSpendHistory.selector);
        this.spendWindowExternal(values, executedAt, 0, 1);
    }

    function testSpendWindowMatchesSharedFixture() public {
        string memory json = vm.readFile("../protocol/fixtures/spend-window-v1.json");
        uint256 count = vm.parseJsonUint(json, ".caseCount");
        for (uint256 caseIndex; caseIndex < count; caseIndex++) {
            string memory prefix = string.concat(".cases[", vm.toString(caseIndex), "]");
            string memory name = vm.parseJsonString(json, string.concat(prefix, ".name"));
            uint256 entryCount = vm.parseJsonUint(json, string.concat(prefix, ".entryCount"));
            uint256[] memory values = new uint256[](entryCount);
            uint64[] memory executedAt = new uint64[](entryCount);
            for (uint256 entryIndex; entryIndex < entryCount; entryIndex++) {
                string memory entryPrefix =
                    string.concat(prefix, ".entries[", vm.toString(entryIndex), "]");
                values[entryIndex] =
                    vm.parseUint(vm.parseJsonString(json, string.concat(entryPrefix, ".value")));
                executedAt[entryIndex] =
                    _fixtureUint64(json, string.concat(entryPrefix, ".executedAt"));
            }
            uint64 nowTimestamp = _fixtureUint64(json, string.concat(prefix, ".now"));
            uint64 window = _fixtureUint64(json, string.concat(prefix, ".window"));
            if (!vm.parseJsonBool(json, string.concat(prefix, ".valid"))) {
                vm.expectRevert();
                this.spendWindowExternal(values, executedAt, nowTimestamp, window);
                continue;
            }
            (uint256 daily, uint256 rolling) = PayGuardSpendWindowMath.spendWindowTotalsV1(
                values, executedAt, nowTimestamp, window
            );
            require(
                daily == vm.parseUint(vm.parseJsonString(json, string.concat(prefix, ".daily"))),
                name
            );
            require(
                rolling
                    == vm.parseUint(vm.parseJsonString(json, string.concat(prefix, ".rolling"))),
                name
            );
        }
    }

    function spendWindowExternal(
        uint256[] memory values,
        uint64[] memory executedAt,
        uint64 nowTimestamp,
        uint64 window
    ) external pure returns (uint256, uint256) {
        return PayGuardSpendWindowMath.spendWindowTotalsV1(values, executedAt, nowTimestamp, window);
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
