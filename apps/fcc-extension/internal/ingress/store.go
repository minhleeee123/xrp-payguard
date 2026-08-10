package ingress

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"os"
	"path/filepath"
	"sync"

	"github.com/ethereum/go-ethereum/common"
	"golang.org/x/sys/unix"
)

const maxPolicyStoreRecordBytes = maxCiphertextBytes*2 + 64*1024

type policyStoreRecord struct {
	CiphertextHash common.Hash     `json:"ciphertextHash"`
	Ciphertext     []byte          `json:"ciphertext"`
	Receipt        ReceiptEnvelope `json:"receipt"`
}

// policyStore persists only the independently encrypted policy and public
// receipt metadata. A parsed policy is never part of this boundary.
type policyStore interface {
	Load(commitment common.Hash) (policyStoreRecord, bool, error)
	Put(commitment common.Hash, record policyStoreRecord) (policyStoreRecord, bool, error)
}

type memoryPolicyStore struct {
	mu      sync.RWMutex
	records map[common.Hash]policyStoreRecord
}

func newMemoryPolicyStore() *memoryPolicyStore {
	return &memoryPolicyStore{records: make(map[common.Hash]policyStoreRecord)}
}

func (s *memoryPolicyStore) Load(commitment common.Hash) (policyStoreRecord, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	record, ok := s.records[commitment]
	return clonePolicyStoreRecord(record), ok, nil
}

func (s *memoryPolicyStore) Put(commitment common.Hash, record policyStoreRecord) (policyStoreRecord, bool, error) {
	if err := validatePolicyStoreRecord(commitment, record); err != nil {
		return policyStoreRecord{}, false, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.records[commitment]; ok {
		if !samePolicyStoreRecord(existing, record) {
			return policyStoreRecord{}, false, errors.New("policy store slot already contains different ciphertext or receipt")
		}
		return clonePolicyStoreRecord(existing), false, nil
	}
	s.records[commitment] = clonePolicyStoreRecord(record)
	return clonePolicyStoreRecord(record), true, nil
}

func (s *memoryPolicyStore) delete(commitment common.Hash) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.records, commitment)
}

// FilePolicyStore is a Linux FCC-runtime store with no-overwrite atomic writes.
// Files contain ciphertext plus public receipt metadata, never parsed policy
// fields. The caller must namespace root by the current TEE identity.
type FilePolicyStore struct {
	mu   sync.Mutex
	root string
}

func NewFilePolicyStore(root string) (*FilePolicyStore, error) {
	if root == "" || !filepath.IsAbs(root) || filepath.Clean(root) != root {
		return nil, errors.New("policy store root must be a clean absolute path")
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, fmt.Errorf("create policy store directory: %w", err)
	}
	info, err := os.Lstat(root)
	if err != nil {
		return nil, fmt.Errorf("inspect policy store directory: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() || info.Mode().Perm() != 0o700 {
		return nil, errors.New("policy store directory must be a non-symlink directory with mode 0700")
	}
	return &FilePolicyStore{root: root}, nil
}

func (s *FilePolicyStore) Load(commitment common.Hash) (policyStoreRecord, bool, error) {
	if commitment == (common.Hash{}) {
		return policyStoreRecord{}, false, errors.New("policy store commitment is required")
	}
	return s.loadPath(commitment, s.path(commitment))
}

func (s *FilePolicyStore) Put(commitment common.Hash, record policyStoreRecord) (policyStoreRecord, bool, error) {
	if err := validatePolicyStoreRecord(commitment, record); err != nil {
		return policyStoreRecord{}, false, err
	}
	encoded, err := json.Marshal(record)
	if err != nil {
		return policyStoreRecord{}, false, fmt.Errorf("encode policy store record: %w", err)
	}
	if len(encoded) == 0 || len(encoded) > maxPolicyStoreRecordBytes {
		return policyStoreRecord{}, false, errors.New("encoded policy store record exceeds bound")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	finalPath := s.path(commitment)
	if existing, ok, loadErr := s.loadPath(commitment, finalPath); loadErr != nil {
		return policyStoreRecord{}, false, loadErr
	} else if ok {
		if !samePolicyStoreRecord(existing, record) {
			return policyStoreRecord{}, false, errors.New("policy store slot already contains different ciphertext or receipt")
		}
		return existing, false, nil
	}

	temporary, err := os.CreateTemp(s.root, ".policy-*.tmp")
	if err != nil {
		return policyStoreRecord{}, false, fmt.Errorf("create temporary policy record: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return policyStoreRecord{}, false, fmt.Errorf("restrict temporary policy record: %w", err)
	}
	if _, err := temporary.Write(encoded); err != nil {
		_ = temporary.Close()
		return policyStoreRecord{}, false, fmt.Errorf("write temporary policy record: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return policyStoreRecord{}, false, fmt.Errorf("sync temporary policy record: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return policyStoreRecord{}, false, fmt.Errorf("close temporary policy record: %w", err)
	}
	if err := os.Link(temporaryPath, finalPath); err != nil {
		if !errors.Is(err, os.ErrExist) {
			return policyStoreRecord{}, false, fmt.Errorf("commit policy record without overwrite: %w", err)
		}
		existing, ok, loadErr := s.loadPath(commitment, finalPath)
		if loadErr != nil || !ok {
			return policyStoreRecord{}, false, errors.New("concurrent policy store record is unavailable")
		}
		if !samePolicyStoreRecord(existing, record) {
			return policyStoreRecord{}, false, errors.New("concurrent policy store record conflicts")
		}
		return existing, false, nil
	}
	directory, err := os.Open(s.root)
	if err != nil {
		return policyStoreRecord{}, false, fmt.Errorf("open policy store directory for sync: %w", err)
	}
	if err := directory.Sync(); err != nil {
		_ = directory.Close()
		return policyStoreRecord{}, false, fmt.Errorf("sync policy store directory: %w", err)
	}
	if err := directory.Close(); err != nil {
		return policyStoreRecord{}, false, fmt.Errorf("close policy store directory: %w", err)
	}
	return clonePolicyStoreRecord(record), true, nil
}

func (s *FilePolicyStore) path(commitment common.Hash) string {
	return filepath.Join(s.root, commitment.Hex()[2:]+".json")
}

func (s *FilePolicyStore) loadPath(commitment common.Hash, path string) (policyStoreRecord, bool, error) {
	file, err := os.OpenFile(path, os.O_RDONLY|unix.O_NOFOLLOW, 0)
	if errors.Is(err, os.ErrNotExist) {
		return policyStoreRecord{}, false, nil
	}
	if err != nil {
		return policyStoreRecord{}, false, fmt.Errorf("open policy store record: %w", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return policyStoreRecord{}, false, fmt.Errorf("inspect policy store record: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm() != 0o600 || info.Size() <= 0 || info.Size() > maxPolicyStoreRecordBytes {
		return policyStoreRecord{}, false, errors.New("policy store record type, mode, or size is invalid")
	}
	var record policyStoreRecord
	decoder := json.NewDecoder(io.LimitReader(file, maxPolicyStoreRecordBytes+1))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&record); err != nil {
		return policyStoreRecord{}, false, errors.New("policy store record is corrupt")
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return policyStoreRecord{}, false, errors.New("policy store record has trailing data")
	}
	if err := validatePolicyStoreRecord(commitment, record); err != nil {
		return policyStoreRecord{}, false, fmt.Errorf("policy store record failed validation: %w", err)
	}
	return clonePolicyStoreRecord(record), true, nil
}

func validatePolicyStoreRecord(commitment common.Hash, record policyStoreRecord) error {
	if commitment == (common.Hash{}) || len(record.Ciphertext) == 0 || len(record.Ciphertext) > maxCiphertextBytes {
		return errors.New("policy store record binding or ciphertext size is invalid")
	}
	digest := sha256.Sum256(record.Ciphertext)
	if common.BytesToHash(digest[:]) != record.CiphertextHash {
		return errors.New("policy store ciphertext hash mismatch")
	}
	if record.Receipt.Receipt.Binding.PolicyCommitment != commitment || record.Receipt.Digest == (common.Hash{}) || record.Receipt.Signer == (common.Address{}) || len(record.Receipt.Signature) != 65 {
		return errors.New("policy store receipt binding is invalid")
	}
	return nil
}

func samePolicyStoreRecord(left, right policyStoreRecord) bool {
	leftJSON, leftErr := json.Marshal(left)
	rightJSON, rightErr := json.Marshal(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftJSON, rightJSON)
}

func clonePolicyStoreRecord(source policyStoreRecord) policyStoreRecord {
	target := source
	target.Ciphertext = append([]byte(nil), source.Ciphertext...)
	target.Receipt.Signature = append([]byte(nil), source.Receipt.Signature...)
	if source.Receipt.Receipt.Binding.ChainID != nil {
		target.Receipt.Receipt.Binding.ChainID = new(big.Int).Set(source.Receipt.Receipt.Binding.ChainID)
	}
	return target
}
