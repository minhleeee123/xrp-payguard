// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardPolicyMath } from "../src/PayGuardPolicyMath.sol";
import { TestBase } from "./TestBase.sol";

contract PayGuardPolicyMathTest is TestBase {
    function testReferenceValueV1MatchesSharedFixture() public {
        string memory json = vm.readFile("../protocol/fixtures/math-v1.json");
        uint256 count = vm.parseJsonUint(json, ".caseCount");
        for (uint256 index; index < count; index++) {
            string memory prefix = string.concat(".cases[", vm.toString(index), "]");
            string memory name = vm.parseJsonString(json, string.concat(prefix, ".name"));
            uint256 amount =
                vm.parseUint(vm.parseJsonString(json, string.concat(prefix, ".amount")));
            uint256 price = vm.parseUint(vm.parseJsonString(json, string.concat(prefix, ".price")));
            uint256 rawDecimals = vm.parseJsonUint(json, string.concat(prefix, ".decimals"));
            require(rawDecimals <= type(uint8).max, "fixture decimals");
            // The fixture guard above proves this cast cannot truncate.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint8 decimals = uint8(rawDecimals);
            if (!vm.parseJsonBool(json, string.concat(prefix, ".valid"))) {
                vm.expectRevert();
                this.referenceValueExternal(amount, price, decimals);
                continue;
            }
            uint256 actual = PayGuardPolicyMath.referenceValueV1(amount, price, decimals);
            uint256 expected =
                vm.parseUint(vm.parseJsonString(json, string.concat(prefix, ".expected")));
            require(actual == expected, name);
        }
    }

    function referenceValueExternal(
        uint256 amount,
        uint256 price,
        uint8 decimals
    ) external pure returns (uint256) {
        return PayGuardPolicyMath.referenceValueV1(amount, price, decimals);
    }
}
