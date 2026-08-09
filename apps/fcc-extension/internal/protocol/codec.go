package protocol

import (
	"errors"
	"fmt"
	"math/big"
	"sort"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

var (
	PolicySchemaV1             = crypto.Keccak256Hash([]byte("POLICY_SCHEMA_V1"))
	PolicyReceiptTypeHash      = crypto.Keccak256Hash([]byte("POLICY_RECEIPT_V1"))
	ActionRequestTypeHash      = crypto.Keccak256Hash([]byte("ACTION_REQUEST_V1"))
	SpendCheckpointTypeHash    = crypto.Keccak256Hash([]byte("SPEND_CHECKPOINT_V1"))
	EvaluationResultTypeHash   = crypto.Keccak256Hash([]byte("EVALUATION_RESULT_V1"))
	FDCTriggerSnapshotTypeHash = crypto.Keccak256Hash([]byte("FDC_TRIGGER_SNAPSHOT_V1"))
	PolicyInputTypeHash        = crypto.Keccak256Hash([]byte("POLICY_INPUT_V1"))
	FDCXrpPaymentV1            = stringBytes32("XRPPayment")
	ActionFTestXRPTransfer     = crypto.Keccak256Hash([]byte("FTESTXRP_TRANSFER_V1"))
	FCCPolicyReceiptPrefix     = stringBytes32("PAYGUARD_POLICY_RECEIPT_V1")
	FCCEvaluationPrefix        = stringBytes32("PAYGUARD_EVALUATION_V1")
	FCCPolicyIngressPrefix     = stringBytes32("PAYGUARD_POLICY_INGRESS_V1")
)

var maxUint256 = new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 256), big.NewInt(1))

func stringBytes32(value string) common.Hash {
	if len(value) > 32 {
		panic("bytes32 string is too long")
	}
	var result common.Hash
	copy(result[:], value)
	return result
}

type PolicyV1 struct {
	SchemaVersion            uint16
	ChainID                  *big.Int
	Registry                 common.Address
	Vault                    common.Address
	Router                   common.Address
	Owner                    common.Address
	PolicyID                 common.Hash
	PolicyVersion            uint32
	Asset                    common.Address
	ReferenceCurrency        common.Hash
	MaxPerAction             *big.Int
	DailyCap                 *big.Int
	RollingCap               *big.Int
	RollingWindowSecs        uint64
	StartAt                  uint64
	EndAt                    uint64
	ScheduleIntervalSecs     uint64
	ScheduleGraceSecs        uint64
	CooldownSecs             uint64
	MaxOccurrences           uint32
	AllowTargets             []common.Address
	DenyTargets              []common.Address
	AllowRequesters          []common.Address
	AllowActionTypes         []common.Hash
	RequireFTSO              bool
	FTSOFeedID               common.Hash
	MaxPriceAgeSecs          uint64
	RequireFDC               bool
	FDCAttestationType       common.Hash
	FDCSourceID              common.Hash
	FDCSourceAddressHash     common.Hash
	FDCReceivingAddressHash  common.Hash
	FDCMemoMode              uint8
	FDCRequireDestinationTag bool
	FDCDestinationTag        uint32
	FDCMinReceivedAmount     *big.Int
	FDCMaxReceivedAmount     *big.Int
	MaxFDCAgeSecs            uint64
	FDCConsumer              common.Address
	PrivateSalt              common.Hash
	SubmissionNonce          common.Hash
}

type PolicyBindingV1 struct {
	ChainID          *big.Int
	Registry         common.Address
	Vault            common.Address
	Router           common.Address
	Owner            common.Address
	PolicyID         common.Hash
	PolicyVersion    uint32
	PolicyCommitment common.Hash
	Schema           common.Hash
	ExtensionID      common.Hash
	CodeVersion      common.Hash
	MachineIDs       [3]common.Hash
	KeyFingerprints  [3]common.Hash
	CustodyThreshold uint8
	ResultThreshold  uint8
	PolicyNonce      uint64
}

type PolicyReceiptV1 struct {
	Binding         PolicyBindingV1
	MachineID       common.Hash
	KeyFingerprint  common.Hash
	SubmissionNonce common.Hash
	ReceiptNonce    uint64
	IssuedAt        uint64
	Expiry          uint64
}

type ActionRequestV1 struct {
	ChainID           *big.Int
	Registry          common.Address
	Vault             common.Address
	Router            common.Address
	PolicyID          common.Hash
	PolicyVersion     uint32
	PolicyCommitment  common.Hash
	RequestID         common.Hash
	RequestNonce      *big.Int
	Attempt           uint32
	Requester         common.Address
	Target            common.Address
	Asset             common.Address
	ActionType        common.Hash
	Amount            *big.Int
	ScheduleSlot      uint64
	Occurrence        uint32
	SpendCheckpoint   common.Hash
	BalanceCheckpoint common.Hash
	InputCommitment   common.Hash
	CreatedAt         uint64
	GraceDeadline     uint64
	Expiry            uint64
}

type EvaluationResultV1 struct {
	Request             ActionRequestV1
	Decision            uint8
	PublicReasonClass   uint8
	ReservedAmount      *big.Int
	ResultingCheckpoint common.Hash
	ResultNonce         common.Hash
	Attempt             uint32
	IssuedAt            uint64
	Expiry              uint64
	MachineID           common.Hash
	KeyFingerprint      common.Hash
}

type FDCTriggerSnapshotV1 struct {
	AttestationType      common.Hash
	SourceID             common.Hash
	TransactionID        common.Hash
	ProofOwner           common.Address
	Consumer             common.Address
	InputCommitment      common.Hash
	ProofCommitment      common.Hash
	SourceAddressHash    common.Hash
	ReceivingAddressHash common.Hash
	ReceivedAmount       *big.Int
	HasMemoData          bool
	MemoDataHash         common.Hash
	HasDestinationTag    bool
	DestinationTag       uint32
	BlockNumber          uint64
	BlockTimestamp       uint64
	TransactionConsumed  bool
	ProofConsumed        bool
	RequestID            common.Hash
	RouterRequestHash    common.Hash
	RouterRequestStatus  uint8
}

func uint256(value *big.Int, label string) (*big.Int, error) {
	if value == nil || value.Sign() < 0 || value.Cmp(maxUint256) > 0 {
		return nil, fmt.Errorf("%s must be uint256", label)
	}
	return new(big.Int).Set(value), nil
}

func abiArguments(typeNames ...string) (abi.Arguments, error) {
	arguments := make(abi.Arguments, len(typeNames))
	for index, name := range typeNames {
		typeValue, err := abi.NewType(name, "", nil)
		if err != nil {
			return nil, fmt.Errorf("abi type %s: %w", name, err)
		}
		arguments[index] = abi.Argument{Type: typeValue}
	}
	return arguments, nil
}

func pack(typeNames []string, values ...interface{}) ([]byte, error) {
	arguments, err := abiArguments(typeNames...)
	if err != nil {
		return nil, err
	}
	return arguments.Pack(values...)
}

func digest(typeNames []string, values ...interface{}) (common.Hash, error) {
	encoded, err := pack(typeNames, values...)
	if err != nil {
		return common.Hash{}, err
	}
	return crypto.Keccak256Hash(encoded), nil
}

func copyAndSortAddresses(values []common.Address, label string) ([]common.Address, error) {
	result := append([]common.Address(nil), values...)
	sort.Slice(result, func(left, right int) bool { return string(result[left].Bytes()) < string(result[right].Bytes()) })
	for index := 1; index < len(result); index++ {
		if result[index] == result[index-1] {
			return nil, fmt.Errorf("%s contains duplicates", label)
		}
	}
	return result, nil
}

func copyAndSortHashes(values []common.Hash, label string) ([]common.Hash, error) {
	result := append([]common.Hash(nil), values...)
	sort.Slice(result, func(left, right int) bool { return string(result[left].Bytes()) < string(result[right].Bytes()) })
	for index := 1; index < len(result); index++ {
		if result[index] == result[index-1] {
			return nil, fmt.Errorf("%s contains duplicates", label)
		}
	}
	return result, nil
}

func normalizePolicy(policy PolicyV1) (PolicyV1, error) {
	if policy.SchemaVersion != 1 {
		return PolicyV1{}, errors.New("unsupported policy schema")
	}
	if policy.ChainID == nil || policy.ChainID.Sign() <= 0 || policy.MaxPerAction == nil || policy.DailyCap == nil || policy.RollingCap == nil {
		return PolicyV1{}, errors.New("missing unsigned policy value")
	}
	if policy.Registry == (common.Address{}) || policy.Vault == (common.Address{}) || policy.Router == (common.Address{}) || policy.Owner == (common.Address{}) || policy.Asset == (common.Address{}) {
		return PolicyV1{}, errors.New("policy addresses must be non-zero")
	}
	if policy.PolicyID == (common.Hash{}) || policy.ReferenceCurrency == (common.Hash{}) || policy.PrivateSalt == (common.Hash{}) || policy.SubmissionNonce == (common.Hash{}) {
		return PolicyV1{}, errors.New("policy identifiers and nonces must be non-zero")
	}
	if policy.RollingCap.Sign() != 0 && policy.RollingWindowSecs == 0 {
		return PolicyV1{}, errors.New("rolling window is required")
	}
	if (policy.ScheduleIntervalSecs == 0) != (policy.ScheduleGraceSecs == 0) {
		return PolicyV1{}, errors.New("schedule interval and grace must both be zero or positive")
	}
	if policy.ScheduleIntervalSecs != 0 {
		firstWindow, valid := ScheduleWindowV1(policy.StartAt, policy.ScheduleIntervalSecs, policy.ScheduleGraceSecs, 1)
		if !valid || (policy.EndAt != 0 && firstWindow.Deadline > policy.EndAt) {
			return PolicyV1{}, errors.New("invalid recurring schedule")
		}
	}
	maxPerAction, err := uint256(policy.MaxPerAction, "maxPerAction")
	if err != nil {
		return PolicyV1{}, err
	}
	dailyCap, err := uint256(policy.DailyCap, "dailyCap")
	if err != nil {
		return PolicyV1{}, err
	}
	rollingCap, err := uint256(policy.RollingCap, "rollingCap")
	if err != nil {
		return PolicyV1{}, err
	}
	allowTargets, err := copyAndSortAddresses(policy.AllowTargets, "allowTargets")
	if err != nil {
		return PolicyV1{}, err
	}
	denyTargets, err := copyAndSortAddresses(policy.DenyTargets, "denyTargets")
	if err != nil {
		return PolicyV1{}, err
	}
	allowRequesters, err := copyAndSortAddresses(policy.AllowRequesters, "allowRequesters")
	if err != nil {
		return PolicyV1{}, err
	}
	allowActionTypes, err := copyAndSortHashes(policy.AllowActionTypes, "allowActionTypes")
	if err != nil {
		return PolicyV1{}, err
	}
	if policy.EndAt != 0 && policy.EndAt <= policy.StartAt {
		return PolicyV1{}, errors.New("endAt must be after startAt")
	}
	if policy.RequireFTSO && policy.FTSOFeedID == (common.Hash{}) {
		return PolicyV1{}, errors.New("FTSO feed is required")
	}
	if !policy.RequireFTSO && policy.FTSOFeedID != (common.Hash{}) {
		return PolicyV1{}, errors.New("unexpected FTSO feed")
	}
	if policy.RequireFDC {
		if policy.FDCAttestationType != FDCXrpPaymentV1 || policy.FDCSourceID == (common.Hash{}) ||
			policy.FDCSourceAddressHash == (common.Hash{}) || policy.FDCReceivingAddressHash == (common.Hash{}) ||
			policy.FDCMemoMode != 1 || policy.FDCMinReceivedAmount == nil || policy.FDCMaxReceivedAmount == nil ||
			policy.FDCMinReceivedAmount.Sign() <= 0 || policy.FDCMaxReceivedAmount.Cmp(policy.FDCMinReceivedAmount) < 0 ||
			policy.MaxFDCAgeSecs == 0 || policy.FDCConsumer == (common.Address{}) {
			return PolicyV1{}, errors.New("required FDC descriptor is incomplete")
		}
	} else {
		minZero := policy.FDCMinReceivedAmount == nil || policy.FDCMinReceivedAmount.Sign() == 0
		maxZero := policy.FDCMaxReceivedAmount == nil || policy.FDCMaxReceivedAmount.Sign() == 0
		if policy.FDCAttestationType != (common.Hash{}) || policy.FDCSourceID != (common.Hash{}) ||
			policy.FDCSourceAddressHash != (common.Hash{}) || policy.FDCReceivingAddressHash != (common.Hash{}) ||
			policy.FDCMemoMode != 0 || policy.FDCRequireDestinationTag || policy.FDCDestinationTag != 0 ||
			!minZero || !maxZero || policy.MaxFDCAgeSecs != 0 || policy.FDCConsumer != (common.Address{}) {
			return PolicyV1{}, errors.New("unexpected FDC descriptor")
		}
	}
	fdcMin := policy.FDCMinReceivedAmount
	if fdcMin == nil {
		fdcMin = new(big.Int)
	}
	fdcMax := policy.FDCMaxReceivedAmount
	if fdcMax == nil {
		fdcMax = new(big.Int)
	}
	fdcMin, err = uint256(fdcMin, "fdcMinReceivedAmount")
	if err != nil {
		return PolicyV1{}, err
	}
	fdcMax, err = uint256(fdcMax, "fdcMaxReceivedAmount")
	if err != nil {
		return PolicyV1{}, err
	}
	policy.ChainID = new(big.Int).Set(policy.ChainID)
	policy.MaxPerAction, policy.DailyCap, policy.RollingCap = maxPerAction, dailyCap, rollingCap
	policy.FDCMinReceivedAmount, policy.FDCMaxReceivedAmount = fdcMin, fdcMax
	policy.AllowTargets, policy.DenyTargets, policy.AllowRequesters, policy.AllowActionTypes = allowTargets, denyTargets, allowRequesters, allowActionTypes
	return policy, nil
}

func EncodePolicyV1(policy PolicyV1) ([]byte, error) {
	normalized, err := normalizePolicy(policy)
	if err != nil {
		return nil, err
	}
	types := []string{"uint16", "uint256", "address", "address", "address", "address", "bytes32", "uint32", "address", "bytes32", "uint256", "uint256", "uint256", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint32", "address[]", "address[]", "address[]", "bytes32[]", "bool", "bytes32", "uint64", "bool", "bytes32", "bytes32", "bytes32", "bytes32", "uint8", "bool", "uint32", "uint256", "uint256", "uint64", "address", "bytes32", "bytes32"}
	return pack(types, normalized.SchemaVersion, normalized.ChainID, normalized.Registry, normalized.Vault, normalized.Router, normalized.Owner, normalized.PolicyID,
		normalized.PolicyVersion, normalized.Asset, normalized.ReferenceCurrency, normalized.MaxPerAction, normalized.DailyCap, normalized.RollingCap,
		normalized.RollingWindowSecs, normalized.StartAt, normalized.EndAt, normalized.ScheduleIntervalSecs, normalized.ScheduleGraceSecs, normalized.CooldownSecs, normalized.MaxOccurrences, normalized.AllowTargets,
		normalized.DenyTargets, normalized.AllowRequesters, normalized.AllowActionTypes, normalized.RequireFTSO, normalized.FTSOFeedID,
		normalized.MaxPriceAgeSecs, normalized.RequireFDC, normalized.FDCAttestationType, normalized.FDCSourceID,
		normalized.FDCSourceAddressHash, normalized.FDCReceivingAddressHash, normalized.FDCMemoMode,
		normalized.FDCRequireDestinationTag, normalized.FDCDestinationTag, normalized.FDCMinReceivedAmount,
		normalized.FDCMaxReceivedAmount, normalized.MaxFDCAgeSecs, normalized.FDCConsumer,
		normalized.PrivateSalt, normalized.SubmissionNonce)
}

func FDCTriggerSnapshotCommitmentV1(snapshot FDCTriggerSnapshotV1) (common.Hash, error) {
	receivedAmount, err := uint256(snapshot.ReceivedAmount, "receivedAmount")
	if err != nil {
		return common.Hash{}, err
	}
	return digest(
		[]string{"bytes32", "bytes32", "bytes32", "bytes32", "address", "address", "bytes32", "bytes32", "bytes32", "bytes32", "uint256", "bool", "bytes32", "bool", "uint32", "uint64", "uint64", "bool", "bool", "bytes32", "bytes32", "uint8"},
		FDCTriggerSnapshotTypeHash, snapshot.AttestationType, snapshot.SourceID, snapshot.TransactionID,
		snapshot.ProofOwner, snapshot.Consumer, snapshot.InputCommitment, snapshot.ProofCommitment,
		snapshot.SourceAddressHash, snapshot.ReceivingAddressHash, receivedAmount, snapshot.HasMemoData,
		snapshot.MemoDataHash, snapshot.HasDestinationTag, snapshot.DestinationTag, snapshot.BlockNumber,
		snapshot.BlockTimestamp, snapshot.TransactionConsumed, snapshot.ProofConsumed, snapshot.RequestID,
		snapshot.RouterRequestHash, snapshot.RouterRequestStatus,
	)
}

func PolicyInputCommitmentV1(ftsoCheckpoint, fdcInputCommitment common.Hash) (common.Hash, error) {
	if ftsoCheckpoint == (common.Hash{}) {
		return fdcInputCommitment, nil
	}
	if fdcInputCommitment == (common.Hash{}) {
		return ftsoCheckpoint, nil
	}
	return digest([]string{"bytes32", "bytes32", "bytes32"}, PolicyInputTypeHash, ftsoCheckpoint, fdcInputCommitment)
}

func PolicyCommitment(policy PolicyV1) (common.Hash, error) {
	encoded, err := EncodePolicyV1(policy)
	if err != nil {
		return common.Hash{}, err
	}
	return crypto.Keccak256Hash(encoded), nil
}

func GenesisSpendCheckpoint(policyCommitment common.Hash) (common.Hash, error) {
	return digest(
		[]string{"bytes32", "bytes32", "uint32"},
		SpendCheckpointTypeHash,
		policyCommitment,
		uint32(0),
	)
}

func bindingValues(binding PolicyBindingV1) []interface{} {
	return []interface{}{PolicySchemaV1, binding.ChainID, binding.Registry, binding.Vault, binding.Router, binding.Owner, binding.PolicyID, binding.PolicyVersion,
		binding.PolicyCommitment, binding.Schema, binding.ExtensionID, binding.CodeVersion, binding.MachineIDs, binding.KeyFingerprints,
		binding.CustodyThreshold, binding.ResultThreshold, binding.PolicyNonce}
}

func bindingTypes() []string {
	return []string{"bytes32", "uint256", "address", "address", "address", "address", "bytes32", "uint32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32[3]", "bytes32[3]", "uint8", "uint8", "uint64"}
}

func EncodePolicyBinding(binding PolicyBindingV1) ([]byte, error) {
	return pack(bindingTypes(), bindingValues(binding)...)
}

func PolicyBindingDigest(binding PolicyBindingV1) (common.Hash, error) {
	encoded, err := EncodePolicyBinding(binding)
	if err != nil {
		return common.Hash{}, err
	}
	return crypto.Keccak256Hash(encoded), nil
}

func PolicyReceiptDigest(receipt PolicyReceiptV1) (common.Hash, error) {
	types := append(bindingTypes(), "bytes32", "bytes32", "bytes32", "uint64", "uint64", "uint64")
	values := append(bindingValues(receipt.Binding), receipt.MachineID, receipt.KeyFingerprint, receipt.SubmissionNonce, receipt.ReceiptNonce, receipt.IssuedAt, receipt.Expiry)
	return digest(types, values...)
}

// FCCAttestationMessage is the exact byte sequence passed to tee-node v0.0.24
// POST /sign. The node signs accounts.TextHash(keccak256(message)).
func FCCAttestationMessage(prefix common.Hash, chainID *big.Int, dataHash common.Hash) ([]byte, error) {
	canonicalChainID, err := uint256(chainID, "attestation chainId")
	if err != nil || canonicalChainID.Sign() == 0 {
		return nil, errors.New("attestation chainId must be non-zero uint256")
	}
	if prefix == (common.Hash{}) || dataHash == (common.Hash{}) {
		return nil, errors.New("attestation prefix and data hash must be non-zero")
	}
	return pack([]string{"bytes32", "uint256", "bytes32"}, prefix, canonicalChainID, dataHash)
}

func FCCAttestationDigest(prefix common.Hash, chainID *big.Int, dataHash common.Hash) (common.Hash, error) {
	message, err := FCCAttestationMessage(prefix, chainID, dataHash)
	if err != nil {
		return common.Hash{}, err
	}
	return crypto.Keccak256Hash(message), nil
}

func PolicyReceiptAttestationMessage(receipt PolicyReceiptV1) ([]byte, error) {
	digest, err := PolicyReceiptDigest(receipt)
	if err != nil {
		return nil, err
	}
	return FCCAttestationMessage(FCCPolicyReceiptPrefix, receipt.Binding.ChainID, digest)
}

func PolicyReceiptAttestationDigest(receipt PolicyReceiptV1) (common.Hash, error) {
	message, err := PolicyReceiptAttestationMessage(receipt)
	if err != nil {
		return common.Hash{}, err
	}
	return crypto.Keccak256Hash(message), nil
}

func PolicyIngressAuthorizationDigest(binding PolicyBindingV1, submissionNonce common.Hash, issuedAt, expiry uint64, ciphertextHash, machineID, keyFingerprint common.Hash) (common.Hash, error) {
	if binding.ChainID == nil || binding.ChainID.Sign() <= 0 || binding.Registry == (common.Address{}) || binding.Vault == (common.Address{}) || binding.Router == (common.Address{}) || binding.Owner == (common.Address{}) || binding.PolicyID == (common.Hash{}) || binding.PolicyCommitment == (common.Hash{}) || submissionNonce == (common.Hash{}) || ciphertextHash == (common.Hash{}) || machineID == (common.Hash{}) || keyFingerprint == (common.Hash{}) || issuedAt == 0 || expiry <= issuedAt {
		return common.Hash{}, errors.New("policy ingress authorization domain is incomplete")
	}
	bindingDigest, err := PolicyBindingDigest(binding)
	if err != nil {
		return common.Hash{}, err
	}
	return digest(
		[]string{"bytes32", "bytes32", "bytes32", "uint64", "uint64", "bytes32", "bytes32", "bytes32"},
		FCCPolicyIngressPrefix, bindingDigest, submissionNonce, issuedAt, expiry,
		ciphertextHash, machineID, keyFingerprint,
	)
}

func requestTypes() []string {
	return []string{"bytes32", "uint256", "address", "address", "address", "bytes32", "uint32", "bytes32", "bytes32", "uint256", "uint32", "address", "address", "address", "bytes32", "uint256", "uint64", "uint32", "bytes32", "bytes32", "bytes32", "uint64", "uint64", "uint64"}
}

func requestValues(request ActionRequestV1) []interface{} {
	return []interface{}{ActionRequestTypeHash, request.ChainID, request.Registry, request.Vault, request.Router, request.PolicyID, request.PolicyVersion, request.PolicyCommitment, request.RequestID,
		request.RequestNonce, request.Attempt, request.Requester, request.Target, request.Asset, request.ActionType, request.Amount, request.ScheduleSlot, request.Occurrence,
		request.SpendCheckpoint, request.BalanceCheckpoint, request.InputCommitment, request.CreatedAt, request.GraceDeadline, request.Expiry}
}

func EncodeActionRequest(request ActionRequestV1) ([]byte, error) {
	requestNonce, err := uint256(request.RequestNonce, "requestNonce")
	if err != nil {
		return nil, err
	}
	request.RequestNonce = requestNonce
	return pack(requestTypes(), requestValues(request)...)
}

func ActionRequestHash(request ActionRequestV1) (common.Hash, error) {
	encoded, err := EncodeActionRequest(request)
	if err != nil {
		return common.Hash{}, err
	}
	return crypto.Keccak256Hash(encoded), nil
}

func EvaluationDigest(result EvaluationResultV1) (common.Hash, error) {
	requestHash, err := ActionRequestHash(result.Request)
	if err != nil {
		return common.Hash{}, err
	}
	types := append([]string{"bytes32"}, requestTypes()...)
	types = append(types, "bytes32", "uint8", "uint8", "uint256", "bytes32", "bytes32", "uint32", "uint64", "uint64")
	values := []interface{}{EvaluationResultTypeHash, ActionRequestTypeHash, result.Request.ChainID, result.Request.Registry, result.Request.Vault, result.Request.Router,
		result.Request.PolicyID, result.Request.PolicyVersion, result.Request.PolicyCommitment, result.Request.RequestID, result.Request.RequestNonce, result.Request.Attempt,
		result.Request.Requester, result.Request.Target, result.Request.Asset, result.Request.ActionType, result.Request.Amount, result.Request.ScheduleSlot,
		result.Request.Occurrence, result.Request.SpendCheckpoint, result.Request.BalanceCheckpoint, result.Request.InputCommitment, result.Request.CreatedAt,
		result.Request.GraceDeadline, result.Request.Expiry, requestHash, result.Decision, result.PublicReasonClass, result.ReservedAmount, result.ResultingCheckpoint,
		result.ResultNonce, result.Attempt, result.IssuedAt, result.Expiry}
	return digest(types, values...)
}

func EvaluationAttestationMessage(result EvaluationResultV1) ([]byte, error) {
	digest, err := EvaluationDigest(result)
	if err != nil {
		return nil, err
	}
	return FCCAttestationMessage(FCCEvaluationPrefix, result.Request.ChainID, digest)
}

func EvaluationAttestationDigest(result EvaluationResultV1) (common.Hash, error) {
	message, err := EvaluationAttestationMessage(result)
	if err != nil {
		return common.Hash{}, err
	}
	return crypto.Keccak256Hash(message), nil
}
