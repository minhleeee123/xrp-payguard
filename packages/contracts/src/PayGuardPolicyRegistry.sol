// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardTypes } from "./PayGuardTypes.sol";

/// @notice Public registry of policy commitments and frozen FCC identities.
/// Ciphertext and all private policy rules are intentionally not represented.
contract PayGuardPolicyRegistry {
    error NotAdmin();
    error NotPolicyOwner();
    error InvalidBinding();
    error InvalidReceipt(uint256 index);
    error DuplicateMachine();
    error UnknownMachine();
    error MachineAlreadyRegistered();
    error PolicyAlreadyRegistered();
    error UnknownPolicy();
    error InvalidSignature();
    error InvalidState();

    uint8 public constant STATUS_NONE = 0;
    uint8 public constant STATUS_ACTIVE = 1;
    uint8 public constant STATUS_STOPPED = 2;
    uint8 public constant STATUS_REVOKED = 3;

    struct Machine {
        address signer;
        bytes32 keyFingerprint;
        bool registered;
    }

    struct PolicyRecord {
        PayGuardTypes.PolicyBinding binding;
        uint8 status;
        bool registered;
    }

    address public immutable admin;
    mapping(bytes32 machineId => Machine machine) private machines;
    mapping(bytes32 policyCommitment => PolicyRecord policy) private policies;

    event MachineRegistered(
        bytes32 indexed machineId, bytes32 indexed keyFingerprint, address indexed signer
    );
    event PolicyRegistered(
        bytes32 indexed policyCommitment,
        bytes32 indexed policyId,
        address indexed owner,
        uint32 version
    );
    event PolicyStopped(bytes32 indexed policyCommitment);
    event PolicyResumed(bytes32 indexed policyCommitment);
    event PolicyRevoked(bytes32 indexed policyCommitment);

    constructor(
        address admin_
    ) {
        if (admin_ == address(0)) revert InvalidBinding();
        admin = admin_;
    }

    function registerMachine(
        bytes32 machineId,
        bytes32 keyFingerprint,
        address signer
    ) external {
        if (msg.sender != admin) revert NotAdmin();
        if (machineId == bytes32(0) || keyFingerprint == bytes32(0) || signer == address(0)) {
            revert InvalidBinding();
        }
        if (machines[machineId].registered) revert MachineAlreadyRegistered();
        machines[machineId] =
            Machine({ signer: signer, keyFingerprint: keyFingerprint, registered: true });
        emit MachineRegistered(machineId, keyFingerprint, signer);
    }

    function machine(
        bytes32 machineId
    ) external view returns (address signer, bytes32 keyFingerprint, bool registered) {
        Machine memory entry = machines[machineId];
        return (entry.signer, entry.keyFingerprint, entry.registered);
    }

    function getPolicy(
        bytes32 policyCommitment
    ) external view returns (PayGuardTypes.PolicyBinding memory binding, uint8 status) {
        PolicyRecord memory record = policies[policyCommitment];
        if (!record.registered) revert UnknownPolicy();
        return (record.binding, record.status);
    }

    function policyStatus(
        bytes32 policyCommitment
    ) external view returns (uint8) {
        PolicyRecord memory record = policies[policyCommitment];
        if (!record.registered) revert UnknownPolicy();
        return record.status;
    }

    function isFrozenSigner(
        bytes32 policyCommitment,
        bytes32 machineId,
        bytes32 keyFingerprint,
        address signer
    ) external view returns (bool) {
        PolicyRecord storage record = policies[policyCommitment];
        if (!record.registered) return false;
        for (uint256 index; index < 3; index++) {
            if (record.binding.machineIds[index] == machineId) {
                return record.binding.keyFingerprints[index] == keyFingerprint
                    && machineId != bytes32(0) && machines[machineId].registered
                    && machines[machineId].keyFingerprint == keyFingerprint
                    && machines[machineId].signer == signer;
            }
        }
        return false;
    }

    function registerPolicy(
        PayGuardTypes.PolicyBinding calldata binding,
        PayGuardTypes.PolicyReceipt[3] calldata receipts
    ) external {
        if (
            binding.registry != address(this) || binding.chainId != block.chainid
                || binding.owner == address(0) || binding.vault == address(0)
                || binding.router == address(0) || binding.policyId == bytes32(0)
                || binding.policyCommitment == bytes32(0) || binding.schema == bytes32(0)
                || binding.custodyThreshold != 3 || binding.resultThreshold != 2
                || binding.policyNonce == 0
        ) {
            revert InvalidBinding();
        }
        if (policies[binding.policyCommitment].registered) revert PolicyAlreadyRegistered();
        if (
            binding.machineIds[0] == bytes32(0) || binding.machineIds[1] == bytes32(0)
                || binding.machineIds[2] == bytes32(0)
                || binding.machineIds[0] == binding.machineIds[1]
                || binding.machineIds[0] == binding.machineIds[2]
                || binding.machineIds[1] == binding.machineIds[2]
                || binding.keyFingerprints[0] == bytes32(0)
                || binding.keyFingerprints[1] == bytes32(0)
                || binding.keyFingerprints[2] == bytes32(0)
                || binding.keyFingerprints[0] == binding.keyFingerprints[1]
                || binding.keyFingerprints[0] == binding.keyFingerprints[2]
                || binding.keyFingerprints[1] == binding.keyFingerprints[2]
        ) {
            revert DuplicateMachine();
        }
        bytes32 submissionNonce;
        for (uint256 index; index < 3; index++) {
            PayGuardTypes.PolicyReceipt calldata receipt = receipts[index];
            if (index == 0) submissionNonce = receipt.submissionNonce;
            if (
                receipt.submissionNonce != submissionNonce
                    || receipt.receiptNonce != binding.policyNonce
                    || receipt.submissionNonce == bytes32(0) || receipt.issuedAt > block.timestamp
                    || receipt.expiry < block.timestamp || receipt.expiry <= receipt.issuedAt
            ) {
                revert InvalidReceipt(index);
            }
            if (
                receipt.machineId != binding.machineIds[index]
                    || receipt.keyFingerprint != binding.keyFingerprints[index]
            ) {
                revert InvalidReceipt(index);
            }
            Machine memory machineEntry = machines[receipt.machineId];
            if (!machineEntry.registered || machineEntry.keyFingerprint != receipt.keyFingerprint) {
                revert UnknownMachine();
            }
            address recovered = _recover(
                PayGuardTypes.receiptDigest(_copyBinding(binding), _copyReceipt(receipt)),
                receipt.signature
            );
            if (recovered == address(0) || recovered != machineEntry.signer) {
                revert InvalidSignature();
            }
        }
        policies[binding.policyCommitment] =
            PolicyRecord({ binding: binding, status: STATUS_ACTIVE, registered: true });
        emit PolicyRegistered(
            binding.policyCommitment, binding.policyId, binding.owner, binding.policyVersion
        );
    }

    function stopPolicy(
        bytes32 policyCommitment
    ) external {
        PolicyRecord storage record = policies[policyCommitment];
        if (!record.registered) revert UnknownPolicy();
        if (msg.sender != admin && msg.sender != record.binding.owner) revert NotPolicyOwner();
        if (record.status != STATUS_ACTIVE) revert InvalidState();
        record.status = STATUS_STOPPED;
        emit PolicyStopped(policyCommitment);
    }

    function resumePolicy(
        bytes32 policyCommitment
    ) external {
        PolicyRecord storage record = policies[policyCommitment];
        if (!record.registered) revert UnknownPolicy();
        if (msg.sender != admin && msg.sender != record.binding.owner) revert NotPolicyOwner();
        if (record.status != STATUS_STOPPED) revert InvalidState();
        record.status = STATUS_ACTIVE;
        emit PolicyResumed(policyCommitment);
    }

    function revokePolicy(
        bytes32 policyCommitment
    ) external {
        PolicyRecord storage record = policies[policyCommitment];
        if (!record.registered) revert UnknownPolicy();
        if (msg.sender != admin && msg.sender != record.binding.owner) revert NotPolicyOwner();
        if (record.status == STATUS_REVOKED) revert InvalidState();
        record.status = STATUS_REVOKED;
        emit PolicyRevoked(policyCommitment);
    }

    function _copyBinding(
        PayGuardTypes.PolicyBinding calldata source
    ) private pure returns (PayGuardTypes.PolicyBinding memory target) {
        target.chainId = source.chainId;
        target.registry = source.registry;
        target.vault = source.vault;
        target.router = source.router;
        target.owner = source.owner;
        target.policyId = source.policyId;
        target.policyVersion = source.policyVersion;
        target.policyCommitment = source.policyCommitment;
        target.schema = source.schema;
        target.extensionId = source.extensionId;
        target.codeVersion = source.codeVersion;
        target.machineIds = source.machineIds;
        target.keyFingerprints = source.keyFingerprints;
        target.custodyThreshold = source.custodyThreshold;
        target.resultThreshold = source.resultThreshold;
        target.policyNonce = source.policyNonce;
    }

    function _copyReceipt(
        PayGuardTypes.PolicyReceipt calldata source
    ) private pure returns (PayGuardTypes.PolicyReceipt memory target) {
        target.machineId = source.machineId;
        target.keyFingerprint = source.keyFingerprint;
        target.submissionNonce = source.submissionNonce;
        target.receiptNonce = source.receiptNonce;
        target.issuedAt = source.issuedAt;
        target.expiry = source.expiry;
        target.signature = source.signature;
    }

    function _recover(
        bytes32 digest,
        bytes memory signature
    ) private pure returns (address signer) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
