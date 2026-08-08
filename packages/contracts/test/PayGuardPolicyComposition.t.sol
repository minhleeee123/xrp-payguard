// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardPolicyComposition } from "../src/PayGuardPolicyComposition.sol";
import { TestBase } from "./TestBase.sol";

contract PayGuardPolicyCompositionTest is TestBase {
    function testCompositionMatchesSharedFixture() public view {
        string memory json = vm.readFile("../protocol/fixtures/composition-v1.json");
        uint256 count = vm.parseJsonUint(json, ".caseCount");
        for (uint256 index; index < count; index++) {
            string memory prefix = string.concat(".cases[", vm.toString(index), "]");
            string memory name = vm.parseJsonString(json, string.concat(prefix, ".name"));
            uint256 violations =
                vm.parseUint(vm.parseJsonString(json, string.concat(prefix, ".violations")));
            (uint8 decision, uint8 reason) =
                PayGuardPolicyComposition.composePolicyDecisionV1(violations);
            uint256 expectedDecision = vm.parseJsonUint(json, string.concat(prefix, ".decision"));
            uint256 expectedReason = vm.parseJsonUint(json, string.concat(prefix, ".reason"));
            require(decision == expectedDecision && reason == expectedReason, name);
        }
    }
}
