package fcc

import (
	"bytes"
	"encoding/json"
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/flare-foundation/go-flare-common/pkg/tee/instruction"
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
	return protocol.PolicyV1{SchemaVersion: 1, ChainID: big.NewInt(114), Registry: owner, Vault: vault, Router: router, Owner: owner, PolicyID: fccHash("policy"), PolicyVersion: 1, Asset: vault, ReferenceCurrency: fccHash("USD"), MaxPerAction: big.NewInt(100), DailyCap: big.NewInt(500), RollingCap: big.NewInt(800), RollingWindowSecs: 86400, StartAt: 1000, EndAt: 10000, MaxOccurrences: 5, AllowTargets: []common.Address{router}, AllowRequesters: []common.Address{owner}, AllowActionTypes: []common.Hash{protocol.ActionFTestXRPTransfer}, PrivateSalt: fccHash("private-salt"), SubmissionNonce: fccHash("submit")}
}

func fccRequest(policy protocol.PolicyV1) protocol.ActionRequestV1 {
	commitment, _ := protocol.PolicyCommitment(policy)
	return protocol.ActionRequestV1{ChainID: policy.ChainID, Registry: policy.Registry, Vault: policy.Vault, Router: policy.Router, PolicyID: policy.PolicyID, PolicyVersion: policy.PolicyVersion, PolicyCommitment: commitment, RequestID: fccHash("request"), RequestNonce: 1, Requester: policy.Owner, Target: policy.Router, Asset: policy.Asset, ActionType: protocol.ActionFTestXRPTransfer, Amount: big.NewInt(75), ScheduleSlot: 1000, SpendCheckpoint: fccHash("spend"), BalanceCheckpoint: fccHash("balance"), CreatedAt: 1001, GraceDeadline: 1100, Expiry: 1200}
}

func actionFor(opCommand common.Hash, original []byte) (teetypes.Action, *instruction.DataFixed) {
	dataFixed := &instruction.DataFixed{InstructionID: fccHash("instruction"), OPType: teeutils.ToHash(OPTypePayGuard), OPCommand: opCommand, OriginalMessage: original}
	return teetypes.Action{Data: teetypes.ActionData{ID: fccHash("action"), SubmissionTag: teetypes.Threshold}}, dataFixed
}

func TestPingAndUnavailableEvaluationFailClosed(t *testing.T) {
	extension := New(0, 0, nil)
	action, dataFixed := actionFor(teeutils.ToHash(OPCommandPing), nil)
	status, body := extension.processAction(action, dataFixed)
	if status != 200 {
		t.Fatalf("ping HTTP status: %d", status)
	}
	var result teetypes.ActionResult
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal(err)
	}
	if result.Status != 1 || !bytes.Contains(result.Data, []byte("PING_V1")) {
		t.Fatalf("unexpected ping result: %+v", result)
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

func TestEvaluateActionUsesPrivateMachineState(t *testing.T) {
	policy := fccPolicy()
	ciphertext := []byte("sealed-policy-ciphertext")
	key, err := crypto.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
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
	if _, err := machine.Submit(binding, policy.SubmissionNonce, 1000, 2000, ciphertext); err != nil {
		t.Fatal(err)
	}
	extension := New(0, 0, machine)
	request := fccRequest(policy)
	payload, err := json.Marshal(EvaluationPayload{Request: request, State: protocol.SpendStateV1{AvailableBalance: big.NewInt(100), DailySpend: new(big.Int), RollingSpend: new(big.Int), SpendCheckpoint: request.SpendCheckpoint, BalanceCheckpoint: request.BalanceCheckpoint, Now: 1050}})
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
	if envelope.Result.Decision != protocol.DecisionAllow || !ingress.VerifySignature(envelope.Digest, envelope.Signature, machine.Signer()) {
		t.Fatal("evaluation result was not signed/allowed")
	}
}
