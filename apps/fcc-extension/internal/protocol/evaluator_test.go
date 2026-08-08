package protocol

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func stateFromVector(request ActionRequestV1) SpendStateV1 {
	return SpendStateV1{AvailableBalance: big.NewInt(100), History: []SpendHistoryEntryV1{}, OccurrenceCount: 0, LastAccountingAt: 0, SpendCheckpoint: request.SpendCheckpoint, BalanceCheckpoint: request.BalanceCheckpoint, Now: 1050}
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

func TestEvaluatorDefaultsDelegationToOwnerOnly(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	policy.AllowRequesters = nil
	request, state := rebindPolicyRequest(t, policy, requestFromVector(vector.Request))
	result, err := EvaluatePolicy(policy, request, state)
	if err != nil || result.Decision != DecisionAllow {
		t.Fatalf("owner denied: result=%+v err=%v", result, err)
	}
	delegate := common.HexToAddress("0x00000000000000000000000000000000000000d4")
	request.Requester = delegate
	result, err = EvaluatePolicy(policy, request, state)
	if err != nil || result.PublicReasonClass != ReasonRequesterDenied {
		t.Fatalf("unlisted delegate: result=%+v err=%v", result, err)
	}
	policy.AllowRequesters = []common.Address{delegate}
	request, state = rebindPolicyRequest(t, policy, request)
	result, err = EvaluatePolicy(policy, request, state)
	if err != nil || result.Decision != DecisionAllow {
		t.Fatalf("listed delegate denied: result=%+v err=%v", result, err)
	}
}

func TestEvaluatorDerivesCapsFromCheckpointBoundHistory(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	policy.MaxPerAction = new(big.Int)
	policy.DailyCap = big.NewInt(100)
	policy.RollingCap = big.NewInt(100)
	first, firstState := rebindPolicyRequest(t, policy, requestFromVector(vector.Request))
	firstResult, err := EvaluatePolicy(policy, first, firstState)
	if err != nil || firstResult.Decision != DecisionAllow {
		t.Fatalf("first history request denied: result=%+v err=%v", firstResult, err)
	}
	second := first
	second.RequestID = common.BytesToHash([]byte("history-request-2"))
	second.RequestNonce = 2
	second.Occurrence = 2
	second.ScheduleSlot = 4600
	second.SpendCheckpoint = firstResult.ResultingCheckpoint
	second.CreatedAt = 4601
	second.GraceDeadline = 4700
	second.Expiry = 4700
	state := SpendStateV1{AvailableBalance: big.NewInt(100), History: []SpendHistoryEntryV1{{Request: first, AccountedAt: 1050}}, OccurrenceCount: 1, LastAccountingAt: 1050, SpendCheckpoint: firstResult.ResultingCheckpoint, BalanceCheckpoint: second.BalanceCheckpoint, Now: 4650}
	result, err := EvaluatePolicy(policy, second, state)
	if err != nil || result.PublicReasonClass != ReasonCapExceeded {
		t.Fatalf("history cap not enforced: result=%+v err=%v", result, err)
	}
	missing := state
	missing.History = []SpendHistoryEntryV1{}
	if result, err = EvaluatePolicy(policy, second, missing); err != nil || result.PublicReasonClass != ReasonStaleInput {
		t.Fatalf("missing history accepted: result=%+v err=%v", result, err)
	}
	absent := state
	absent.History = nil
	if result, err = EvaluatePolicy(policy, second, absent); err != nil || result.PublicReasonClass != ReasonMalformed {
		t.Fatalf("absent history accepted: result=%+v err=%v", result, err)
	}
	tampered := state
	tamperedRequest := first
	tamperedRequest.Amount = big.NewInt(1)
	tampered.History = []SpendHistoryEntryV1{{Request: tamperedRequest, AccountedAt: 1050}}
	if result, err = EvaluatePolicy(policy, second, tampered); err != nil || result.PublicReasonClass != ReasonStaleInput {
		t.Fatalf("tampered history accepted: result=%+v err=%v", result, err)
	}
}

func TestEvaluatorReplaysHistoricalFTSOValues(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	policy.MaxPerAction = new(big.Int)
	policy.DailyCap = big.NewInt(250)
	policy.RollingCap = big.NewInt(250)
	policy.RequireFTSO = true
	policy.FTSOFeedID = common.BytesToHash([]byte("history-feed"))
	policy.MaxPriceAgeSecs = 60
	first, firstState := rebindPolicyRequest(t, policy, requestFromVector(vector.Request))
	first.InputCommitment = common.BytesToHash([]byte("history-ftso-1"))
	firstFeed := &FTSOSnapshotV1{FeedID: policy.FTSOFeedID, Value: big.NewInt(2), Timestamp: 1040, Checkpoint: first.InputCommitment}
	firstState.FTSO = firstFeed
	firstResult, err := EvaluatePolicy(policy, first, firstState)
	if err != nil || firstResult.Decision != DecisionAllow {
		t.Fatalf("first FTSO history request denied: result=%+v err=%v", firstResult, err)
	}
	second := first
	second.RequestID = common.BytesToHash([]byte("history-ftso-request-2"))
	second.RequestNonce = 2
	second.Occurrence = 2
	second.ScheduleSlot = 4600
	second.SpendCheckpoint = firstResult.ResultingCheckpoint
	second.InputCommitment = common.BytesToHash([]byte("history-ftso-2"))
	second.CreatedAt = 4601
	second.GraceDeadline = 4700
	second.Expiry = 4700
	secondFeed := &FTSOSnapshotV1{FeedID: policy.FTSOFeedID, Value: big.NewInt(2), Timestamp: 4640, Checkpoint: second.InputCommitment}
	state := SpendStateV1{AvailableBalance: big.NewInt(100), History: []SpendHistoryEntryV1{{Request: first, AccountedAt: 1050, FTSO: firstFeed}}, OccurrenceCount: 1, LastAccountingAt: 1050, SpendCheckpoint: firstResult.ResultingCheckpoint, BalanceCheckpoint: second.BalanceCheckpoint, Now: 4650, FTSO: secondFeed}
	result, err := EvaluatePolicy(policy, second, state)
	if err != nil || result.PublicReasonClass != ReasonCapExceeded {
		t.Fatalf("historical FTSO cap not enforced: result=%+v err=%v", result, err)
	}
	state.History[0].FTSO = nil
	if result, err = EvaluatePolicy(policy, second, state); err != nil || result.PublicReasonClass != ReasonFTSOInvalid {
		t.Fatalf("missing historical FTSO snapshot accepted: result=%+v err=%v", result, err)
	}
}
