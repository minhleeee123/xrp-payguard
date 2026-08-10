package ingress

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/protocol"
)

const maxCiphertextBytes = 64 * 1024

const (
	maxIngressLifetimeSeconds = uint64(15 * 60)
	maxIngressFutureSkew      = uint64(30)
)

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

type Machine struct {
	id          common.Hash
	fingerprint common.Hash
	signer      AttestationSigner
	resolver    PolicyResolver
	store       policyStore
}

func NewMachine(id, fingerprint common.Hash, signer *ecdsa.PrivateKey, resolver PolicyResolver) (*Machine, error) {
	localSigner, err := newLocalAttestationSigner(signer)
	if err != nil {
		return nil, err
	}
	return NewMachineWithSigner(id, fingerprint, localSigner, resolver)
}

func NewMachineWithSigner(id, fingerprint common.Hash, signer AttestationSigner, resolver PolicyResolver) (*Machine, error) {
	return newMachineWithSignerAndStore(id, fingerprint, signer, resolver, newMemoryPolicyStore())
}

func newMachineWithSignerAndStore(id, fingerprint common.Hash, signer AttestationSigner, resolver PolicyResolver, store policyStore) (*Machine, error) {
	if id == (common.Hash{}) || fingerprint == (common.Hash{}) || signer == nil || signer.Address() == (common.Address{}) || resolver == nil || store == nil {
		return nil, errors.New("machine requires identity, signer, and sealed resolver")
	}
	return &Machine{id: id, fingerprint: fingerprint, signer: signer, resolver: resolver, store: store}, nil
}

func (m *Machine) ID() common.Hash          { return m.id }
func (m *Machine) Fingerprint() common.Hash { return m.fingerprint }
func (m *Machine) Signer() common.Address   { return m.signer.Address() }

func (m *Machine) submit(binding protocol.PolicyBindingV1, submissionNonce common.Hash, issuedAt, expiry uint64, ciphertext []byte) (ReceiptEnvelope, error) {
	if len(ciphertext) == 0 || len(ciphertext) > maxCiphertextBytes {
		return ReceiptEnvelope{}, errors.New("ciphertext size is invalid")
	}
	if binding.ChainID == nil || binding.ChainID.Sign() <= 0 || binding.Registry == (common.Address{}) || binding.Vault == (common.Address{}) || binding.Router == (common.Address{}) || binding.Owner == (common.Address{}) || binding.PolicyID == (common.Hash{}) || binding.PolicyCommitment == (common.Hash{}) || binding.Schema != protocol.PolicySchemaV1 || binding.ExtensionID == (common.Hash{}) || binding.CodeVersion == (common.Hash{}) || binding.CustodyThreshold != 3 || binding.ResultThreshold != 2 || binding.PolicyNonce == 0 || submissionNonce == (common.Hash{}) {
		return ReceiptEnvelope{}, errors.New("policy binding is incomplete")
	}
	for index := range binding.MachineIDs {
		if binding.MachineIDs[index] == (common.Hash{}) || binding.KeyFingerprints[index] == (common.Hash{}) {
			return ReceiptEnvelope{}, errors.New("policy binding machine set is incomplete")
		}
		for previous := 0; previous < index; previous++ {
			if binding.MachineIDs[index] == binding.MachineIDs[previous] || binding.KeyFingerprints[index] == binding.KeyFingerprints[previous] {
				return ReceiptEnvelope{}, errors.New("policy binding machine set is not distinct")
			}
		}
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
	ciphertextDigest := sha256.Sum256(ciphertext)
	ciphertextHash := common.BytesToHash(ciphertextDigest[:])
	receipt := protocol.PolicyReceiptV1{Binding: binding, MachineID: m.id, KeyFingerprint: m.fingerprint, SubmissionNonce: submissionNonce, ReceiptNonce: binding.PolicyNonce, IssuedAt: issuedAt, Expiry: expiry}
	digest, err := protocol.PolicyReceiptDigest(receipt)
	if err != nil {
		return ReceiptEnvelope{}, err
	}
	existing, ok, err := m.store.Load(binding.PolicyCommitment)
	if err != nil {
		return ReceiptEnvelope{}, fmt.Errorf("load sealed policy: %w", err)
	}
	if ok {
		if existing.CiphertextHash != ciphertextHash || existing.Receipt.Digest != digest || !m.validStoredReceipt(existing.Receipt) {
			return ReceiptEnvelope{}, errors.New("policy nonce already occupied by different ciphertext or receipt")
		}
		return existing.Receipt, nil
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
	attestationMessage, err := protocol.PolicyReceiptAttestationMessage(receipt)
	if err != nil {
		return ReceiptEnvelope{}, err
	}
	signature, err := m.signer.Sign(attestationMessage)
	if err != nil {
		return ReceiptEnvelope{}, fmt.Errorf("sign receipt: %w", err)
	}
	envelope := ReceiptEnvelope{Receipt: receipt, Digest: digest, Signer: m.Signer(), Signature: signature}
	stored, _, err := m.store.Put(binding.PolicyCommitment, policyStoreRecord{
		CiphertextHash: ciphertextHash,
		Ciphertext:     append([]byte(nil), ciphertext...),
		Receipt:        envelope,
	})
	if err != nil {
		return ReceiptEnvelope{}, fmt.Errorf("persist sealed policy: %w", err)
	}
	if !m.validStoredReceipt(stored.Receipt) {
		return ReceiptEnvelope{}, errors.New("persisted policy receipt failed validation")
	}
	return stored.Receipt, nil
}

func (m *Machine) SubmitAuthorized(binding protocol.PolicyBindingV1, submissionNonce common.Hash, issuedAt, expiry uint64, ciphertext, authorization []byte) (ReceiptEnvelope, error) {
	ciphertextHash := crypto.Keccak256Hash(ciphertext)
	digest, err := protocol.PolicyIngressAuthorizationDigest(
		binding, submissionNonce, issuedAt, expiry, ciphertextHash, m.id, m.fingerprint,
	)
	if err != nil {
		return ReceiptEnvelope{}, err
	}
	if !verifyOwnerAuthorization(digest, authorization, binding.Owner) {
		return ReceiptEnvelope{}, errors.New("policy owner authorization is invalid")
	}
	return m.submit(binding, submissionNonce, issuedAt, expiry, ciphertext)
}

func verifyOwnerAuthorization(digest common.Hash, authorization []byte, owner common.Address) bool {
	normalized, ok := normalizeCanonicalSignature(authorization)
	if !ok || owner == (common.Address{}) {
		return false
	}
	publicKey, err := crypto.SigToPub(accounts.TextHash(digest.Bytes()), normalized)
	return err == nil && publicKey != nil && crypto.PubkeyToAddress(*publicKey) == owner
}

func (m *Machine) Evaluate(request protocol.ActionRequestV1, state protocol.SpendStateV1) (EvaluationEnvelope, error) {
	sealed, ok, err := m.store.Load(request.PolicyCommitment)
	if err != nil {
		return EvaluationEnvelope{}, fmt.Errorf("load sealed policy: %w", err)
	}
	if !ok {
		return EvaluationEnvelope{}, errors.New("policy is not in sealed custody")
	}
	if !m.validStoredReceipt(sealed.Receipt) {
		return EvaluationEnvelope{}, errors.New("sealed policy receipt is invalid")
	}
	binding := sealed.Receipt.Receipt.Binding
	if binding.ChainID == nil || request.ChainID == nil || binding.PolicyCommitment != request.PolicyCommitment || binding.ChainID.Cmp(request.ChainID) != 0 || binding.Registry != request.Registry || binding.Vault != request.Vault || binding.Router != request.Router || binding.PolicyID != request.PolicyID || binding.PolicyVersion != request.PolicyVersion {
		return EvaluationEnvelope{}, errors.New("sealed policy binding does not match request")
	}
	policy, err := m.resolver(append([]byte(nil), sealed.Ciphertext...))
	if err != nil {
		return EvaluationEnvelope{}, fmt.Errorf("sealed policy unavailable: %w", err)
	}
	commitment, err := protocol.PolicyCommitment(policy)
	if err != nil || commitment != request.PolicyCommitment {
		return EvaluationEnvelope{}, errors.New("sealed policy commitment is invalid")
	}
	result, err := protocol.EvaluatePolicy(policy, request, state)
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

func (m *Machine) validStoredReceipt(envelope ReceiptEnvelope) bool {
	if envelope.Signer != m.Signer() || envelope.Receipt.MachineID != m.id || envelope.Receipt.KeyFingerprint != m.fingerprint {
		return false
	}
	digest, err := protocol.PolicyReceiptDigest(envelope.Receipt)
	if err != nil || digest != envelope.Digest {
		return false
	}
	attestationDigest, err := protocol.PolicyReceiptAttestationDigest(envelope.Receipt)
	return err == nil && VerifySignature(attestationDigest, envelope.Signature, envelope.Signer)
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

func (c *Coordinator) submit(binding protocol.PolicyBindingV1, submissionNonce common.Hash, issuedAt, expiry uint64, ciphertext []byte) (CustodyBundle, error) {
	var bundle CustodyBundle
	for index, machine := range c.machines {
		if machine.ID() != binding.MachineIDs[index] || machine.Fingerprint() != binding.KeyFingerprints[index] {
			return CustodyBundle{}, fmt.Errorf("custody machine %d does not match frozen binding", index)
		}
		receipt, err := machine.submit(binding, submissionNonce, issuedAt, expiry, ciphertext)
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

type MachineIngressRequest struct {
	Binding         protocol.PolicyBindingV1 `json:"binding"`
	SubmissionNonce common.Hash              `json:"submissionNonce"`
	IssuedAt        uint64                   `json:"issuedAt"`
	Expiry          uint64                   `json:"expiry"`
	Ciphertext      string                   `json:"ciphertext"`
	Authorization   hexutil.Bytes            `json:"authorization"`
}

type machineIngressRequestWire struct {
	Binding         protocol.PolicyBindingV1 `json:"binding"`
	SubmissionNonce common.Hash              `json:"submissionNonce"`
	IssuedAt        string                   `json:"issuedAt"`
	Expiry          string                   `json:"expiry"`
	Ciphertext      string                   `json:"ciphertext"`
	Authorization   hexutil.Bytes            `json:"authorization"`
}

func (request MachineIngressRequest) MarshalJSON() ([]byte, error) {
	return json.Marshal(machineIngressRequestWire{
		Binding: request.Binding, SubmissionNonce: request.SubmissionNonce,
		IssuedAt: strconv.FormatUint(request.IssuedAt, 10), Expiry: strconv.FormatUint(request.Expiry, 10),
		Ciphertext: request.Ciphertext, Authorization: request.Authorization,
	})
}

func (request *MachineIngressRequest) UnmarshalJSON(data []byte) error {
	var wire machineIngressRequestWire
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
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
	*request = MachineIngressRequest{
		Binding: wire.Binding, SubmissionNonce: wire.SubmissionNonce, IssuedAt: issuedAt,
		Expiry: expiry, Ciphertext: wire.Ciphertext, Authorization: wire.Authorization,
	}
	return nil
}

type MachineHTTPServer struct {
	machine *Machine
	now     func() uint64
}

func NewMachineHTTPServer(machine *Machine) *MachineHTTPServer {
	return &MachineHTTPServer{machine: machine, now: func() uint64 { return uint64(time.Now().Unix()) }}
}

func (s *MachineHTTPServer) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /private/health", s.handleHealth)
	mux.HandleFunc("POST /private/ingress", s.handleMachineIngress)
	return mux
}

func (s *MachineHTTPServer) handleHealth(w http.ResponseWriter, _ *http.Request) {
	if s.machine == nil {
		http.Error(w, "private ingress unavailable", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status": "ready", "machineId": s.machine.ID(),
		"keyFingerprint": s.machine.Fingerprint(), "signer": s.machine.Signer(),
	})
}

func (s *MachineHTTPServer) handleMachineIngress(w http.ResponseWriter, request *http.Request) {
	if s.machine == nil {
		http.Error(w, "private ingress unavailable", http.StatusServiceUnavailable)
		return
	}
	request.Body = http.MaxBytesReader(w, request.Body, maxCiphertextBytes*2+32*1024)
	var payload MachineIngressRequest
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		http.Error(w, "malformed private ingress", http.StatusBadRequest)
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		http.Error(w, "malformed private ingress", http.StatusBadRequest)
		return
	}
	ciphertext, err := base64.StdEncoding.DecodeString(payload.Ciphertext)
	if err != nil || len(ciphertext) == 0 || len(ciphertext) > maxCiphertextBytes {
		http.Error(w, "invalid ciphertext", http.StatusBadRequest)
		return
	}
	now := s.now()
	if payload.IssuedAt == 0 || payload.IssuedAt > now+maxIngressFutureSkew || payload.Expiry <= now || payload.Expiry <= payload.IssuedAt || payload.Expiry-payload.IssuedAt > maxIngressLifetimeSeconds {
		http.Error(w, "private ingress time window rejected", http.StatusUnprocessableEntity)
		return
	}
	receipt, err := s.machine.SubmitAuthorized(
		payload.Binding, payload.SubmissionNonce, payload.IssuedAt, payload.Expiry,
		ciphertext, payload.Authorization,
	)
	if err != nil {
		http.Error(w, "private ingress rejected", http.StatusUnprocessableEntity)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(receipt)
}
