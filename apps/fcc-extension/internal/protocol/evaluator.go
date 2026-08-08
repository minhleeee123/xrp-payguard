package protocol

import (
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

const (
	DecisionDeny  uint8 = 0
	DecisionAllow uint8 = 1

	ReasonOK                    uint8 = 0
	ReasonPolicyDenied          uint8 = 1
	ReasonMalformed             uint8 = 2
	ReasonWrongDomain           uint8 = 3
	ReasonStaleInput            uint8 = 4
	ReasonDependencyUnavailable uint8 = 5
	ReasonExpired               uint8 = 6
	ReasonStopped               uint8 = 7
	ReasonInsufficientBalance   uint8 = 8
	ReasonCapExceeded           uint8 = 9
	ReasonOccurrenceExceeded    uint8 = 10
	ReasonTargetDenied          uint8 = 11
	ReasonRequesterDenied       uint8 = 12
	ReasonActionDenied          uint8 = 13
	ReasonFTSOInvalid           uint8 = 14
	ReasonCooldown              uint8 = 15
)

type FTSOSnapshotV1 struct {
	FeedID     common.Hash
	Value      *big.Int
	Decimals   uint8
	Timestamp  uint64
	Checkpoint common.Hash
}

type SpendStateV1 struct {
	AvailableBalance  *big.Int
	DailySpend        *big.Int
	RollingSpend      *big.Int
	OccurrenceCount   uint32
	LastExecutionAt   uint64
	SpendCheckpoint   common.Hash
	BalanceCheckpoint common.Hash
	Now               uint64
	FTSO              *FTSOSnapshotV1
}

func zeroHash() common.Hash { return common.Hash{} }

func denied(request ActionRequestV1, reason uint8, now uint64) EvaluationResultV1 {
	return EvaluationResultV1{Request: request, Decision: DecisionDeny, PublicReasonClass: reason, ReservedAmount: new(big.Int), ResultingCheckpoint: request.SpendCheckpoint, ResultNonce: request.RequestID, Attempt: request.Attempt, IssuedAt: now, Expiry: request.Expiry, MachineID: zeroHash(), KeyFingerprint: zeroHash()}
}

func containsAddress(values []common.Address, value common.Address) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

func containsHash(values []common.Hash, value common.Hash) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

// ReferenceValueV1 converts an asset amount to its reference value and rounds
// upward so a fractional unit cannot bypass a cap.
func ReferenceValueV1(amount, price *big.Int, decimals uint8) (*big.Int, bool) {
	if amount == nil || price == nil || amount.Sign() < 0 || amount.Cmp(maxUint256) > 0 || price.Sign() <= 0 || price.Cmp(maxUint256) > 0 || decimals > 36 {
		return nil, false
	}
	scale := new(big.Int).Exp(big.NewInt(10), new(big.Int).SetUint64(uint64(decimals)), nil)
	if amount.Sign() != 0 {
		limit := new(big.Int).Div(new(big.Int).Set(maxUint256), amount)
		if price.Cmp(limit) > 0 {
			return nil, false
		}
	}
	product := new(big.Int).Mul(amount, price)
	quotient, remainder := new(big.Int), new(big.Int)
	quotient.QuoRem(product, scale, remainder)
	if remainder.Sign() != 0 {
		quotient.Add(quotient, big.NewInt(1))
	}
	return quotient, true
}

func calculateNextCheckpoint(request ActionRequestV1, amount *big.Int, occurrence uint32, now uint64) (common.Hash, error) {
	requestHash, err := ActionRequestHash(request)
	if err != nil {
		return common.Hash{}, err
	}
	types, err := abi.NewType("bytes32", "", nil)
	if err != nil {
		return common.Hash{}, err
	}
	types2, err := abi.NewType("uint256", "", nil)
	if err != nil {
		return common.Hash{}, err
	}
	types3, err := abi.NewType("uint32", "", nil)
	if err != nil {
		return common.Hash{}, err
	}
	types4, err := abi.NewType("uint64", "", nil)
	if err != nil {
		return common.Hash{}, err
	}
	encoded, err := (abi.Arguments{{Type: types}, {Type: types}, {Type: types2}, {Type: types3}, {Type: types4}}).Pack(request.SpendCheckpoint, requestHash, amount, occurrence, now)
	if err != nil {
		return common.Hash{}, err
	}
	return crypto.Keccak256Hash(encoded), nil
}

func EvaluatePolicy(policy PolicyV1, request ActionRequestV1, state SpendStateV1) (EvaluationResultV1, error) {
	normalized, err := normalizePolicy(policy)
	if err != nil {
		return EvaluationResultV1{}, err
	}
	commitment, err := PolicyCommitment(normalized)
	if err != nil {
		return EvaluationResultV1{}, err
	}
	if state.AvailableBalance == nil || state.DailySpend == nil || state.RollingSpend == nil || state.AvailableBalance.Sign() < 0 || state.DailySpend.Sign() < 0 || state.RollingSpend.Sign() < 0 || request.Amount == nil || request.Amount.Sign() < 0 {
		return denied(request, ReasonMalformed, state.Now), nil
	}
	if request.ChainID == nil || request.ChainID.Cmp(normalized.ChainID) != 0 || request.Registry != normalized.Registry || request.Vault != normalized.Vault || request.Router != normalized.Router || request.PolicyID != normalized.PolicyID || request.PolicyVersion != normalized.PolicyVersion || request.PolicyCommitment != commitment {
		return denied(request, ReasonWrongDomain, state.Now), nil
	}
	if request.SpendCheckpoint != state.SpendCheckpoint || request.BalanceCheckpoint != state.BalanceCheckpoint {
		return denied(request, ReasonStaleInput, state.Now), nil
	}
	if request.Asset != normalized.Asset || request.ActionType != ActionFTestXRPTransfer || request.Amount.Sign() == 0 || request.CreatedAt > state.Now || request.Expiry < state.Now || request.GraceDeadline < request.CreatedAt || request.Expiry < request.GraceDeadline {
		if request.Expiry < state.Now {
			return denied(request, ReasonExpired, state.Now), nil
		}
		return denied(request, ReasonMalformed, state.Now), nil
	}
	if state.Now < normalized.StartAt || (normalized.EndAt != 0 && state.Now > normalized.EndAt) {
		return denied(request, ReasonPolicyDenied, state.Now), nil
	}
	if containsAddress(normalized.DenyTargets, request.Target) || (len(normalized.AllowTargets) > 0 && !containsAddress(normalized.AllowTargets, request.Target)) {
		return denied(request, ReasonTargetDenied, state.Now), nil
	}
	if len(normalized.AllowRequesters) > 0 && !containsAddress(normalized.AllowRequesters, request.Requester) {
		return denied(request, ReasonRequesterDenied, state.Now), nil
	}
	if len(normalized.AllowActionTypes) > 0 && !containsHash(normalized.AllowActionTypes, request.ActionType) {
		return denied(request, ReasonActionDenied, state.Now), nil
	}
	if normalized.MaxOccurrences != 0 && state.OccurrenceCount >= normalized.MaxOccurrences {
		return denied(request, ReasonOccurrenceExceeded, state.Now), nil
	}
	if normalized.CooldownSecs != 0 && state.LastExecutionAt != 0 && state.Now < state.LastExecutionAt+normalized.CooldownSecs {
		return denied(request, ReasonCooldown, state.Now), nil
	}
	if state.AvailableBalance.Cmp(request.Amount) < 0 {
		return denied(request, ReasonInsufficientBalance, state.Now), nil
	}
	referenceValue := new(big.Int).Set(request.Amount)
	if normalized.RequireFTSO {
		if state.FTSO == nil || state.FTSO.Value == nil || state.FTSO.FeedID != normalized.FTSOFeedID || state.FTSO.Timestamp > state.Now || state.Now-state.FTSO.Timestamp > normalized.MaxPriceAgeSecs || state.FTSO.Checkpoint == zeroHash() || request.InputCommitment != state.FTSO.Checkpoint {
			return denied(request, ReasonFTSOInvalid, state.Now), nil
		}
		value, valid := ReferenceValueV1(request.Amount, state.FTSO.Value, state.FTSO.Decimals)
		if !valid {
			return denied(request, ReasonFTSOInvalid, state.Now), nil
		}
		referenceValue = value
	}
	if (normalized.MaxPerAction.Sign() != 0 && referenceValue.Cmp(normalized.MaxPerAction) > 0) || (normalized.DailyCap.Sign() != 0 && new(big.Int).Add(new(big.Int).Set(state.DailySpend), referenceValue).Cmp(normalized.DailyCap) > 0) || (normalized.RollingCap.Sign() != 0 && new(big.Int).Add(new(big.Int).Set(state.RollingSpend), referenceValue).Cmp(normalized.RollingCap) > 0) {
		return denied(request, ReasonCapExceeded, state.Now), nil
	}
	nextCheckpoint, err := calculateNextCheckpoint(request, request.Amount, state.OccurrenceCount+1, state.Now)
	if err != nil {
		return EvaluationResultV1{}, err
	}
	return EvaluationResultV1{Request: request, Decision: DecisionAllow, PublicReasonClass: ReasonOK, ReservedAmount: new(big.Int).Set(request.Amount), ResultingCheckpoint: nextCheckpoint, ResultNonce: request.RequestID, Attempt: request.Attempt, IssuedAt: state.Now, Expiry: request.Expiry, MachineID: zeroHash(), KeyFingerprint: zeroHash()}, nil
}
