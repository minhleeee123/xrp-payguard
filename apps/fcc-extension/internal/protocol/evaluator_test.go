package protocol

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func stateFromVector(request ActionRequestV1) SpendStateV1 {
	return SpendStateV1{AvailableBalance: big.NewInt(100), DailySpend: new(big.Int), RollingSpend: new(big.Int), OccurrenceCount: 0, LastExecutionAt: 0, SpendCheckpoint: request.SpendCheckpoint, BalanceCheckpoint: request.BalanceCheckpoint, Now: 1050}
}

func rebindPolicyRequest(t *testing.T, policy PolicyV1, request ActionRequestV1) (ActionRequestV1, SpendStateV1) {
	t.Helper()
	commitment, err := PolicyCommitment(policy)
	if err != nil {
		t.Fatal(err)
	}
	checkpoint, err := GenesisSpendCheckpoint(commitment)
	if err != nil {
		t.Fatal(err)
	}
	request.PolicyCommitment = commitment
	request.SpendCheckpoint = checkpoint
	return request, stateFromVector(request)
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
	deniedRequest, deniedState := rebindPolicyRequest(t, deniedPolicy, request)
	result, err = EvaluatePolicy(deniedPolicy, deniedRequest, deniedState)
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonTargetDenied {
		t.Fatalf("target reason: %d", result.PublicReasonClass)
	}
	conflictingPolicy := deniedPolicy
	conflictingPolicy.MaxPerAction = big.NewInt(1)
	conflictingRequest, conflictingState := rebindPolicyRequest(t, conflictingPolicy, request)
	conflictingState.AvailableBalance = big.NewInt(1)
	result, err = EvaluatePolicy(conflictingPolicy, conflictingRequest, conflictingState)
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonTargetDenied {
		t.Fatalf("conflict reason: %d", result.PublicReasonClass)
	}

	cappedPolicy := policy
	cappedPolicy.MaxPerAction = big.NewInt(50)
	cappedRequest, cappedState := rebindPolicyRequest(t, cappedPolicy, request)
	result, err = EvaluatePolicy(cappedPolicy, cappedRequest, cappedState)
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
	ftsoRequest, ftsoState := rebindPolicyRequest(t, ftsoPolicy, request)
	result, err = EvaluatePolicy(ftsoPolicy, ftsoRequest, ftsoState)
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonFTSOInvalid {
		t.Fatalf("FTSO reason: %d", result.PublicReasonClass)
	}
}

func TestEvaluatorRejectsStaleStateAndFutureRequest(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	request := requestFromVector(vector.Request)
	state := stateFromVector(request)
	state.SpendCheckpoint = mustHash("other-spend")
	result, err := EvaluatePolicy(policy, request, state)
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonStaleInput {
		t.Fatalf("stale checkpoint reason: %d", result.PublicReasonClass)
	}
	future := request
	future.CreatedAt = state.Now + 1
	result, err = EvaluatePolicy(policy, future, stateFromVector(request))
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonMalformed {
		t.Fatalf("future request reason: %d", result.PublicReasonClass)
	}
	wrongOccurrence := request
	wrongOccurrence.Occurrence++
	result, err = EvaluatePolicy(policy, wrongOccurrence, stateFromVector(request))
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonStaleInput {
		t.Fatalf("occurrence reason: %d", result.PublicReasonClass)
	}
	exhaustedState := stateFromVector(request)
	exhaustedState.OccurrenceCount = ^uint32(0)
	result, err = EvaluatePolicy(policy, request, exhaustedState)
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonStaleInput {
		t.Fatalf("exhausted occurrence reason: %d", result.PublicReasonClass)
	}
	forged := request
	forged.SpendCheckpoint = mustHash("forged-genesis")
	forgedState := stateFromVector(forged)
	result, err = EvaluatePolicy(policy, forged, forgedState)
	if err != nil {
		t.Fatal(err)
	}
	if result.PublicReasonClass != ReasonStaleInput {
		t.Fatalf("genesis reason: %d", result.PublicReasonClass)
	}
}

func TestEvaluatorEnforcesRecurringWindow(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	request := requestFromVector(vector.Request)
	state := stateFromVector(request)
	state.Now = request.GraceDeadline
	result, err := EvaluatePolicy(policy, request, state)
	if err != nil || result.Decision != DecisionAllow {
		t.Fatalf("inclusive deadline denied: result=%+v err=%v", result, err)
	}
	for name, changed := range map[string]ActionRequestV1{
		"slot":  func() ActionRequestV1 { value := request; value.ScheduleSlot++; return value }(),
		"early": func() ActionRequestV1 { value := request; value.CreatedAt = request.ScheduleSlot - 1; return value }(),
		"grace": func() ActionRequestV1 { value := request; value.GraceDeadline++; value.Expiry++; return value }(),
	} {
		result, err = EvaluatePolicy(policy, changed, stateFromVector(request))
		if err != nil || result.PublicReasonClass != ReasonPolicyDenied {
			t.Fatalf("%s schedule mismatch: result=%+v err=%v", name, result, err)
		}
	}
	expiredState := stateFromVector(request)
	expiredState.Now = request.Expiry + 1
	result, err = EvaluatePolicy(policy, request, expiredState)
	if err != nil || result.PublicReasonClass != ReasonExpired {
		t.Fatalf("expired window: result=%+v err=%v", result, err)
	}
	adHocPolicy := policy
	adHocPolicy.ScheduleIntervalSecs = 0
	adHocPolicy.ScheduleGraceSecs = 0
	adHocRequest, adHocState := rebindPolicyRequest(t, adHocPolicy, request)
	adHocRequest.ScheduleSlot = 0
	result, err = EvaluatePolicy(adHocPolicy, adHocRequest, adHocState)
	if err != nil || result.Decision != DecisionAllow {
		t.Fatalf("ad hoc request denied: result=%+v err=%v", result, err)
	}
}
