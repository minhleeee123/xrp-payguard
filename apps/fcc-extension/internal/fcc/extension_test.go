package fcc

import (
	"bytes"
	"encoding/json"
	"math/big"
	"net/http"
	"testing"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/flare-foundation/go-flare-common/pkg/tee/instruction"
	"github.com/flare-foundation/go-flare-common/pkg/tee/structs"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/ingress"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/protocol"
)

func fccHash(value string) common.Hash { return common.BytesToHash([]byte(value)) }

func fccPolicy() protocol.PolicyV1 {
	owner := common.HexToAddress("0x00000000000000000000000000000000000000a1")
	vault := common.HexToAddress("0x00000000000000000000000000000000000000b2")
	router := common.HexToAddress("0x00000000000000000000000000000000000000c3")
	return protocol.PolicyV1{SchemaVersion: 1, ChainID: big.NewInt(114), Registry: owner, Vault: vault, Router: router, Owner: owner, PolicyID: fccHash("policy"), PolicyVersion: 1, Asset: vault, ReferenceCurrency: fccHash("USD"), MaxPerAction: big.NewInt(100), DailyCap: big.NewInt(500), RollingCap: big.NewInt(800), RollingWindowSecs: 86400, StartAt: 1000, EndAt: 10000, ScheduleIntervalSecs: 3600, ScheduleGraceSecs: 100, MaxOccurrences: 5, AllowTargets: []common.Address{router}, AllowRequesters: []common.Address{owner}, AllowActionTypes: []common.Hash{protocol.ActionFTestXRPTransfer}, PrivateSalt: fccHash("private-salt"), SubmissionNonce: fccHash("submit")}
}

func fccRequest(policy protocol.PolicyV1) protocol.ActionRequestV1 {
	commitment, _ := protocol.PolicyCommitment(policy)
	checkpoint, _ := protocol.GenesisSpendCheckpoint(commitment)
	return protocol.ActionRequestV1{ChainID: policy.ChainID, Registry: policy.Registry, Vault: policy.Vault, Router: policy.Router, PolicyID: policy.PolicyID, PolicyVersion: policy.PolicyVersion, PolicyCommitment: commitment, RequestID: fccHash("request"), RequestNonce: big.NewInt(1), Requester: policy.Owner, Target: policy.Router, Asset: policy.Asset, ActionType: protocol.ActionFTestXRPTransfer, Amount: big.NewInt(75), ScheduleSlot: 1000, Occurrence: 1, SpendCheckpoint: checkpoint, BalanceCheckpoint: fccHash("balance"), CreatedAt: 1001, GraceDeadline: 1100, Expiry: 1100}
}

func actionFor(opCommand common.Hash, original []byte) (teetypes.Action, *instruction.DataFixed) {
	dataFixed := &instruction.DataFixed{InstructionID: fccHash("instruction"), OPType: teeutils.ToHash(OPTypePayGuard), OPCommand: opCommand, OriginalMessage: original}
	return teetypes.Action{Data: teetypes.ActionData{ID: fccHash("action"), SubmissionTag: teetypes.Threshold}}, dataFixed
}

func validFoundationRequest() FoundationRequest {
	return FoundationRequest{
		SchemaVersion: FoundationSchemaVersion,
		ChainID:       big.NewInt(Coston2ChainID),
		Sender:        common.HexToAddress("0x1000000000000000000000000000000000000001"),
		ExtensionID:   big.NewInt(66001),
		CodeVersion:   foundationCodeVersion,
		RequestNonce:  common.HexToHash("0x1234"),
		PayloadHash:   common.HexToHash("0xabcd"),
	}
}

func encodeFoundationRequest(t *testing.T, request FoundationRequest) []byte {
	t.Helper()
	encoded, err := abi.Arguments{foundationRequestArg}.Pack(request)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func TestPingAndUnavailableEvaluationFailClosed(t *testing.T) {
	extension := New(0, 0, nil)
	request := validFoundationRequest()
	action, dataFixed := actionFor(teeutils.ToHash(OPCommandPing), encodeFoundationRequest(t, request))
	status, body := extension.processAction(action, dataFixed)
	if status != 200 {
		t.Fatalf("ping HTTP status: %d", status)
	}
	var result teetypes.ActionResult
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal(err)
	}
	if result.Status != 1 {
		t.Fatalf("unexpected ping result: %+v", result)
	}
	var response FoundationResponse
	if err := structs.DecodeTo(foundationResponseArg, result.Data, &response); err != nil {
		t.Fatal(err)
	}
	expectedBinding := common.HexToHash("0x55f3ec0e0465f6db52b6c4b411e89120a09e7f01740b22a3844ee3685d4f492a")
	if response.BindingHash != expectedBinding || response.RequestNonce != request.RequestNonce ||
		response.Sender != request.Sender || response.ExtensionID.Cmp(request.ExtensionID) != 0 {
		t.Fatalf("unexpected typed ping response: %+v", response)
	}
	if string(result.AdditionalResultStatus) != "" {
		t.Fatalf("unexpected additional result status: %q", result.AdditionalResultStatus)
	}
	wire, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(wire, []byte(`"additionalResultStatus":"0x"`)) {
		t.Fatalf("wire result must preserve the scaffold 0x empty-bytes contract: %s", wire)
	}

	action, dataFixed = actionFor(teeutils.ToHash(OPCommandEvaluate), []byte(`{}`))
	status, body = extension.processAction(action, dataFixed)
	if status != 200 {
		t.Fatalf("unavailable evaluation HTTP status: %d", status)
	}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal(err)
	}
	if result.Status != 0 || bytes.Contains(body, []byte(`"decision":"ALLOW"`)) {
		t.Fatalf("unavailable evaluation was represented as success: %s", body)
	}
}

func TestFoundationPingRejectsEveryInvalidBindingField(t *testing.T) {
	extension := New(0, 0, nil)
	tests := map[string]func(*FoundationRequest){
		"schema":    func(value *FoundationRequest) { value.SchemaVersion++ },
		"chain":     func(value *FoundationRequest) { value.ChainID = big.NewInt(115) },
		"sender":    func(value *FoundationRequest) { value.Sender = common.Address{} },
		"extension": func(value *FoundationRequest) { value.ExtensionID = big.NewInt(0) },
		"code":      func(value *FoundationRequest) { value.CodeVersion = common.HexToHash("0x9999") },
		"nonce":     func(value *FoundationRequest) { value.RequestNonce = common.Hash{} },
		"payload":   func(value *FoundationRequest) { value.PayloadHash = common.Hash{} },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			request := validFoundationRequest()
			mutate(&request)
			action, dataFixed := actionFor(
				teeutils.ToHash(OPCommandPing), encodeFoundationRequest(t, request),
			)
			status, body := extension.processAction(action, dataFixed)
			if status != http.StatusOK {
				t.Fatalf("HTTP status: %d", status)
			}
			var result teetypes.ActionResult
			if err := json.Unmarshal(body, &result); err != nil {
				t.Fatal(err)
			}
			if result.Status != 0 || len(result.Data) != 0 {
				t.Fatalf("invalid foundation request succeeded: %s", body)
			}
		})
	}
}

func TestFoundationPingRejectsMalformedAndNonCanonicalWire(t *testing.T) {
	extension := New(0, 0, nil)
	wires := map[string][]byte{
		"malformed":     {0x01, 0x02},
		"trailing-data": append(encodeFoundationRequest(t, validFoundationRequest()), make([]byte, 32)...),
	}
	for name, wire := range wires {
		t.Run(name, func(t *testing.T) {
			action, dataFixed := actionFor(teeutils.ToHash(OPCommandPing), wire)
			_, body := extension.processAction(action, dataFixed)
			var result teetypes.ActionResult
			if err := json.Unmarshal(body, &result); err != nil {
				t.Fatal(err)
			}
			if result.Status != 0 || len(result.Data) != 0 {
				t.Fatalf("invalid foundation wire succeeded: %s", body)
			}
		})
	}
}

func TestFoundationBindingGoldenVector(t *testing.T) {
	digest, err := foundationBindingHash(validFoundationRequest())
	if err != nil {
		t.Fatal(err)
	}
	expected := common.HexToHash("0x55f3ec0e0465f6db52b6c4b411e89120a09e7f01740b22a3844ee3685d4f492a")
	if digest != expected {
		t.Fatalf("foundation digest mismatch: got %s want %s", digest, expected)
	}
}

func TestEvaluateActionUsesPrivateMachineState(t *testing.T) {
	policy := fccPolicy()
	ciphertext := []byte("sealed-policy-ciphertext")
	key, err := crypto.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	ownerKey, err := crypto.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	policy.Owner = crypto.PubkeyToAddress(ownerKey.PublicKey)
	policy.AllowRequesters = []common.Address{policy.Owner}
	machineID, fingerprint := fccHash("machine"), fccHash("fingerprint")
	machine, err := ingress.NewMachine(machineID, fingerprint, key, func(received []byte) (protocol.PolicyV1, error) {
		if !bytes.Equal(received, ciphertext) {
			t.Fatal("resolver received unexpected ciphertext")
		}
		return policy, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	commitment, _ := protocol.PolicyCommitment(policy)
	binding := protocol.PolicyBindingV1{ChainID: policy.ChainID, Registry: policy.Registry, Vault: policy.Vault, Router: policy.Router, Owner: policy.Owner, PolicyID: policy.PolicyID, PolicyVersion: 1, PolicyCommitment: commitment, Schema: protocol.PolicySchemaV1, ExtensionID: fccHash("extension"), CodeVersion: fccHash("code"), MachineIDs: [3]common.Hash{machineID, fccHash("m2"), fccHash("m3")}, KeyFingerprints: [3]common.Hash{fingerprint, fccHash("k2"), fccHash("k3")}, CustodyThreshold: 3, ResultThreshold: 2, PolicyNonce: 1}
	authorizationDigest, err := protocol.PolicyIngressAuthorizationDigest(
		binding, policy.SubmissionNonce, 1000, 2000, crypto.Keccak256Hash(ciphertext), machineID, fingerprint,
	)
	if err != nil {
		t.Fatal(err)
	}
	authorization, err := crypto.Sign(accounts.TextHash(authorizationDigest.Bytes()), ownerKey)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := machine.SubmitAuthorized(binding, policy.SubmissionNonce, 1000, 2000, ciphertext, authorization); err != nil {
		t.Fatal(err)
	}
	extension := New(0, 0, machine)
	request := fccRequest(policy)
	payload, err := json.Marshal(EvaluationPayload{Request: request, State: protocol.SpendStateV1{AvailableBalance: big.NewInt(100), History: []protocol.SpendHistoryEntryV1{}, SpendCheckpoint: request.SpendCheckpoint, BalanceCheckpoint: request.BalanceCheckpoint, Now: 1050}})
	if err != nil {
		t.Fatal(err)
	}
	action, dataFixed := actionFor(teeutils.ToHash(OPCommandEvaluate), payload)
	status, body := extension.processAction(action, dataFixed)
	if status != 200 {
		t.Fatalf("evaluation HTTP status: %d", status)
	}
	var result teetypes.ActionResult
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal(err)
	}
	if result.Status != 1 || bytes.Contains(body, []byte(policy.PrivateSalt.Hex())) {
		t.Fatalf("private or failed result: %s", body)
	}
	var envelope ingress.EvaluationEnvelope
	if err := json.Unmarshal(result.Data, &envelope); err != nil {
		t.Fatal(err)
	}
	attestationDigest, err := protocol.EvaluationAttestationDigest(envelope.Result)
	if err != nil || envelope.Result.Decision != protocol.DecisionAllow || !ingress.VerifySignature(attestationDigest, envelope.Signature, machine.Signer()) {
		t.Fatal("evaluation result was not signed/allowed")
	}
}
