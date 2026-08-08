package ingress

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/protocol"
)

func ingressHash(value string) common.Hash { return common.BytesToHash([]byte(value)) }

func testPolicy() protocol.PolicyV1 {
	owner := common.HexToAddress("0x00000000000000000000000000000000000000a1")
	vault := common.HexToAddress("0x00000000000000000000000000000000000000b2")
	router := common.HexToAddress("0x00000000000000000000000000000000000000c3")
	return protocol.PolicyV1{SchemaVersion: 1, ChainID: big.NewInt(114), Registry: owner, Vault: vault, Router: router, Owner: owner, PolicyID: ingressHash("policy"), PolicyVersion: 1, Asset: vault, ReferenceCurrency: ingressHash("USD"), MaxPerAction: big.NewInt(100), DailyCap: big.NewInt(500), RollingCap: big.NewInt(800), RollingWindowSecs: 86400, StartAt: 1000, EndAt: 10000, ScheduleIntervalSecs: 3600, ScheduleGraceSecs: 100, MaxOccurrences: 5, AllowTargets: []common.Address{router}, AllowRequesters: []common.Address{owner}, AllowActionTypes: []common.Hash{protocol.ActionFTestXRPTransfer}, FTSOFeedID: common.Hash{}, PrivateSalt: ingressHash("salt"), SubmissionNonce: ingressHash("submit")}
}

func testBinding(policy protocol.PolicyV1, machines [3]*Machine) protocol.PolicyBindingV1 {
	commitment, err := protocol.PolicyCommitment(policy)
	if err != nil {
		panic(err)
	}
	var machineIDs, fingerprints [3]common.Hash
	for index, machine := range machines {
		machineIDs[index], fingerprints[index] = machine.ID(), machine.Fingerprint()
	}
	return protocol.PolicyBindingV1{ChainID: policy.ChainID, Registry: policy.Registry, Vault: policy.Vault, Router: policy.Router, Owner: policy.Owner, PolicyID: policy.PolicyID, PolicyVersion: policy.PolicyVersion, PolicyCommitment: commitment, Schema: protocol.PolicySchemaV1, ExtensionID: ingressHash("extension"), CodeVersion: ingressHash("code"), MachineIDs: machineIDs, KeyFingerprints: fingerprints, CustodyThreshold: 3, ResultThreshold: 2, PolicyNonce: 1}
}

func testRequest(policy protocol.PolicyV1) protocol.ActionRequestV1 {
	commitment, err := protocol.PolicyCommitment(policy)
	if err != nil {
		panic(err)
	}
	checkpoint, err := protocol.GenesisSpendCheckpoint(commitment)
	if err != nil {
		panic(err)
	}
	return protocol.ActionRequestV1{ChainID: policy.ChainID, Registry: policy.Registry, Vault: policy.Vault, Router: policy.Router, PolicyID: policy.PolicyID, PolicyVersion: policy.PolicyVersion, PolicyCommitment: commitment, RequestID: ingressHash("request"), RequestNonce: big.NewInt(1), Requester: policy.Owner, Target: policy.Router, Asset: policy.Asset, ActionType: protocol.ActionFTestXRPTransfer, Amount: big.NewInt(75), ScheduleSlot: 1000, Occurrence: 1, SpendCheckpoint: checkpoint, BalanceCheckpoint: ingressHash("balance"), InputCommitment: common.Hash{}, CreatedAt: 1001, GraceDeadline: 1100, Expiry: 1100}
}

func testState(request protocol.ActionRequestV1) protocol.SpendStateV1 {
	return protocol.SpendStateV1{AvailableBalance: big.NewInt(100), History: []protocol.SpendHistoryEntryV1{}, SpendCheckpoint: request.SpendCheckpoint, BalanceCheckpoint: request.BalanceCheckpoint, Now: 1050}
}

func newTestCoordinator(t *testing.T, policy protocol.PolicyV1) (*Coordinator, [3]*Machine, protocol.PolicyBindingV1) {
	return newTestCoordinatorSet(t, policy, "machine", "fingerprint")
}

func newTestCoordinatorSet(t *testing.T, policy protocol.PolicyV1, machinePrefix, fingerprintPrefix string) (*Coordinator, [3]*Machine, protocol.PolicyBindingV1) {
	t.Helper()
	var machines [3]*Machine
	ciphertext := []byte("opaque-ciphertext")
	for index := range machines {
		key, err := crypto.GenerateKey()
		if err != nil {
			t.Fatal(err)
		}
		machine, err := NewMachine(ingressHash(machinePrefix+"-"+string(rune('a'+index))), ingressHash(fingerprintPrefix+"-"+string(rune('a'+index))), key, func(received []byte) (protocol.PolicyV1, error) {
			if !bytes.Equal(received, ciphertext) {
				return protocol.PolicyV1{}, errUnexpectedCiphertext
			}
			return policy, nil
		})
		if err != nil {
			t.Fatal(err)
		}
		machines[index] = machine
	}
	binding := testBinding(policy, machines)
	coordinator, err := NewCoordinator(machines)
	if err != nil {
		t.Fatal(err)
	}
	return coordinator, machines, binding
}

var errUnexpectedCiphertext = &ciphertextError{}

type ciphertextError struct{}

func (*ciphertextError) Error() string { return "unexpected ciphertext" }

func TestCiphertextOnlyCustodyAndSignedReceipts(t *testing.T) {
	policy := testPolicy()
	coordinator, machines, binding := newTestCoordinator(t, policy)
	ciphertext := []byte("opaque-ciphertext")
	bundle, err := coordinator.Submit(binding, policy.SubmissionNonce, 1000, 2000, ciphertext)
	if err != nil {
		t.Fatal(err)
	}
	for index, envelope := range bundle.Receipts {
		digest, digestErr := protocol.PolicyReceiptDigest(envelope.Receipt)
		if digestErr != nil || digest != envelope.Digest {
			t.Fatalf("receipt %d digest mismatch", index)
		}
		if !VerifySignature(envelope.Digest, envelope.Signature, machines[index].Signer()) {
			t.Fatalf("receipt %d signature invalid", index)
		}
	}
	if bundle.Receipts[0].Receipt.MachineID == bundle.Receipts[1].Receipt.MachineID {
		t.Fatal("custody identities are not distinct")
	}
	if _, err := coordinator.Submit(binding, policy.SubmissionNonce, 1000, 2000, []byte("changed-ciphertext")); err == nil {
		t.Fatal("changed ciphertext replay was accepted")
	}

	server := NewHTTPServer(coordinator)
	payload, err := json.Marshal(IngressRequest{Binding: binding, SubmissionNonce: policy.SubmissionNonce, IssuedAt: 1000, Expiry: 2000, Ciphertext: base64.StdEncoding.EncodeToString(ciphertext)})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(payload, []byte(`"issuedAt":"1000"`)) || !bytes.Contains(payload, []byte(`"policyNonce":"1"`)) {
		t.Fatalf("private ingress wire is not decimal-string/lower-camel: %s", payload)
	}
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/private/ingress", bytes.NewReader(payload)))
	if recorder.Code != http.StatusOK {
		t.Fatalf("HTTP ingress status: %d", recorder.Code)
	}
	if ContainsBytes(recorder.Body.Bytes(), ciphertext, []byte(policy.PrivateSalt.Hex())) {
		t.Fatal("private material crossed the receipt response")
	}
}

func TestThresholdEvaluationFailsClosed(t *testing.T) {
	policy := testPolicy()
	coordinator, machines, binding := newTestCoordinator(t, policy)
	if _, err := coordinator.Submit(binding, policy.SubmissionNonce, 1000, 2000, []byte("opaque-ciphertext")); err != nil {
		t.Fatal(err)
	}
	request := testRequest(policy)
	results, err := coordinator.Evaluate(request, testState(request))
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 3 || results[0].Digest != results[1].Digest || results[1].Digest != results[2].Digest {
		t.Fatal("matching threshold results were not produced")
	}
	for index, result := range results {
		if !VerifySignature(result.Digest, result.Signature, machines[index].Signer()) {
			t.Fatalf("result %d signature invalid", index)
		}
	}

	// Losing one result machine is recoverable after common custody.
	machines[2].mu.Lock()
	delete(machines[2].policies, request.PolicyCommitment)
	machines[2].mu.Unlock()
	results, err = coordinator.Evaluate(request, testState(request))
	if err != nil || len(results) != 2 {
		t.Fatalf("one-machine outage did not preserve threshold: %v", err)
	}

	// Losing two frozen machines fails closed; no synthetic decision is returned.
	machines[1].mu.Lock()
	delete(machines[1].policies, request.PolicyCommitment)
	machines[1].mu.Unlock()
	if _, err = coordinator.Evaluate(request, testState(request)); err == nil {
		t.Fatal("two-machine outage produced an evaluation")
	}
}

func TestCoordinatorBindsFrozenOrderAndSubmissionNonce(t *testing.T) {
	policy := testPolicy()
	coordinator, machines, binding := newTestCoordinator(t, policy)
	shuffled, err := NewCoordinator([3]*Machine{machines[1], machines[0], machines[2]})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := shuffled.Submit(binding, policy.SubmissionNonce, 1000, 2000, []byte("opaque-ciphertext")); err == nil {
		t.Fatal("shuffled machines bypassed frozen receipt order")
	}
	if _, err := coordinator.Submit(binding, ingressHash("different-submission"), 1000, 2000, []byte("opaque-ciphertext")); err == nil {
		t.Fatal("policy was accepted under a different submission nonce")
	}
}

func TestReplacementCustodyIsLimitedToNewPolicyVersion(t *testing.T) {
	oldPolicy := testPolicy()
	oldCoordinator, oldMachines, oldBinding := newTestCoordinator(t, oldPolicy)
	if _, err := oldCoordinator.Submit(oldBinding, oldPolicy.SubmissionNonce, 1000, 2000, []byte("opaque-ciphertext")); err != nil {
		t.Fatal(err)
	}

	replacementPolicy := oldPolicy
	replacementPolicy.PolicyVersion = 2
	replacementPolicy.PrivateSalt = ingressHash("replacement-salt")
	replacementPolicy.SubmissionNonce = ingressHash("replacement-submit")
	replacementCoordinator, _, replacementBinding := newTestCoordinatorSet(t, replacementPolicy, "replacement-machine", "replacement-fingerprint")
	replacementBinding.PolicyNonce = 2
	if _, err := replacementCoordinator.Submit(replacementBinding, replacementPolicy.SubmissionNonce, 1000, 2000, []byte("opaque-ciphertext")); err != nil {
		t.Fatal(err)
	}

	oldRequest := testRequest(oldPolicy)
	if _, err := replacementCoordinator.Evaluate(oldRequest, testState(oldRequest)); err == nil {
		t.Fatal("replacement machines evaluated a policy they never receipted")
	}
	replacementRequest := testRequest(replacementPolicy)
	results, err := replacementCoordinator.Evaluate(replacementRequest, testState(replacementRequest))
	if err != nil || len(results) != 3 {
		t.Fatalf("replacement policy did not reach its new custody set: %v", err)
	}
	if _, err := oldCoordinator.Evaluate(replacementRequest, testState(replacementRequest)); err == nil {
		t.Fatal("old machines evaluated a replacement policy they never receipted")
	}

	for index := 1; index < len(oldMachines); index++ {
		oldMachines[index].mu.Lock()
		delete(oldMachines[index].policies, oldRequest.PolicyCommitment)
		oldMachines[index].mu.Unlock()
	}
	if _, err := oldCoordinator.Evaluate(oldRequest, testState(oldRequest)); err == nil {
		t.Fatal("replacement availability manufactured an old-policy threshold")
	}
}
