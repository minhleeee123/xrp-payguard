package protocol

import (
	"encoding/json"
	"math/big"
	"sync"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
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
	second.RequestNonce = big.NewInt(2)
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
	second.RequestNonce = big.NewInt(2)
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

func TestEvaluatorDeniesUint256AndAccumulatedCapOverflow(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	request := requestFromVector(vector.Request)
	state := stateFromVector(request)
	overflow := new(big.Int).Add(new(big.Int).Set(maxUint256), big.NewInt(1))
	state.AvailableBalance = overflow
	result, err := EvaluatePolicy(policy, request, state)
	if err != nil || result.PublicReasonClass != ReasonMalformed {
		t.Fatalf("oversized balance accepted: result=%+v err=%v", result, err)
	}
	state = stateFromVector(request)
	request.Amount = overflow
	if result, err = EvaluatePolicy(policy, request, state); err != nil || result.PublicReasonClass != ReasonMalformed {
		t.Fatalf("oversized amount accepted: result=%+v err=%v", result, err)
	}

	policy = policyFromVector(vector.Policy)
	policy.MaxPerAction = new(big.Int)
	policy.DailyCap = new(big.Int).Set(maxUint256)
	policy.RollingCap = new(big.Int).Set(maxUint256)
	first, firstState := rebindPolicyRequest(t, policy, requestFromVector(vector.Request))
	first.Amount = new(big.Int).Set(maxUint256)
	firstState.AvailableBalance = new(big.Int).Set(maxUint256)
	firstResult, err := EvaluatePolicy(policy, first, firstState)
	if err != nil || firstResult.Decision != DecisionAllow {
		t.Fatalf("max uint256 first request denied: result=%+v err=%v", firstResult, err)
	}
	second := first
	second.RequestID = common.BytesToHash([]byte("overflow-request-2"))
	second.RequestNonce = big.NewInt(2)
	second.Amount = big.NewInt(1)
	second.Occurrence = 2
	second.ScheduleSlot = 4600
	second.SpendCheckpoint = firstResult.ResultingCheckpoint
	second.CreatedAt = 4601
	second.GraceDeadline = 4700
	second.Expiry = 4700
	overflowState := SpendStateV1{AvailableBalance: big.NewInt(1), History: []SpendHistoryEntryV1{{Request: first, AccountedAt: 1050}}, OccurrenceCount: 1, LastAccountingAt: 1050, SpendCheckpoint: firstResult.ResultingCheckpoint, BalanceCheckpoint: second.BalanceCheckpoint, Now: 4650}
	if result, err = EvaluatePolicy(policy, second, overflowState); err != nil || result.PublicReasonClass != ReasonCapExceeded {
		t.Fatalf("accumulated cap overflow accepted: result=%+v err=%v", result, err)
	}
}

func TestEvaluatorTreatsCooldownOverflowAsActive(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	policy.MaxPerAction = new(big.Int)
	policy.DailyCap = new(big.Int)
	policy.RollingCap = new(big.Int)
	policy.StartAt = 0
	policy.EndAt = 0
	policy.ScheduleIntervalSecs = 0
	policy.ScheduleGraceSecs = 0
	policy.CooldownSecs = 10
	first, firstState := rebindPolicyRequest(t, policy, requestFromVector(vector.Request))
	first.ScheduleSlot = 0
	first.CreatedAt = ^uint64(0) - 10
	first.GraceDeadline = ^uint64(0)
	first.Expiry = ^uint64(0)
	firstState.Now = ^uint64(0) - 5
	firstResult, err := EvaluatePolicy(policy, first, firstState)
	if err != nil || firstResult.Decision != DecisionAllow {
		t.Fatalf("first cooldown request denied: result=%+v err=%v", firstResult, err)
	}
	second := first
	second.RequestID = common.BytesToHash([]byte("cooldown-request-2"))
	second.RequestNonce = big.NewInt(2)
	second.Occurrence = 2
	second.SpendCheckpoint = firstResult.ResultingCheckpoint
	second.CreatedAt = ^uint64(0) - 1
	state := SpendStateV1{AvailableBalance: big.NewInt(100), History: []SpendHistoryEntryV1{{Request: first, AccountedAt: ^uint64(0) - 5}}, OccurrenceCount: 1, LastAccountingAt: ^uint64(0) - 5, SpendCheckpoint: firstResult.ResultingCheckpoint, BalanceCheckpoint: second.BalanceCheckpoint, Now: ^uint64(0) - 1}
	result, err := EvaluatePolicy(policy, second, state)
	if err != nil || result.PublicReasonClass != ReasonCooldown {
		t.Fatalf("cooldown overflow allowed: result=%+v err=%v", result, err)
	}
}

func TestEvaluatorIsDeterministicUnderConcurrency(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	request := requestFromVector(vector.Request)
	state := stateFromVector(request)
	expected, err := EvaluatePolicy(policy, request, state)
	if err != nil {
		t.Fatal(err)
	}
	expectedDigest, err := EvaluationDigest(expected)
	if err != nil {
		t.Fatal(err)
	}
	const workers = 64
	start := make(chan struct{})
	errors := make(chan error, workers)
	var wait sync.WaitGroup
	for range workers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			result, evaluateErr := EvaluatePolicy(policy, request, state)
			if evaluateErr != nil {
				errors <- evaluateErr
				return
			}
			digest, digestErr := EvaluationDigest(result)
			if digestErr != nil {
				errors <- digestErr
				return
			}
			if digest != expectedDigest {
				errors <- &determinismError{}
			}
		}()
	}
	close(start)
	wait.Wait()
	close(errors)
	for err := range errors {
		t.Fatal(err)
	}
}

func fdcScenarioFromVector(t *testing.T) (PolicyV1, ActionRequestV1, FDCTriggerSnapshotV1, SpendStateV1) {
	t.Helper()
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	request := requestFromVector(vector.Request)
	policy.RequireFDC = true
	policy.FDCAttestationType = FDCXrpPaymentV1
	policy.FDCSourceID = common.BytesToHash([]byte("XRPL"))
	policy.FDCSourceAddressHash = common.BytesToHash([]byte("source-account"))
	policy.FDCReceivingAddressHash = common.BytesToHash([]byte("receiving-account"))
	policy.FDCMemoMode = 1
	policy.FDCRequireDestinationTag = true
	policy.FDCDestinationTag = 73
	policy.FDCMinReceivedAmount = big.NewInt(70)
	policy.FDCMaxReceivedAmount = big.NewInt(80)
	policy.MaxFDCAgeSecs = 60
	policy.FDCConsumer = request.Router
	request, state := rebindPolicyRequest(t, policy, request)
	request.InputCommitment = common.BytesToHash([]byte("fdc-input"))
	requestHash, err := ActionRequestHash(request)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := FDCTriggerSnapshotV1{
		AttestationType: FDCXrpPaymentV1, SourceID: policy.FDCSourceID,
		TransactionID: common.BytesToHash([]byte("xrpl-transaction")), ProofOwner: policy.FDCConsumer,
		Consumer: policy.FDCConsumer, InputCommitment: request.InputCommitment,
		ProofCommitment:   common.BytesToHash([]byte("proof-commitment")),
		SourceAddressHash: policy.FDCSourceAddressHash, ReceivingAddressHash: policy.FDCReceivingAddressHash,
		ReceivedAmount: big.NewInt(75), HasMemoData: true, MemoDataHash: crypto.Keccak256Hash(request.RequestID.Bytes()),
		HasDestinationTag: true, DestinationTag: 73, BlockNumber: 123, BlockTimestamp: 1040,
		TransactionConsumed: true, ProofConsumed: true, RequestID: request.RequestID,
		RouterRequestHash: requestHash, RouterRequestStatus: 1,
	}
	state.FDC = &snapshot
	return policy, request, snapshot, state
}

func TestEvaluatorBindsConsumedFDCTriggerSnapshot(t *testing.T) {
	policy, request, snapshot, state := fdcScenarioFromVector(t)
	if _, err := FDCTriggerSnapshotCommitmentV1(snapshot); err != nil {
		t.Fatal(err)
	}
	wire, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	var decoded FDCTriggerSnapshotV1
	if err := json.Unmarshal(wire, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.ReceivedAmount.Cmp(snapshot.ReceivedAmount) != 0 || decoded.BlockNumber != snapshot.BlockNumber {
		t.Fatal("FDC snapshot wire round trip drifted")
	}
	result, err := EvaluatePolicy(policy, request, state)
	if err != nil || result.Decision != DecisionAllow {
		t.Fatalf("valid FDC snapshot denied: result=%+v err=%v", result, err)
	}

	mutations := []struct {
		name   string
		mutate func(*FDCTriggerSnapshotV1)
	}{
		{"source", func(value *FDCTriggerSnapshotV1) {
			value.SourceAddressHash = common.BytesToHash([]byte("wrong-source"))
		}},
		{"destination", func(value *FDCTriggerSnapshotV1) {
			value.ReceivingAddressHash = common.BytesToHash([]byte("wrong-destination"))
		}},
		{"memo", func(value *FDCTriggerSnapshotV1) { value.MemoDataHash = common.BytesToHash([]byte("wrong-memo")) }},
		{"destination-tag", func(value *FDCTriggerSnapshotV1) { value.DestinationTag++ }},
		{"amount", func(value *FDCTriggerSnapshotV1) { value.ReceivedAmount = big.NewInt(81) }},
		{"freshness", func(value *FDCTriggerSnapshotV1) { value.BlockTimestamp = 989 }},
		{"proof-commitment", func(value *FDCTriggerSnapshotV1) { value.ProofCommitment = common.Hash{} }},
		{"transaction-replay", func(value *FDCTriggerSnapshotV1) { value.TransactionConsumed = false }},
		{"proof-replay", func(value *FDCTriggerSnapshotV1) { value.ProofConsumed = false }},
		{"consumer", func(value *FDCTriggerSnapshotV1) { value.Consumer = request.Requester }},
		{"router-request", func(value *FDCTriggerSnapshotV1) {
			value.RouterRequestHash = common.BytesToHash([]byte("wrong-request"))
		}},
		{"router-status", func(value *FDCTriggerSnapshotV1) { value.RouterRequestStatus = 2 }},
	}
	for _, mutation := range mutations {
		t.Run(mutation.name, func(t *testing.T) {
			candidate := snapshot
			candidate.ReceivedAmount = new(big.Int).Set(snapshot.ReceivedAmount)
			mutation.mutate(&candidate)
			candidateState := state
			candidateState.FDC = &candidate
			result, err := EvaluatePolicy(policy, request, candidateState)
			if err != nil || result.PublicReasonClass != ReasonFDCInvalid {
				t.Fatalf("FDC drift did not fail closed: result=%+v err=%v", result, err)
			}
		})
	}

	missing := state
	missing.FDC = nil
	result, err = EvaluatePolicy(policy, request, missing)
	if err != nil || result.PublicReasonClass != ReasonFDCInvalid {
		t.Fatalf("missing FDC snapshot did not fail closed: result=%+v err=%v", result, err)
	}
}

func TestEvaluatorCombinesFTSOAndFDCInputs(t *testing.T) {
	policy, request, snapshot, _ := fdcScenarioFromVector(t)
	policy.RequireFTSO = true
	policy.FTSOFeedID = common.BytesToHash([]byte("combined-feed"))
	policy.MaxPriceAgeSecs = 60
	request, state := rebindPolicyRequest(t, policy, request)
	feedCheckpoint := common.BytesToHash([]byte("combined-ftso"))
	combinedInput, err := PolicyInputCommitmentV1(feedCheckpoint, snapshot.InputCommitment)
	if err != nil {
		t.Fatal(err)
	}
	request.InputCommitment = combinedInput
	snapshot.RequestID = request.RequestID
	snapshot.MemoDataHash = crypto.Keccak256Hash(request.RequestID.Bytes())
	snapshot.RouterRequestHash, err = ActionRequestHash(request)
	if err != nil {
		t.Fatal(err)
	}
	state.FTSO = &FTSOSnapshotV1{FeedID: policy.FTSOFeedID, Value: big.NewInt(1), Timestamp: 1040, Checkpoint: feedCheckpoint}
	state.FDC = &snapshot
	result, err := EvaluatePolicy(policy, request, state)
	if err != nil || result.Decision != DecisionAllow {
		t.Fatalf("combined FTSO/FDC input denied: result=%+v err=%v", result, err)
	}
	drifted := *state.FTSO
	drifted.Checkpoint = common.BytesToHash([]byte("wrong-ftso"))
	state.FTSO = &drifted
	result, err = EvaluatePolicy(policy, request, state)
	if err != nil || result.PublicReasonClass != ReasonFDCInvalid {
		t.Fatalf("combined input drift did not fail closed: result=%+v err=%v", result, err)
	}
}

type determinismError struct{}

func (*determinismError) Error() string { return "concurrent evaluation digest drift" }
