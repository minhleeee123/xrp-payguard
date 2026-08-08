package ingress

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/protocol"
)

const maxCiphertextBytes = 64 * 1024

type PolicyResolver func(ciphertext []byte) (protocol.PolicyV1, error)

type ReceiptEnvelope struct {
	Receipt   protocol.PolicyReceiptV1 `json:"receipt"`
	Digest    common.Hash              `json:"digest"`
	Signer    common.Address           `json:"signer"`
	Signature hexutil.Bytes            `json:"signature"`
}

type EvaluationEnvelope struct {
	Result    protocol.EvaluationResultV1 `json:"result"`
	Digest    common.Hash                 `json:"digest"`
	Signer    common.Address              `json:"signer"`
	Signature hexutil.Bytes               `json:"signature"`
}

type sealedPolicy struct {
	ciphertextHash common.Hash
	policy         protocol.PolicyV1
	receipt        ReceiptEnvelope
}

type Machine struct {
	mu          sync.RWMutex
	id          common.Hash
	fingerprint common.Hash
	signer      AttestationSigner
	resolver    PolicyResolver
	policies    map[common.Hash]sealedPolicy
}

func NewMachine(id, fingerprint common.Hash, signer *ecdsa.PrivateKey, resolver PolicyResolver) (*Machine, error) {
	localSigner, err := newLocalAttestationSigner(signer)
	if err != nil {
		return nil, err
	}
	return NewMachineWithSigner(id, fingerprint, localSigner, resolver)
}

func NewMachineWithSigner(id, fingerprint common.Hash, signer AttestationSigner, resolver PolicyResolver) (*Machine, error) {
	if id == (common.Hash{}) || fingerprint == (common.Hash{}) || signer == nil || signer.Address() == (common.Address{}) || resolver == nil {
		return nil, errors.New("machine requires identity, signer, and sealed resolver")
	}
	return &Machine{id: id, fingerprint: fingerprint, signer: signer, resolver: resolver, policies: make(map[common.Hash]sealedPolicy)}, nil
}

func (m *Machine) ID() common.Hash          { return m.id }
func (m *Machine) Fingerprint() common.Hash { return m.fingerprint }
func (m *Machine) Signer() common.Address   { return m.signer.Address() }

func (m *Machine) Submit(binding protocol.PolicyBindingV1, submissionNonce common.Hash, issuedAt, expiry uint64, ciphertext []byte) (ReceiptEnvelope, error) {
	if len(ciphertext) == 0 || len(ciphertext) > maxCiphertextBytes {
		return ReceiptEnvelope{}, errors.New("ciphertext size is invalid")
	}
	if binding.Schema != protocol.PolicySchemaV1 || binding.Owner == (common.Address{}) || binding.PolicyCommitment == (common.Hash{}) || submissionNonce == (common.Hash{}) {
		return ReceiptEnvelope{}, errors.New("policy binding is incomplete")
	}
	if expiry <= issuedAt {
		return ReceiptEnvelope{}, errors.New("receipt expiry must be after issuedAt")
	}
	matchedMachine := false
	for index := range binding.MachineIDs {
		if binding.MachineIDs[index] == m.id {
			matchedMachine = binding.KeyFingerprints[index] == m.fingerprint
			break
		}
	}
	if !matchedMachine {
		return ReceiptEnvelope{}, errors.New("machine is not frozen in policy binding")
	}
	policy, err := m.resolver(append([]byte(nil), ciphertext...))
	if err != nil {
		return ReceiptEnvelope{}, fmt.Errorf("sealed policy unavailable: %w", err)
	}
	commitment, err := protocol.PolicyCommitment(policy)
	if err != nil {
		return ReceiptEnvelope{}, fmt.Errorf("sealed policy invalid: %w", err)
	}
	if commitment != binding.PolicyCommitment || policy.SubmissionNonce != submissionNonce || policy.Owner != binding.Owner || policy.ChainID.Cmp(binding.ChainID) != 0 || policy.Registry != binding.Registry || policy.Vault != binding.Vault || policy.Router != binding.Router || policy.PolicyID != binding.PolicyID || policy.PolicyVersion != binding.PolicyVersion {
		return ReceiptEnvelope{}, errors.New("sealed policy does not match frozen binding")
	}
	ciphertextDigest := sha256.Sum256(ciphertext)
	ciphertextHash := common.BytesToHash(ciphertextDigest[:])
	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.policies[binding.PolicyCommitment]; ok {
		if existing.ciphertextHash != ciphertextHash || existing.receipt.Receipt.ReceiptNonce != binding.PolicyNonce {
			return ReceiptEnvelope{}, errors.New("policy nonce already occupied by different ciphertext")
		}
		return existing.receipt, nil
	}
	receipt := protocol.PolicyReceiptV1{Binding: binding, MachineID: m.id, KeyFingerprint: m.fingerprint, SubmissionNonce: submissionNonce, ReceiptNonce: binding.PolicyNonce, IssuedAt: issuedAt, Expiry: expiry}
	digest, err := protocol.PolicyReceiptDigest(receipt)
	if err != nil {
		return ReceiptEnvelope{}, err
	}
	attestationMessage, err := protocol.PolicyReceiptAttestationMessage(receipt)
	if err != nil {
		return ReceiptEnvelope{}, err
	}
	signature, err := m.signer.Sign(attestationMessage)
	if err != nil {
		return ReceiptEnvelope{}, fmt.Errorf("sign receipt: %w", err)
	}
	envelope := ReceiptEnvelope{Receipt: receipt, Digest: digest, Signer: m.Signer(), Signature: signature}
	m.policies[binding.PolicyCommitment] = sealedPolicy{ciphertextHash: ciphertextHash, policy: policy, receipt: envelope}
	return envelope, nil
}

func (m *Machine) Evaluate(request protocol.ActionRequestV1, state protocol.SpendStateV1) (EvaluationEnvelope, error) {
	m.mu.RLock()
	sealed, ok := m.policies[request.PolicyCommitment]
	m.mu.RUnlock()
	if !ok {
		return EvaluationEnvelope{}, errors.New("policy is not in sealed custody")
	}
	result, err := protocol.EvaluatePolicy(sealed.policy, request, state)
	if err != nil {
		return EvaluationEnvelope{}, err
	}
	result.MachineID, result.KeyFingerprint = m.id, m.fingerprint
	digest, err := protocol.EvaluationDigest(result)
	if err != nil {
		return EvaluationEnvelope{}, err
	}
	attestationMessage, err := protocol.EvaluationAttestationMessage(result)
	if err != nil {
		return EvaluationEnvelope{}, err
	}
	signature, err := m.signer.Sign(attestationMessage)
	if err != nil {
		return EvaluationEnvelope{}, fmt.Errorf("sign evaluation: %w", err)
	}
	return EvaluationEnvelope{Result: result, Digest: digest, Signer: m.Signer(), Signature: signature}, nil
}

type CustodyBundle struct {
	Receipts [3]ReceiptEnvelope `json:"receipts"`
}

type Coordinator struct{ machines [3]*Machine }

func NewCoordinator(machines [3]*Machine) (*Coordinator, error) {
	seen := make(map[common.Hash]bool)
	fingerprints := make(map[common.Hash]bool)
	for _, machine := range machines {
		if machine == nil || seen[machine.ID()] || fingerprints[machine.Fingerprint()] {
			return nil, errors.New("custody machines must be three distinct identities")
		}
		seen[machine.ID()] = true
		fingerprints[machine.Fingerprint()] = true
	}
	return &Coordinator{machines: machines}, nil
}

func (c *Coordinator) Submit(binding protocol.PolicyBindingV1, submissionNonce common.Hash, issuedAt, expiry uint64, ciphertext []byte) (CustodyBundle, error) {
	var bundle CustodyBundle
	for index, machine := range c.machines {
		if machine.ID() != binding.MachineIDs[index] || machine.Fingerprint() != binding.KeyFingerprints[index] {
			return CustodyBundle{}, fmt.Errorf("custody machine %d does not match frozen binding", index)
		}
		receipt, err := machine.Submit(binding, submissionNonce, issuedAt, expiry, ciphertext)
		if err != nil {
			return CustodyBundle{}, fmt.Errorf("custody machine %d: %w", index, err)
		}
		bundle.Receipts[index] = receipt
	}
	return bundle, nil
}

func (c *Coordinator) Evaluate(request protocol.ActionRequestV1, state protocol.SpendStateV1) ([]EvaluationEnvelope, error) {
	results := make([]EvaluationEnvelope, 0, len(c.machines))
	for _, machine := range c.machines {
		result, err := machine.Evaluate(request, state)
		if err != nil {
			continue
		}
		results = append(results, result)
	}
	if len(results) < 2 {
		return nil, errors.New("evaluation threshold unavailable")
	}
	for left := 0; left < len(results); left++ {
		matches := 1
		for right := left + 1; right < len(results); right++ {
			if results[left].Digest == results[right].Digest {
				matches++
			}
		}
		if matches >= 2 {
			return results, nil
		}
	}
	return nil, errors.New("evaluation results split; fail closed")
}

type IngressRequest struct {
	Binding         protocol.PolicyBindingV1 `json:"binding"`
	SubmissionNonce common.Hash              `json:"submissionNonce"`
	IssuedAt        uint64                   `json:"issuedAt"`
	Expiry          uint64                   `json:"expiry"`
	Ciphertext      string                   `json:"ciphertext"`
}

type ingressRequestWire struct {
	Binding         protocol.PolicyBindingV1 `json:"binding"`
	SubmissionNonce common.Hash              `json:"submissionNonce"`
	IssuedAt        string                   `json:"issuedAt"`
	Expiry          string                   `json:"expiry"`
	Ciphertext      string                   `json:"ciphertext"`
}

func (request IngressRequest) MarshalJSON() ([]byte, error) {
	return json.Marshal(ingressRequestWire{
		Binding: request.Binding, SubmissionNonce: request.SubmissionNonce,
		IssuedAt: strconv.FormatUint(request.IssuedAt, 10), Expiry: strconv.FormatUint(request.Expiry, 10),
		Ciphertext: request.Ciphertext,
	})
}

func (request *IngressRequest) UnmarshalJSON(data []byte) error {
	var wire ingressRequestWire
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	issuedAt, err := strconv.ParseUint(wire.IssuedAt, 10, 64)
	if err != nil || strconv.FormatUint(issuedAt, 10) != wire.IssuedAt {
		return errors.New("issuedAt must be a canonical uint64 decimal string")
	}
	expiry, err := strconv.ParseUint(wire.Expiry, 10, 64)
	if err != nil || strconv.FormatUint(expiry, 10) != wire.Expiry {
		return errors.New("expiry must be a canonical uint64 decimal string")
	}
	*request = IngressRequest{
		Binding: wire.Binding, SubmissionNonce: wire.SubmissionNonce,
		IssuedAt: issuedAt, Expiry: expiry, Ciphertext: wire.Ciphertext,
	}
	return nil
}

type HTTPServer struct {
	coordinator *Coordinator
	now         func() uint64
}

func NewHTTPServer(coordinator *Coordinator) *HTTPServer {
	return &HTTPServer{coordinator: coordinator, now: func() uint64 { return uint64(time.Now().Unix()) }}
}

func (s *HTTPServer) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /private/ingress", s.handleIngress)
	return mux
}

func (s *HTTPServer) handleIngress(w http.ResponseWriter, request *http.Request) {
	if s.coordinator == nil {
		http.Error(w, "private ingress unavailable", http.StatusServiceUnavailable)
		return
	}
	request.Body = http.MaxBytesReader(w, request.Body, maxCiphertextBytes+32*1024)
	var payload IngressRequest
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		http.Error(w, "malformed private ingress", http.StatusBadRequest)
		return
	}
	ciphertext, err := base64.StdEncoding.DecodeString(payload.Ciphertext)
	if err != nil || len(ciphertext) == 0 || len(ciphertext) > maxCiphertextBytes {
		http.Error(w, "invalid ciphertext", http.StatusBadRequest)
		return
	}
	if payload.IssuedAt == 0 {
		payload.IssuedAt = s.now()
	}
	bundle, err := s.coordinator.Submit(payload.Binding, payload.SubmissionNonce, payload.IssuedAt, payload.Expiry, ciphertext)
	if err != nil {
		http.Error(w, "private ingress rejected", http.StatusUnprocessableEntity)
		return
	}
	// The response intentionally contains receipts only; ciphertext never crosses
	// this public response boundary and is not included in logs or metrics.
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(bundle)
}

func ContainsBytes(body []byte, forbidden ...[]byte) bool {
	for _, value := range forbidden {
		if bytes.Contains(body, value) {
			return true
		}
	}
	return false
}
