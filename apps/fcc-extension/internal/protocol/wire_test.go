package protocol

import (
	"bytes"
	"encoding/json"
	"math/big"
	"testing"
)

func TestEvaluationWireUsesSharedLowerCamelDecimalSchema(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	request := requestFromVector(vector.Request)
	result, err := EvaluatePolicy(policy, request, stateFromVector(request))
	if err != nil {
		t.Fatal(err)
	}
	result.MachineID = mustHash(vector.Result.MachineID)
	result.KeyFingerprint = mustHash(vector.Result.KeyFingerprint)
	wire, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range [][]byte{
		[]byte(`"requestNonce":"18446744073709551616"`), []byte(`"amount":"75"`),
		[]byte(`"decision":"ALLOW"`), []byte(`"publicReasonClass":"OK"`),
		[]byte(`"reservedAmount":"75"`), []byte(`"issuedAt":"1050"`),
	} {
		if !bytes.Contains(wire, expected) {
			t.Fatalf("wire missing %s: %s", expected, wire)
		}
	}
	for _, forbidden := range [][]byte{[]byte(`"Request"`), []byte(`"Decision"`), []byte(`"Amount"`)} {
		if bytes.Contains(wire, forbidden) {
			t.Fatalf("wire contains non-canonical field %s: %s", forbidden, wire)
		}
	}
	var decoded EvaluationResultV1
	if err := json.Unmarshal(wire, &decoded); err != nil {
		t.Fatal(err)
	}
	originalDigest, err := EvaluationDigest(result)
	if err != nil {
		t.Fatal(err)
	}
	decodedDigest, err := EvaluationDigest(decoded)
	if err != nil {
		t.Fatal(err)
	}
	if decodedDigest != originalDigest {
		t.Fatalf("wire round trip changed digest: %s != %s", decodedDigest, originalDigest)
	}
}

func TestEncryptedPolicyWireIsCanonicalAndCommitmentPreserving(t *testing.T) {
	policy := policyFromVector(readVector(t).Policy)
	wire, err := json.Marshal(policy)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range [][]byte{
		[]byte(`"chainId":"114"`), []byte(`"maxPerAction":"100"`),
		[]byte(`"rollingWindowSeconds":"86400"`), []byte(`"allowTargets":[`),
		[]byte(`"privateSalt":"0x`), []byte(`"submissionNonce":"0x`),
	} {
		if !bytes.Contains(wire, expected) {
			t.Fatalf("encrypted policy wire missing %s", expected)
		}
	}
	var decoded PolicyV1
	if err := json.Unmarshal(wire, &decoded); err != nil {
		t.Fatal(err)
	}
	originalCommitment, err := PolicyCommitment(policy)
	if err != nil {
		t.Fatal(err)
	}
	decodedCommitment, err := PolicyCommitment(decoded)
	if err != nil {
		t.Fatal(err)
	}
	if decodedCommitment != originalCommitment {
		t.Fatalf("encrypted policy wire changed commitment: %s != %s", decodedCommitment, originalCommitment)
	}

	numeric := bytes.Replace(wire, []byte(`"maxPerAction":"100"`), []byte(`"maxPerAction":100`), 1)
	if err := json.Unmarshal(numeric, new(PolicyV1)); err == nil {
		t.Fatal("numeric private uint256 was accepted")
	}
	unknown := bytes.Replace(wire, []byte(`{"schemaVersion"`), []byte(`{"unexpected":true,"schemaVersion"`), 1)
	if err := json.Unmarshal(unknown, new(PolicyV1)); err == nil {
		t.Fatal("unknown encrypted policy field was accepted")
	}
	var missingArrayRecord map[string]any
	if err := json.Unmarshal(wire, &missingArrayRecord); err != nil {
		t.Fatal(err)
	}
	missingArrayRecord["allowTargets"] = nil
	missingArray, _ := json.Marshal(missingArrayRecord)
	if err := json.Unmarshal(missingArray, new(PolicyV1)); err == nil {
		t.Fatal("missing explicit private rule array was accepted")
	}
}

func TestSpendStateWireRoundTripPreservesHistory(t *testing.T) {
	vector := readVector(t)
	request := requestFromVector(vector.Request)
	state := SpendStateV1{
		AvailableBalance:  big.NewInt(100),
		History:           []SpendHistoryEntryV1{{Request: request, AccountedAt: 1050}},
		OccurrenceCount:   1,
		LastAccountingAt:  1050,
		SpendCheckpoint:   mustHash(vector.Result.ResultingCheckpoint),
		BalanceCheckpoint: request.BalanceCheckpoint,
		Now:               1060,
	}
	wire, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range [][]byte{[]byte(`"availableBalance":"100"`), []byte(`"accountedAt":"1050"`), []byte(`"lastAccountingAt":"1050"`), []byte(`"now":"1060"`)} {
		if !bytes.Contains(wire, expected) {
			t.Fatalf("state wire missing %s: %s", expected, wire)
		}
	}
	var decoded SpendStateV1
	if err := json.Unmarshal(wire, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.AvailableBalance.Cmp(state.AvailableBalance) != 0 || len(decoded.History) != 1 || decoded.History[0].AccountedAt != 1050 || decoded.History[0].Request.RequestID != request.RequestID {
		t.Fatalf("state wire round trip changed history: %+v", decoded)
	}
}

func TestReceiptWireRoundTripPreservesDigest(t *testing.T) {
	vector := readVector(t)
	binding := bindingFromVector(vector.Binding)
	receipt := PolicyReceiptV1{
		Binding: binding, MachineID: mustHash(vector.Receipt.MachineID),
		KeyFingerprint:  mustHash(vector.Receipt.KeyFingerprint),
		SubmissionNonce: mustHash(vector.Receipt.SubmissionNonce),
		ReceiptNonce:    mustUint64(vector.Receipt.ReceiptNonce),
		IssuedAt:        mustUint64(vector.Receipt.IssuedAt), Expiry: mustUint64(vector.Receipt.Expiry),
	}
	wire, err := json.Marshal(receipt)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range [][]byte{[]byte(`"chainId":"114"`), []byte(`"policyNonce":"1"`), []byte(`"receiptNonce":"1"`), []byte(`"issuedAt":"1000"`)} {
		if !bytes.Contains(wire, expected) {
			t.Fatalf("receipt wire missing %s: %s", expected, wire)
		}
	}
	var decoded PolicyReceiptV1
	if err := json.Unmarshal(wire, &decoded); err != nil {
		t.Fatal(err)
	}
	originalDigest, err := PolicyReceiptDigest(receipt)
	if err != nil {
		t.Fatal(err)
	}
	decodedDigest, err := PolicyReceiptDigest(decoded)
	if err != nil {
		t.Fatal(err)
	}
	if decodedDigest != originalDigest {
		t.Fatalf("receipt wire round trip changed digest: %s != %s", decodedDigest, originalDigest)
	}
}

func TestRequestNonceUsesFullUint256WireDomain(t *testing.T) {
	request := requestFromVector(readVector(t).Request)
	request.RequestNonce = new(big.Int).Set(maxUint256)
	wire, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	var decoded ActionRequestV1
	if err := json.Unmarshal(wire, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.RequestNonce.Cmp(maxUint256) != 0 {
		t.Fatalf("uint256 request nonce changed: %s", decoded.RequestNonce)
	}
	overflow := new(big.Int).Add(new(big.Int).Set(maxUint256), big.NewInt(1))
	request.RequestNonce = overflow
	if _, err := json.Marshal(request); err == nil {
		t.Fatal("request nonce above uint256 marshaled")
	}
	overflowWire := bytes.Replace(wire, []byte(`"requestNonce":"`+maxUint256.String()+`"`), []byte(`"requestNonce":"`+overflow.String()+`"`), 1)
	if err := json.Unmarshal(overflowWire, new(ActionRequestV1)); err == nil {
		t.Fatal("request nonce above uint256 unmarshaled")
	}
}

func TestWireRejectsNumericBigIntsAndUnknownDecision(t *testing.T) {
	vector := readVector(t)
	request := requestFromVector(vector.Request)
	wire, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	numericNonce := bytes.Replace(wire, []byte(`"requestNonce":"18446744073709551616"`), []byte(`"requestNonce":18446744073709551616`), 1)
	if err := json.Unmarshal(numericNonce, new(ActionRequestV1)); err == nil {
		t.Fatal("numeric bigint bypassed the decimal-string wire contract")
	}
	invalidResult := []byte(`{"request":` + string(wire) + `,"decision":"APPROVE","publicReasonClass":"OK","reservedAmount":"0","resultingCheckpoint":"0x0000000000000000000000000000000000000000000000000000000000000000","resultNonce":"0x0000000000000000000000000000000000000000000000000000000000000000","attempt":0,"issuedAt":"1","expiry":"2","machineId":"0x0000000000000000000000000000000000000000000000000000000000000000","keyFingerprint":"0x0000000000000000000000000000000000000000000000000000000000000000"}`)
	if err := json.Unmarshal(invalidResult, new(EvaluationResultV1)); err == nil {
		t.Fatal("unknown decision accepted")
	}
}
