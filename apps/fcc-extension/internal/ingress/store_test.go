package ingress

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/protocol"
)

func TestFilePolicyStoreSurvivesProcessReconstructionWithoutPlaintext(t *testing.T) {
	policy := testPolicy()
	commitment, err := protocol.PolicyCommitment(policy)
	if err != nil {
		t.Fatal(err)
	}
	machineID := ingressHash("persistent-machine")
	fingerprint := ingressHash("persistent-fingerprint")
	machineKey, err := crypto.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(t.TempDir(), "machine")
	store, err := NewFilePolicyStore(root)
	if err != nil {
		t.Fatal(err)
	}
	resolver := func(received []byte) (protocol.PolicyV1, error) {
		if !bytes.Equal(received, []byte("independently-encrypted-policy")) {
			return protocol.PolicyV1{}, errors.New("unexpected encrypted policy")
		}
		return policy, nil
	}
	signer, err := newLocalAttestationSigner(machineKey)
	if err != nil {
		t.Fatal(err)
	}
	machine, err := newMachineWithSignerAndStore(machineID, fingerprint, signer, resolver, store)
	if err != nil {
		t.Fatal(err)
	}
	binding := protocol.PolicyBindingV1{
		ChainID: policy.ChainID, Registry: policy.Registry, Vault: policy.Vault, Router: policy.Router,
		Owner: policy.Owner, PolicyID: policy.PolicyID, PolicyVersion: policy.PolicyVersion,
		PolicyCommitment: commitment, Schema: protocol.PolicySchemaV1,
		ExtensionID: ingressHash("extension"), CodeVersion: ingressHash("code"),
		MachineIDs:       [3]common.Hash{machineID, ingressHash("machine-b"), ingressHash("machine-c")},
		KeyFingerprints:  [3]common.Hash{fingerprint, ingressHash("fingerprint-b"), ingressHash("fingerprint-c")},
		CustodyThreshold: 3, ResultThreshold: 2, PolicyNonce: 1,
	}
	first, err := machine.submit(
		binding, policy.SubmissionNonce, 1_000, 2_000, []byte("independently-encrypted-policy"),
	)
	if err != nil {
		t.Fatal(err)
	}

	path := store.path(commitment)
	info, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 || !info.Mode().IsRegular() {
		t.Fatal("policy record permissions or type are unsafe")
	}
	directory, err := os.Lstat(root)
	if err != nil || directory.Mode().Perm() != 0o700 {
		t.Fatal("policy store directory permissions are unsafe")
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range [][]byte{
		[]byte("MaxPerAction"), []byte("PrivateSalt"), []byte(policy.PrivateSalt.Hex()),
	} {
		if bytes.Contains(contents, forbidden) {
			t.Fatal("parsed private policy material reached the persistent record")
		}
	}

	reopened, err := NewFilePolicyStore(root)
	if err != nil {
		t.Fatal(err)
	}
	restarted, err := newMachineWithSignerAndStore(machineID, fingerprint, signer, resolver, reopened)
	if err != nil {
		t.Fatal(err)
	}
	retry, err := restarted.submit(
		binding, policy.SubmissionNonce, 1_000, 2_000, []byte("independently-encrypted-policy"),
	)
	if err != nil || retry.Digest != first.Digest || !bytes.Equal(retry.Signature, first.Signature) {
		t.Fatalf("same-identity exact retry was not idempotent: %v", err)
	}
	request := testRequest(policy)
	if _, err := restarted.Evaluate(request, testState(request)); err != nil {
		t.Fatalf("same-identity persisted policy did not evaluate: %v", err)
	}
	if _, err := restarted.submit(
		binding, policy.SubmissionNonce, 1_000, 2_000, []byte("changed-ciphertext"),
	); err == nil {
		t.Fatal("changed ciphertext overwrote an occupied policy slot")
	}
}

func TestFilePolicyStoreRejectsCorruptionPermissionsAndSymlinks(t *testing.T) {
	policy := testPolicy()
	commitment, err := protocol.PolicyCommitment(policy)
	if err != nil {
		t.Fatal(err)
	}
	record := testPolicyStoreRecord(t, policy, commitment)

	t.Run("corrupt", func(t *testing.T) {
		store, storeErr := NewFilePolicyStore(filepath.Join(t.TempDir(), "machine"))
		if storeErr != nil {
			t.Fatal(storeErr)
		}
		if _, _, storeErr = store.Put(commitment, record); storeErr != nil {
			t.Fatal(storeErr)
		}
		if storeErr = os.WriteFile(store.path(commitment), []byte("{"), 0o600); storeErr != nil {
			t.Fatal(storeErr)
		}
		if _, _, storeErr = store.Load(commitment); storeErr == nil {
			t.Fatal("corrupt policy record was accepted")
		}
	})

	t.Run("permissions", func(t *testing.T) {
		store, storeErr := NewFilePolicyStore(filepath.Join(t.TempDir(), "machine"))
		if storeErr != nil {
			t.Fatal(storeErr)
		}
		if _, _, storeErr = store.Put(commitment, record); storeErr != nil {
			t.Fatal(storeErr)
		}
		if storeErr = os.Chmod(store.path(commitment), 0o644); storeErr != nil {
			t.Fatal(storeErr)
		}
		if _, _, storeErr = store.Load(commitment); storeErr == nil {
			t.Fatal("over-permissive policy record was accepted")
		}
	})

	t.Run("symlink", func(t *testing.T) {
		store, storeErr := NewFilePolicyStore(filepath.Join(t.TempDir(), "machine"))
		if storeErr != nil {
			t.Fatal(storeErr)
		}
		target := filepath.Join(t.TempDir(), "target")
		if storeErr = os.WriteFile(target, []byte("{}"), 0o600); storeErr != nil {
			t.Fatal(storeErr)
		}
		if storeErr = os.Symlink(target, store.path(commitment)); storeErr != nil {
			t.Fatal(storeErr)
		}
		if _, _, storeErr = store.Load(commitment); storeErr == nil {
			t.Fatal("symlink policy record was accepted")
		}
	})
}

func TestFilePolicyStoreConcurrentExactWritesAreIdempotent(t *testing.T) {
	policy := testPolicy()
	commitment, err := protocol.PolicyCommitment(policy)
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewFilePolicyStore(filepath.Join(t.TempDir(), "machine"))
	if err != nil {
		t.Fatal(err)
	}
	record := testPolicyStoreRecord(t, policy, commitment)
	var group sync.WaitGroup
	errorsSeen := make(chan error, 8)
	for index := 0; index < 8; index++ {
		group.Add(1)
		go func() {
			defer group.Done()
			_, _, putErr := store.Put(commitment, record)
			errorsSeen <- putErr
		}()
	}
	group.Wait()
	close(errorsSeen)
	for putErr := range errorsSeen {
		if putErr != nil {
			t.Fatalf("concurrent exact write failed: %v", putErr)
		}
	}
	entries, err := os.ReadDir(store.root)
	if err != nil || len(entries) != 1 {
		t.Fatalf("expected one canonical policy record, got %d: %v", len(entries), err)
	}
}

func testPolicyStoreRecord(t *testing.T, policy protocol.PolicyV1, commitment common.Hash) policyStoreRecord {
	t.Helper()
	key, err := crypto.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	machineID := ingressHash("store-machine")
	fingerprint := ingressHash("store-fingerprint")
	binding := protocol.PolicyBindingV1{
		ChainID: policy.ChainID, Registry: policy.Registry, Vault: policy.Vault, Router: policy.Router,
		Owner: policy.Owner, PolicyID: policy.PolicyID, PolicyVersion: policy.PolicyVersion,
		PolicyCommitment: commitment, Schema: protocol.PolicySchemaV1,
		ExtensionID: ingressHash("extension"), CodeVersion: ingressHash("code"),
		MachineIDs:       [3]common.Hash{machineID, ingressHash("machine-b"), ingressHash("machine-c")},
		KeyFingerprints:  [3]common.Hash{fingerprint, ingressHash("fingerprint-b"), ingressHash("fingerprint-c")},
		CustodyThreshold: 3, ResultThreshold: 2, PolicyNonce: 1,
	}
	receipt := protocol.PolicyReceiptV1{
		Binding: binding, MachineID: machineID, KeyFingerprint: fingerprint,
		SubmissionNonce: policy.SubmissionNonce, ReceiptNonce: 1, IssuedAt: 1_000, Expiry: 2_000,
	}
	digest, err := protocol.PolicyReceiptDigest(receipt)
	if err != nil {
		t.Fatal(err)
	}
	message, err := protocol.PolicyReceiptAttestationMessage(receipt)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := newLocalAttestationSigner(key)
	if err != nil {
		t.Fatal(err)
	}
	signature, err := signer.Sign(message)
	if err != nil {
		t.Fatal(err)
	}
	ciphertext := []byte("independently-encrypted-policy")
	// Store records intentionally use SHA-256 rather than the ingress
	// authorization's Keccak-256 ciphertext commitment.
	shaBytes := sha256Bytes(ciphertext)
	return policyStoreRecord{
		CiphertextHash: shaBytes,
		Ciphertext:     ciphertext,
		Receipt:        ReceiptEnvelope{Receipt: receipt, Digest: digest, Signer: signer.Address(), Signature: signature},
	}
}

func sha256Bytes(value []byte) common.Hash {
	digest := sha256.Sum256(value)
	return common.BytesToHash(digest[:])
}
