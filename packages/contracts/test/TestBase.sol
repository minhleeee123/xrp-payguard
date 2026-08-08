// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface Vm {
    function addr(
        uint256 privateKey
    ) external returns (address);
    function sign(
        uint256 privateKey,
        bytes32 digest
    ) external returns (uint8 v, bytes32 r, bytes32 s);
    function chainId(
        uint256 newChainId
    ) external;
    function warp(
        uint256 newTimestamp
    ) external;
    function prank(
        address sender
    ) external;
    function expectRevert(
        bytes4 selector
    ) external;
    function expectRevert() external;
    function readFile(
        string calldata path
    ) external view returns (string memory data);
    function parseUint(
        string calldata stringifiedValue
    ) external pure returns (uint256 parsedValue);
    function parseJsonUint(
        string calldata json,
        string calldata key
    ) external pure returns (uint256 value);
    function parseJsonString(
        string calldata json,
        string calldata key
    ) external pure returns (string memory value);
    function parseJsonBool(
        string calldata json,
        string calldata key
    ) external pure returns (bool value);
    function toString(
        uint256 value
    ) external pure returns (string memory stringifiedValue);
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertTrue(
        bool value
    ) internal pure {
        require(value, "assertTrue");
    }

    function assertEq(
        uint256 left,
        uint256 right
    ) internal pure {
        require(left == right, "assertEq(uint256)");
    }

    function assertEq(
        address left,
        address right
    ) internal pure {
        require(left == right, "assertEq(address)");
    }

    function assertEq(
        bytes32 left,
        bytes32 right
    ) internal pure {
        require(left == right, "assertEq(bytes32)");
    }

    function assertEq(
        bool left,
        bool right
    ) internal pure {
        require(left == right, "assertEq(bool)");
    }
}
