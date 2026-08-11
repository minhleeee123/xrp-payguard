// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardTypes } from "./PayGuardTypes.sol";
import { IFlareTeeManager } from "./interfaces/IFlareTeeManager.sol";

/// @notice Candidate registry whose FCC identity authority is an immutable,
/// release-bound FlareTeeManager rather than an administrator-owned mapping.
/// @dev V2 preserves the V1 router-facing ABI. Until this contract and its
/// manager/extension/code bindings are deployed and verified on Coston2 it is
/// a local release candidate, not a deployment fact.
contract PayGuardPolicyRegistryV2 {
    error NotAdmin();
    error NotPolicyOwner();
    error InvalidBinding();
    error InvalidReceipt(uint256 index);
    error DuplicateMachine();
    error PolicyAlreadyRegistered();
    error UnknownPolicy();
    error InvalidSignature();
    error InvalidState();
    error OfficialMachineUnavailable(uint256 index);

    uint8 public constant STATUS_NONE = 0;
    uint8 public constant STATUS_ACTIVE = 1;
    uint8 public constant STATUS_STOPPED = 2;
    uint8 public constant STATUS_REVOKED = 3;
    uint8 public constant TEE_STATUS_PRODUCTION = 2;
    uint256 public constant COSTON2_CHAIN_ID = 114;
    bytes32 public constant SIMULATED_TEE_PLATFORM = bytes32("TEST_PLATFORM");

    struct PolicyRecord {
        PayGuardTypes.PolicyBinding binding;
        uint8 status;
        bool registered;
    }

    address public admin;
    IFlareTeeManager public immutable teeManager;
    uint256 public immutable expectedExtensionId;
    bytes32 public immutable expectedCodeHash;
    bool public immutable allowSimulatedTee;
    bool public globallyPaused;

    mapping(bytes32 policyCommitment => PolicyRecord policy) private policies;

    event PolicyRegistered(
        bytes32 indexed policyCommitment,
        bytes32 indexed policyId,
        address indexed owner,
        uint32 version
    );
    event PolicyStopped(bytes32 indexed policyCommitment);
    event PolicyResumed(bytes32 indexed policyCommitment);
    event PolicyRevoked(bytes32 indexed policyCommitment);
    event GlobalPauseUpdated(bool paused);
    event AdminRenounced(address indexed formerAdmin);

    constructor(
        address admin_,
        address teeManager_,
        uint256 expectedExtensionId_,
        bytes32 expectedCodeHash_,
        bool allowSimulatedTee_
    ) {
        if (
            admin_ == address(0) || teeManager_ == address(0) || expectedExtensionId_ == 0
                || expectedCodeHash_ == bytes32(0)
        ) {
            revert InvalidBinding();
        }
        if (allowSimulatedTee_ && block.chainid != COSTON2_CHAIN_ID) revert InvalidBinding();
        admin = admin_;
        teeManager = IFlareTeeManager(teeManager_);
        expectedExtensionId = expectedExtensionId_;
        expectedCodeHash = expectedCodeHash_;
        allowSimulatedTee = allowSimulatedTee_;
    }

    function getPolicy(
        bytes32 policyCommitment
    ) external view returns (PayGuardTypes.PolicyBinding memory binding, uint8 status) {
        PolicyRecord memory record = policies[policyCommitment];
        if (!record.registered) revert UnknownPolicy();
        return (record.binding, _effectiveStatus(record.status));
    }

    function policyStatus(
        bytes32 policyCommitment
    ) external view returns (uint8) {
        PolicyRecord memory record = policies[policyCommitment];
        if (!record.registered) revert UnknownPolicy();
        return _effectiveStatus(record.status);
    }

    function isFrozenSigner(
        bytes32 policyCommitment,
        bytes32 machineId,
        bytes32 keyFingerprint,
        address signer
    ) external view returns (bool) {
        PolicyRecord storage record = policies[policyCommitment];
        if (!record.registered || signer == address(0) || signer != _teeId(machineId)) {
            return false;
        }
        for (uint256 index; index < 3; index++) {
            if (record.binding.machineIds[index] == machineId) {
                return record.binding.keyFingerprints[index] == keyFingerprint
                    && address(uint160(uint256(keyFingerprint))) == signer
                    && _officialMachineMatches(signer);
            }
        }
        return false;
    }

    function registerPolicy(
        PayGuardTypes.PolicyBinding calldata binding,
        PayGuardTypes.PolicyReceipt[3] calldata receipts
    ) external {
        if (globallyPaused) revert InvalidState();
        if (
            binding.registry != address(this) || binding.chainId != block.chainid
                || binding.owner == address(0) || binding.vault == address(0)
                || binding.router == address(0) || binding.policyId == bytes32(0)
                || binding.policyCommitment == bytes32(0)
                || binding.schema != PayGuardTypes.POLICY_SCHEMA_V1
                || binding.extensionId != bytes32(expectedExtensionId)
                || binding.codeVersion != expectedCodeHash || binding.custodyThreshold != 3
                || binding.resultThreshold != 2 || binding.policyNonce == 0
        ) {
            revert InvalidBinding();
        }
        if (policies[binding.policyCommitment].registered) revert PolicyAlreadyRegistered();
        if (!_distinctMachineSet(binding)) revert DuplicateMachine();

        bytes32 submissionNonce;
        for (uint256 index; index < 3; index++) {
            PayGuardTypes.PolicyReceipt calldata receipt = receipts[index];
            if (index == 0) submissionNonce = receipt.submissionNonce;
            if (
                receipt.submissionNonce != submissionNonce
                    || receipt.receiptNonce != binding.policyNonce
                    || receipt.submissionNonce == bytes32(0) || receipt.issuedAt > block.timestamp
                    || receipt.expiry < block.timestamp || receipt.expiry <= receipt.issuedAt
                    || receipt.machineId != binding.machineIds[index]
                    || receipt.keyFingerprint != binding.keyFingerprints[index]
            ) {
                revert InvalidReceipt(index);
            }
            address teeId = _teeId(receipt.machineId);
            if (teeId == address(0) || address(uint160(uint256(receipt.keyFingerprint))) != teeId) {
                revert InvalidReceipt(index);
            }
            if (!_officialMachineMatches(teeId)) {
                revert OfficialMachineUnavailable(index);
            }
            address recovered = PayGuardTypes.recoverFccSigner(
                PayGuardTypes.receiptAttestationDigest(
                    _copyBinding(binding), _copyReceipt(receipt)
                ),
                receipt.signature
            );
            if (recovered == address(0) || recovered != teeId) revert InvalidSignature();
        }

        policies[binding.policyCommitment] =
            PolicyRecord({ binding: binding, status: STATUS_ACTIVE, registered: true });
        emit PolicyRegistered(
            binding.policyCommitment, binding.policyId, binding.owner, binding.policyVersion
        );
    }

    /// @notice Governance may stop new registrations/requests/evaluations
    /// globally, but cannot mutate or resume an individual owner's policy.
    function setGlobalPause(
        bool paused
    ) external {
        if (msg.sender != admin) revert NotAdmin();
        if (globallyPaused == paused) revert InvalidState();
        globallyPaused = paused;
        emit GlobalPauseUpdated(paused);
    }

    /// @notice Permanently removes governance after release configuration.
    /// Renunciation is forbidden while paused so it cannot strand new work in
    /// a permanently disabled state.
    function renounceAdmin() external {
        if (msg.sender != admin) revert NotAdmin();
        if (globallyPaused) revert InvalidState();
        address formerAdmin = admin;
        admin = address(0);
        emit AdminRenounced(formerAdmin);
    }

    function stopPolicy(
        bytes32 policyCommitment
    ) external {
        PolicyRecord storage record = _ownedPolicy(policyCommitment);
        if (record.status != STATUS_ACTIVE) revert InvalidState();
        record.status = STATUS_STOPPED;
        emit PolicyStopped(policyCommitment);
    }

    function resumePolicy(
        bytes32 policyCommitment
    ) external {
        PolicyRecord storage record = _ownedPolicy(policyCommitment);
        if (record.status != STATUS_STOPPED) revert InvalidState();
        record.status = STATUS_ACTIVE;
        emit PolicyResumed(policyCommitment);
    }

    function revokePolicy(
        bytes32 policyCommitment
    ) external {
        PolicyRecord storage record = _ownedPolicy(policyCommitment);
        if (record.status == STATUS_REVOKED) revert InvalidState();
        record.status = STATUS_REVOKED;
        emit PolicyRevoked(policyCommitment);
    }

    function _ownedPolicy(
        bytes32 policyCommitment
    ) private view returns (PolicyRecord storage record) {
        record = policies[policyCommitment];
        if (!record.registered) revert UnknownPolicy();
        if (msg.sender != record.binding.owner) revert NotPolicyOwner();
    }

    function _effectiveStatus(
        uint8 storedStatus
    ) private view returns (uint8) {
        if (globallyPaused && storedStatus == STATUS_ACTIVE) return STATUS_STOPPED;
        return storedStatus;
    }

    function _officialMachineMatches(
        address teeId
    ) private view returns (bool) {
        if (
            teeManager.getTeeMachineStatus(teeId) != TEE_STATUS_PRODUCTION
                || teeManager.getExtensionId(teeId) != expectedExtensionId
        ) return false;

        IFlareTeeManager.TeeMachine memory machine = teeManager.getTeeMachine(teeId);
        IFlareTeeManager.TeeMachineAttestation memory attestation =
            teeManager.getTeeMachineWithAttestationData(teeId);
        bool acceptedAttestationIdentity = attestation.initialTeeId == teeId
            || (allowSimulatedTee
                && attestation.initialTeeId == address(0)
                && attestation.platform == SIMULATED_TEE_PLATFORM);
        return machine.teeId == teeId && machine.teeProxyId != address(0)
            && bytes(machine.url).length != 0 && attestation.teeId == teeId
            && acceptedAttestationIdentity && attestation.codeHash == expectedCodeHash
            && attestation.platform != bytes32(0)
            && keccak256(bytes(machine.url)) == keccak256(bytes(attestation.url))
            && teeManager.isCodeHashPlatformSupported(
            expectedExtensionId, expectedCodeHash, attestation.platform
        )
            && !teeManager.isCodeHashPlatformDisabled(
            expectedExtensionId, expectedCodeHash, attestation.platform
        );
    }

    function _distinctMachineSet(
        PayGuardTypes.PolicyBinding calldata binding
    ) private pure returns (bool) {
        return binding.machineIds[0] != bytes32(0) && binding.machineIds[1] != bytes32(0)
            && binding.machineIds[2] != bytes32(0) && binding.machineIds[0] != binding.machineIds[1]
            && binding.machineIds[0] != binding.machineIds[2]
            && binding.machineIds[1] != binding.machineIds[2]
            && binding.keyFingerprints[0] != bytes32(0) && binding.keyFingerprints[1] != bytes32(0)
            && binding.keyFingerprints[2] != bytes32(0)
            && binding.keyFingerprints[0] != binding.keyFingerprints[1]
            && binding.keyFingerprints[0] != binding.keyFingerprints[2]
            && binding.keyFingerprints[1] != binding.keyFingerprints[2];
    }

    function _teeId(
        bytes32 machineId
    ) private pure returns (address) {
        uint256 value = uint256(machineId);
        if (value > type(uint160).max) return address(0);
        return address(uint160(value));
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
}
