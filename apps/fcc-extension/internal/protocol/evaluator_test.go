package protocol

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func stateFromVector(request ActionRequestV1) SpendStateV1 {
	return SpendStateV1{AvailableBalance: big.NewInt(100), DailySpend: new(big.Int), RollingSpend: new(big.Int), OccurrenceCount: 0, LastExecutionAt: 0, SpendCheckpoint: request.SpendCheckpoint, BalanceCheckpoint: request.BalanceCheckpoint, Now: 1050}
}

func TestEvaluatorMatchesGoldenVector(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	request := requestFromVector(vector.Request)
	result, err := EvaluatePolicy(policy, request, stateFromVector(request))
	if err != nil {
		t.Fatal(err)
	}
	if result.Decision != DecisionAllow || result.PublicReasonClass != ReasonOK || result.ReservedAmount.Cmp(big.NewInt(75)) != 0 {
		t.Fatalf("unexpected allow result: %+v", result)
	}
	if result.ResultingCheckpoint != mustHash(vector.Result.ResultingCheckpoint) {
		t.Fatalf("checkpoint mismatch: %s", result.ResultingCheckpoint.Hex())
	}
	result.MachineID = mustHash(vector.Result.MachineID)
	result.KeyFingerprint = mustHash(vector.Result.KeyFingerprint)
	digest, err := EvaluationDigest(result)
	if err != nil {
		t.Fatal(err)
	}
	if digest != mustHash(vector.Expected.EvaluationDigest) {
		t.Fatalf("evaluation digest mismatch: %s", digest.Hex())
	}
}

func TestEvaluatorDeniesFailClosed(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	request := requestFromVector(vector.Request)
	state := stateFromVector(request)

	wrongDomain := request
	wrongDomain.ChainID = big.NewInt(115)
	result, err := EvaluatePolicy(policy, wrongDomain, state)
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonWrongDomain {
		t.Fatalf("wrong domain reason: %d", result.PublicReasonClass)
	}

	deniedPolicy := policy
	deniedPolicy.DenyTargets = []common.Address{request.Target}
	deniedCommitment, err := PolicyCommitment(deniedPolicy)
	if err != nil {
		t.Fatal(err)
	}
	deniedRequest := request
	deniedRequest.PolicyCommitment = deniedCommitment
	result, err = EvaluatePolicy(deniedPolicy, deniedRequest, state)
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonTargetDenied {
		t.Fatalf("target reason: %d", result.PublicReasonClass)
	}

	cappedPolicy := policy
	cappedPolicy.MaxPerAction = big.NewInt(50)
	cappedCommitment, err := PolicyCommitment(cappedPolicy)
	if err != nil {
		t.Fatal(err)
	}
	cappedRequest := request
	cappedRequest.PolicyCommitment = cappedCommitment
	result, err = EvaluatePolicy(cappedPolicy, cappedRequest, state)
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonCapExceeded {
		t.Fatalf("cap reason: %d", result.PublicReasonClass)
	}

	insufficient := request
	insufficient.Amount = big.NewInt(101)
	result, err = EvaluatePolicy(policy, insufficient, state)
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonInsufficientBalance {
		t.Fatalf("balance reason: %d", result.PublicReasonClass)
	}

	expired := request
	expired.Expiry = 1049
	result, err = EvaluatePolicy(policy, expired, state)
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonExpired {
		t.Fatalf("expiry reason: %d", result.PublicReasonClass)
	}

	ftsoPolicy := policy
	ftsoPolicy.RequireFTSO = true
	ftsoPolicy.FTSOFeedID = mustHash("0x000000000000000000000000000000000000000000000000000000000066656564")
	ftsoCommitment, err := PolicyCommitment(ftsoPolicy)
	if err != nil {
		t.Fatal(err)
	}
	ftsoRequest := request
	ftsoRequest.PolicyCommitment = ftsoCommitment
	result, err = EvaluatePolicy(ftsoPolicy, ftsoRequest, state)
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonFTSOInvalid {
		t.Fatalf("FTSO reason: %d", result.PublicReasonClass)
	}
}
