package protocol

import (
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

type vectorFile struct {
	Policy   vectorPolicy  `json:"policy"`
	Binding  vectorBinding `json:"binding"`
	Receipt  vectorReceipt `json:"receipt"`
	Request  vectorRequest `json:"request"`
	Result   vectorResult  `json:"result"`
	Expected struct {
		PolicyCommitment            string `json:"policyCommitment"`
		BindingDigest               string `json:"bindingDigest"`
		ReceiptDigest               string `json:"receiptDigest"`
		ReceiptAttestationDigest    string `json:"receiptAttestationDigest"`
		IngressCiphertextHash       string `json:"ingressCiphertextHash"`
		IngressAuthorizationDigest  string `json:"ingressAuthorizationDigest"`
		RequestHash                 string `json:"requestHash"`
		EvaluationDigest            string `json:"evaluationDigest"`
		EvaluationAttestationDigest string `json:"evaluationAttestationDigest"`
	} `json:"expected"`
}

type vectorPolicy struct {
	SchemaVersion        uint16   `json:"schemaVersion"`
	ChainID              string   `json:"chainId"`
	Registry             string   `json:"registry"`
	Vault                string   `json:"vault"`
	Router               string   `json:"router"`
	Owner                string   `json:"owner"`
	PolicyID             string   `json:"policyId"`
	PolicyVersion        uint32   `json:"policyVersion"`
	Asset                string   `json:"asset"`
	ReferenceCurrency    string   `json:"referenceCurrency"`
	MaxPerAction         string   `json:"maxPerAction"`
	DailyCap             string   `json:"dailyCap"`
	RollingCap           string   `json:"rollingCap"`
	RollingWindowSeconds string   `json:"rollingWindowSeconds"`
	StartAt              string   `json:"startAt"`
	EndAt                string   `json:"endAt"`
	ScheduleInterval     string   `json:"scheduleIntervalSeconds"`
	ScheduleGrace        string   `json:"scheduleGraceSeconds"`
	CooldownSeconds      string   `json:"cooldownSeconds"`
	MaxOccurrences       uint32   `json:"maxOccurrences"`
	AllowTargets         []string `json:"allowTargets"`
	DenyTargets          []string `json:"denyTargets"`
	AllowRequesters      []string `json:"allowRequesters"`
	AllowActionTypes     []string `json:"allowActionTypes"`
	RequireFTSO          bool     `json:"requireFtso"`
	FTSOFeedID           string   `json:"ftsoFeedId"`
	MaxPriceAgeSeconds   string   `json:"maxPriceAgeSeconds"`
	PrivateSalt          string   `json:"privateSalt"`
	SubmissionNonce      string   `json:"submissionNonce"`
}

type vectorBinding struct {
	ChainID          string   `json:"chainId"`
	Registry         string   `json:"registry"`
	Vault            string   `json:"vault"`
	Router           string   `json:"router"`
	Owner            string   `json:"owner"`
	PolicyID         string   `json:"policyId"`
	PolicyVersion    uint32   `json:"policyVersion"`
	PolicyCommitment string   `json:"policyCommitment"`
	Schema           string   `json:"schema"`
	ExtensionID      string   `json:"extensionId"`
	CodeVersion      string   `json:"codeVersion"`
	MachineIDs       []string `json:"machineIds"`
	KeyFingerprints  []string `json:"keyFingerprints"`
	CustodyThreshold uint8    `json:"custodyThreshold"`
	ResultThreshold  uint8    `json:"resultThreshold"`
	PolicyNonce      string   `json:"policyNonce"`
}

type vectorReceipt struct {
	MachineID       string `json:"machineId"`
	KeyFingerprint  string `json:"keyFingerprint"`
	SubmissionNonce string `json:"submissionNonce"`
	ReceiptNonce    string `json:"receiptNonce"`
	IssuedAt        string `json:"issuedAt"`
	Expiry          string `json:"expiry"`
}

type vectorRequest struct {
	ChainID           string `json:"chainId"`
	Registry          string `json:"registry"`
	Vault             string `json:"vault"`
	Router            string `json:"router"`
	PolicyID          string `json:"policyId"`
	PolicyVersion     uint32 `json:"policyVersion"`
	PolicyCommitment  string `json:"policyCommitment"`
	RequestID         string `json:"requestId"`
	RequestNonce      string `json:"requestNonce"`
	Attempt           uint32 `json:"attempt"`
	Requester         string `json:"requester"`
	Target            string `json:"target"`
	Asset             string `json:"asset"`
	ActionType        string `json:"actionType"`
	Amount            string `json:"amount"`
	ScheduleSlot      string `json:"scheduleSlot"`
	Occurrence        uint32 `json:"occurrence"`
	SpendCheckpoint   string `json:"spendCheckpoint"`
	BalanceCheckpoint string `json:"balanceCheckpoint"`
	InputCommitment   string `json:"inputCommitment"`
	CreatedAt         string `json:"createdAt"`
	GraceDeadline     string `json:"graceDeadline"`
	Expiry            string `json:"expiry"`
}

type vectorResult struct {
	Decision            string `json:"decision"`
	PublicReasonClass   string `json:"publicReasonClass"`
	ReservedAmount      string `json:"reservedAmount"`
	ResultingCheckpoint string `json:"resultingCheckpoint"`
	ResultNonce         string `json:"resultNonce"`
	Attempt             uint32 `json:"attempt"`
	IssuedAt            string `json:"issuedAt"`
	Expiry              string `json:"expiry"`
	MachineID           string `json:"machineId"`
	KeyFingerprint      string `json:"keyFingerprint"`
}

func readVector(t *testing.T) vectorFile {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime caller unavailable")
	}
	path := filepath.Join(filepath.Dir(file), "../../../../packages/protocol/fixtures/v1.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var vector vectorFile
	if err := json.Unmarshal(data, &vector); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}
	return vector
}

func mustHash(value string) common.Hash       { return common.HexToHash(value) }
func mustAddress(value string) common.Address { return common.HexToAddress(value) }

func policyFromVector(v vectorPolicy) PolicyV1 {
	addresses := func(values []string) []common.Address {
		result := make([]common.Address, len(values))
		for index, value := range values {
			result[index] = mustAddress(value)
		}
		return result
	}
	hashes := func(values []string) []common.Hash {
		result := make([]common.Hash, len(values))
		for index, value := range values {
			result[index] = mustHash(value)
		}
		return result
	}
	return PolicyV1{SchemaVersion: v.SchemaVersion, ChainID: bigFromString(v.ChainID), Registry: mustAddress(v.Registry), Vault: mustAddress(v.Vault), Router: mustAddress(v.Router), Owner: mustAddress(v.Owner), PolicyID: mustHash(v.PolicyID), PolicyVersion: v.PolicyVersion, Asset: mustAddress(v.Asset), ReferenceCurrency: mustHash(v.ReferenceCurrency), MaxPerAction: bigFromString(v.MaxPerAction), DailyCap: bigFromString(v.DailyCap), RollingCap: bigFromString(v.RollingCap), RollingWindowSecs: mustUint64(v.RollingWindowSeconds), StartAt: mustUint64(v.StartAt), EndAt: mustUint64(v.EndAt), ScheduleIntervalSecs: mustUint64(v.ScheduleInterval), ScheduleGraceSecs: mustUint64(v.ScheduleGrace), CooldownSecs: mustUint64(v.CooldownSeconds), MaxOccurrences: v.MaxOccurrences, AllowTargets: addresses(v.AllowTargets), DenyTargets: addresses(v.DenyTargets), AllowRequesters: addresses(v.AllowRequesters), AllowActionTypes: hashes(v.AllowActionTypes), RequireFTSO: v.RequireFTSO, FTSOFeedID: mustHash(v.FTSOFeedID), MaxPriceAgeSecs: mustUint64(v.MaxPriceAgeSeconds), PrivateSalt: mustHash(v.PrivateSalt), SubmissionNonce: mustHash(v.SubmissionNonce)}
}

func bigFromString(value string) *big.Int {
	result, ok := new(big.Int).SetString(value, 10)
	if !ok {
		panic("invalid integer")
	}
	return result
}

func bindingFromVector(v vectorBinding) PolicyBindingV1 {
	var machines, keys [3]common.Hash
	for index := range machines {
		machines[index] = mustHash(v.MachineIDs[index])
		keys[index] = mustHash(v.KeyFingerprints[index])
	}
	return PolicyBindingV1{ChainID: bigFromString(v.ChainID), Registry: mustAddress(v.Registry), Vault: mustAddress(v.Vault), Router: mustAddress(v.Router), Owner: mustAddress(v.Owner), PolicyID: mustHash(v.PolicyID), PolicyVersion: v.PolicyVersion, PolicyCommitment: mustHash(v.PolicyCommitment), Schema: mustHash(v.Schema), ExtensionID: mustHash(v.ExtensionID), CodeVersion: mustHash(v.CodeVersion), MachineIDs: machines, KeyFingerprints: keys, CustodyThreshold: v.CustodyThreshold, ResultThreshold: v.ResultThreshold, PolicyNonce: mustUint64(v.PolicyNonce)}
}

func mustUint64(value string) uint64 {
	result, ok := new(big.Int).SetString(value, 10)
	if !ok || !result.IsUint64() {
		panic("invalid uint64")
	}
	return result.Uint64()
}

func requestFromVector(v vectorRequest) ActionRequestV1 {
	return ActionRequestV1{ChainID: bigFromString(v.ChainID), Registry: mustAddress(v.Registry), Vault: mustAddress(v.Vault), Router: mustAddress(v.Router), PolicyID: mustHash(v.PolicyID), PolicyVersion: v.PolicyVersion, PolicyCommitment: mustHash(v.PolicyCommitment), RequestID: mustHash(v.RequestID), RequestNonce: bigFromString(v.RequestNonce), Attempt: v.Attempt, Requester: mustAddress(v.Requester), Target: mustAddress(v.Target), Asset: mustAddress(v.Asset), ActionType: mustHash(v.ActionType), Amount: bigFromString(v.Amount), ScheduleSlot: mustUint64(v.ScheduleSlot), Occurrence: v.Occurrence, SpendCheckpoint: mustHash(v.SpendCheckpoint), BalanceCheckpoint: mustHash(v.BalanceCheckpoint), InputCommitment: mustHash(v.InputCommitment), CreatedAt: mustUint64(v.CreatedAt), GraceDeadline: mustUint64(v.GraceDeadline), Expiry: mustUint64(v.Expiry)}
}

func TestGoldenVector(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	commitment, err := PolicyCommitment(policy)
	if err != nil {
		t.Fatal(err)
	}
	if commitment != mustHash(vector.Expected.PolicyCommitment) {
		t.Fatalf("policy commitment mismatch: %s", commitment.Hex())
	}
	binding := bindingFromVector(vector.Binding)
	bindingDigest, err := PolicyBindingDigest(binding)
	if err != nil {
		t.Fatal(err)
	}
	if bindingDigest != mustHash(vector.Expected.BindingDigest) {
		t.Fatalf("binding digest mismatch: %s", bindingDigest.Hex())
	}
	receipt := PolicyReceiptV1{Binding: binding, MachineID: mustHash(vector.Receipt.MachineID), KeyFingerprint: mustHash(vector.Receipt.KeyFingerprint), SubmissionNonce: mustHash(vector.Receipt.SubmissionNonce), ReceiptNonce: mustUint64(vector.Receipt.ReceiptNonce), IssuedAt: mustUint64(vector.Receipt.IssuedAt), Expiry: mustUint64(vector.Receipt.Expiry)}
	receiptDigest, err := PolicyReceiptDigest(receipt)
	if err != nil {
		t.Fatal(err)
	}
	if receiptDigest != mustHash(vector.Expected.ReceiptDigest) {
		t.Fatalf("receipt digest mismatch: %s", receiptDigest.Hex())
	}
	receiptAttestationDigest, err := PolicyReceiptAttestationDigest(receipt)
	if err != nil {
		t.Fatal(err)
	}
	if receiptAttestationDigest != mustHash(vector.Expected.ReceiptAttestationDigest) {
		t.Fatalf("receipt attestation digest mismatch: %s", receiptAttestationDigest.Hex())
	}
	ingressDigest, err := PolicyIngressAuthorizationDigest(
		binding, receipt.SubmissionNonce, receipt.IssuedAt, receipt.Expiry,
		mustHash(vector.Expected.IngressCiphertextHash), receipt.MachineID, receipt.KeyFingerprint,
	)
	if err != nil {
		t.Fatal(err)
	}
	if ingressDigest != mustHash(vector.Expected.IngressAuthorizationDigest) {
		t.Fatalf("ingress authorization digest mismatch: %s", ingressDigest.Hex())
	}
	request := requestFromVector(vector.Request)
	requestHash, err := ActionRequestHash(request)
	if err != nil {
		t.Fatal(err)
	}
	if requestHash != mustHash(vector.Expected.RequestHash) {
		t.Fatalf("request hash mismatch: %s", requestHash.Hex())
	}
	result := EvaluationResultV1{Request: request, Decision: 1, PublicReasonClass: 0, ReservedAmount: bigFromString(vector.Result.ReservedAmount), ResultingCheckpoint: mustHash(vector.Result.ResultingCheckpoint), ResultNonce: mustHash(vector.Result.ResultNonce), Attempt: vector.Result.Attempt, IssuedAt: mustUint64(vector.Result.IssuedAt), Expiry: mustUint64(vector.Result.Expiry), MachineID: mustHash(vector.Result.MachineID), KeyFingerprint: mustHash(vector.Result.KeyFingerprint)}
	evaluationDigest, err := EvaluationDigest(result)
	if err != nil {
		t.Fatal(err)
	}
	if evaluationDigest != mustHash(vector.Expected.EvaluationDigest) {
		t.Fatalf("evaluation digest mismatch: %s", evaluationDigest.Hex())
	}
	evaluationAttestationDigest, err := EvaluationAttestationDigest(result)
	if err != nil {
		t.Fatal(err)
	}
	if evaluationAttestationDigest != mustHash(vector.Expected.EvaluationAttestationDigest) {
		t.Fatalf("evaluation attestation digest mismatch: %s", evaluationAttestationDigest.Hex())
	}
}

func TestPolicyNormalizationRejectsDuplicate(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	policy.DenyTargets = []common.Address{policy.Router, policy.Router}
	if _, err := PolicyCommitment(policy); err == nil {
		t.Fatal("expected duplicate target rejection")
	}
	invalidSchedule := policyFromVector(vector.Policy)
	invalidSchedule.ScheduleGraceSecs = invalidSchedule.ScheduleIntervalSecs
	if _, err := PolicyCommitment(invalidSchedule); err == nil {
		t.Fatal("expected overlapping schedule rejection")
	}
	shortPolicy := policyFromVector(vector.Policy)
	shortPolicy.EndAt = 1050
	if _, err := PolicyCommitment(shortPolicy); err == nil {
		t.Fatal("expected schedule past policy end rejection")
	}
}

func TestPolicyCommitmentIsRulePermutationIndependent(t *testing.T) {
	vector := readVector(t)
	policy := policyFromVector(vector.Policy)
	permuted := policy
	permuted.AllowTargets = append([]common.Address(nil), policy.AllowTargets...)
	for left, right := 0, len(permuted.AllowTargets)-1; left < right; left, right = left+1, right-1 {
		permuted.AllowTargets[left], permuted.AllowTargets[right] = permuted.AllowTargets[right], permuted.AllowTargets[left]
	}
	original, err := PolicyCommitment(policy)
	if err != nil {
		t.Fatal(err)
	}
	reordered, err := PolicyCommitment(permuted)
	if err != nil {
		t.Fatal(err)
	}
	if original != reordered {
		t.Fatalf("rule permutation changed commitment: %s != %s", original, reordered)
	}
}
