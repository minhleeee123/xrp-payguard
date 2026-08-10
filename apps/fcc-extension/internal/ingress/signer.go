package ingress

import (
	"bytes"
	"crypto/ecdsa"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/protocol"
)

const (
	maxSignPortResponseBytes = 4096
	maxDecryptResponseBytes  = 128 * 1024
)

var identityDiscoveryMessage = []byte("PAYGUARD_TEE_IDENTITY_DISCOVERY_V1")
var decryptReadinessMessage = []byte("PAYGUARD_TEE_DECRYPT_READINESS_V1")

type AttestationSigner interface {
	Address() common.Address
	Sign(message []byte) ([]byte, error)
}

type localAttestationSigner struct {
	key *ecdsa.PrivateKey
}

func newLocalAttestationSigner(key *ecdsa.PrivateKey) (*localAttestationSigner, error) {
	if key == nil {
		return nil, errors.New("local attestation key is required")
	}
	return &localAttestationSigner{key: key}, nil
}

func (s *localAttestationSigner) Address() common.Address {
	return crypto.PubkeyToAddress(s.key.PublicKey)
}

func (s *localAttestationSigner) Sign(message []byte) ([]byte, error) {
	if len(message) == 0 {
		return nil, errors.New("attestation message is required")
	}
	return crypto.Sign(accounts.TextHash(crypto.Keccak256(message)), s.key)
}

type TeeSignPortSigner struct {
	endpoint string
	address  common.Address
	client   *http.Client
}

type TeeIdentity struct {
	MachineID      common.Hash
	KeyFingerprint common.Hash
	Signer         common.Address
}

type TeeDecryptor struct {
	endpoint string
	client   *http.Client
}

func NewTeeSignPortSigner(signPort int, signer common.Address) (*TeeSignPortSigner, error) {
	if signPort <= 0 || signPort > 65535 {
		return nil, errors.New("TEE sign port is invalid")
	}
	return newTeeSignPortSigner(
		fmt.Sprintf("http://127.0.0.1:%d", signPort),
		signer,
		&http.Client{Timeout: 5 * time.Second},
	)
}

func DiscoverTeeSignPortSigner(signPort int) (*TeeSignPortSigner, TeeIdentity, error) {
	signer, identity, _, err := discoverTeeSignPortSigner(signPort)
	return signer, identity, err
}

func discoverTeeSignPortSigner(signPort int) (*TeeSignPortSigner, TeeIdentity, *ecdsa.PublicKey, error) {
	if signPort <= 0 || signPort > 65535 {
		return nil, TeeIdentity{}, nil, errors.New("TEE sign port is invalid")
	}
	client := &http.Client{Timeout: 5 * time.Second}
	endpoint, err := loopbackEndpoint(fmt.Sprintf("http://127.0.0.1:%d", signPort), "/sign")
	if err != nil {
		return nil, TeeIdentity{}, nil, err
	}
	signed, err := requestTeeSignature(endpoint, client, identityDiscoveryMessage)
	if err != nil {
		return nil, TeeIdentity{}, nil, fmt.Errorf("discover TEE identity: %w", err)
	}
	normalized, ok := normalizeCanonicalSignature(signed.Signature)
	if !ok {
		return nil, TeeIdentity{}, nil, errors.New("TEE identity signature is not canonical")
	}
	digest := crypto.Keccak256Hash(identityDiscoveryMessage)
	publicKey, err := crypto.SigToPub(accounts.TextHash(digest.Bytes()), normalized)
	if err != nil || publicKey == nil {
		return nil, TeeIdentity{}, nil, errors.New("recover TEE identity signature")
	}
	publicBytes := crypto.FromECDSAPub(publicKey)
	if len(publicBytes) != 65 {
		return nil, TeeIdentity{}, nil, errors.New("TEE identity public key is invalid")
	}
	signerAddress := crypto.PubkeyToAddress(*publicKey)
	identity := TeeIdentity{
		MachineID:      common.BytesToHash(signerAddress.Bytes()),
		KeyFingerprint: crypto.Keccak256Hash(publicBytes[1:]),
		Signer:         signerAddress,
	}
	signer, err := newTeeSignPortSigner(endpoint, signerAddress, client)
	if err != nil {
		return nil, TeeIdentity{}, nil, err
	}
	return signer, identity, publicKey, nil
}

func newTeeSignPortSigner(endpoint string, signer common.Address, client *http.Client) (*TeeSignPortSigner, error) {
	canonical, err := loopbackEndpoint(endpoint, "/sign")
	if err != nil {
		return nil, err
	}
	if signer == (common.Address{}) || client == nil {
		return nil, errors.New("TEE signer identity and HTTP client are required")
	}
	return &TeeSignPortSigner{endpoint: canonical, address: signer, client: client}, nil
}

func loopbackEndpoint(endpoint, path string) (string, error) {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "http" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("TEE endpoint must be a credential-free loopback HTTP origin")
	}
	if parsed.Hostname() != "127.0.0.1" && parsed.Hostname() != "localhost" && parsed.Hostname() != "::1" {
		return "", errors.New("TEE endpoint must use loopback")
	}
	parsed.Path = path
	return parsed.String(), nil
}

func (s *TeeSignPortSigner) Address() common.Address { return s.address }

func (s *TeeSignPortSigner) Sign(message []byte) ([]byte, error) {
	if len(message) == 0 {
		return nil, errors.New("attestation message is required")
	}
	signed, err := requestTeeSignature(s.endpoint, s.client, message)
	if err != nil {
		return nil, err
	}
	digest := crypto.Keccak256Hash(message)
	if !VerifySignature(digest, signed.Signature, s.address) {
		return nil, errors.New("TEE sign response signature mismatch")
	}
	return append([]byte(nil), signed.Signature...), nil
}

func requestTeeSignature(endpoint string, client *http.Client, message []byte) (teetypes.SignResponse, error) {
	body, err := json.Marshal(teetypes.SignRequest{Message: message})
	if err != nil {
		return teetypes.SignResponse{}, fmt.Errorf("encode TEE sign request: %w", err)
	}
	request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return teetypes.SignResponse{}, fmt.Errorf("build TEE sign request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return teetypes.SignResponse{}, fmt.Errorf("TEE sign request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxSignPortResponseBytes))
		return teetypes.SignResponse{}, fmt.Errorf("TEE sign request returned status %d", response.StatusCode)
	}
	var signed teetypes.SignResponse
	if err := decodeBoundedJSON(response.Body, maxSignPortResponseBytes, &signed); err != nil {
		return teetypes.SignResponse{}, fmt.Errorf("decode TEE sign response: %w", err)
	}
	if !bytes.Equal(signed.Message, message) {
		return teetypes.SignResponse{}, errors.New("TEE sign response message mismatch")
	}
	return signed, nil
}

func NewTeeDecryptor(signPort int) (*TeeDecryptor, error) {
	if signPort <= 0 || signPort > 65535 {
		return nil, errors.New("TEE sign port is invalid")
	}
	return newTeeDecryptor(
		fmt.Sprintf("http://127.0.0.1:%d", signPort),
		&http.Client{Timeout: 5 * time.Second},
	)
}

func newTeeDecryptor(endpoint string, client *http.Client) (*TeeDecryptor, error) {
	canonical, err := loopbackEndpoint(endpoint, "/decrypt")
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, errors.New("TEE decrypt HTTP client is required")
	}
	return &TeeDecryptor{endpoint: canonical, client: client}, nil
}

func (d *TeeDecryptor) decrypt(ciphertext []byte) ([]byte, error) {
	if len(ciphertext) == 0 || len(ciphertext) > maxCiphertextBytes {
		return nil, errors.New("encrypted policy size is invalid")
	}
	body, err := json.Marshal(teetypes.DecryptRequest{EncryptedMessage: ciphertext})
	if err != nil {
		return nil, fmt.Errorf("encode TEE decrypt request: %w", err)
	}
	defer func() {
		for index := range body {
			body[index] = 0
		}
	}()
	request, err := http.NewRequest(http.MethodPost, d.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build TEE decrypt request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := d.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("TEE decrypt request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxSignPortResponseBytes))
		return nil, fmt.Errorf("TEE decrypt request returned status %d", response.StatusCode)
	}
	var decrypted teetypes.DecryptResponse
	if err := decodeBoundedJSON(response.Body, maxDecryptResponseBytes, &decrypted); err != nil {
		return nil, fmt.Errorf("decode TEE decrypt response: %w", err)
	}
	if len(decrypted.DecryptedMessage) == 0 || len(decrypted.DecryptedMessage) > maxCiphertextBytes {
		return nil, errors.New("decrypted policy size is invalid")
	}
	return decrypted.DecryptedMessage, nil
}

func (d *TeeDecryptor) ResolvePolicy(ciphertext []byte) (protocol.PolicyV1, error) {
	plaintext, err := d.decrypt(ciphertext)
	if err != nil {
		return protocol.PolicyV1{}, err
	}
	defer func() {
		for index := range plaintext {
			plaintext[index] = 0
		}
	}()
	var policy protocol.PolicyV1
	decoder := json.NewDecoder(bytes.NewReader(plaintext))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&policy); err != nil {
		return protocol.PolicyV1{}, errors.New("decrypted policy is malformed")
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return protocol.PolicyV1{}, errors.New("decrypted policy has trailing data")
	}
	return policy, nil
}

func NewTeeMachine(signPort int) (*Machine, TeeIdentity, error) {
	return newTeeMachine(signPort, "")
}

func NewTeeMachineWithStoreRoot(signPort int, storeRoot string) (*Machine, TeeIdentity, error) {
	if storeRoot == "" || !filepath.IsAbs(storeRoot) || filepath.Clean(storeRoot) != storeRoot {
		return nil, TeeIdentity{}, errors.New("TEE policy store root must be a clean absolute path")
	}
	return newTeeMachine(signPort, storeRoot)
}

func newTeeMachine(signPort int, storeRoot string) (*Machine, TeeIdentity, error) {
	signer, identity, publicKey, err := discoverTeeSignPortSigner(signPort)
	if err != nil {
		return nil, TeeIdentity{}, err
	}
	decryptor, err := NewTeeDecryptor(signPort)
	if err != nil {
		return nil, TeeIdentity{}, err
	}
	probeCiphertext, err := teeutils.Encrypt(decryptReadinessMessage, publicKey)
	if err != nil {
		return nil, TeeIdentity{}, errors.New("encrypt TEE decrypt-readiness probe")
	}
	decryptedProbe, err := decryptor.decrypt(probeCiphertext)
	for index := range probeCiphertext {
		probeCiphertext[index] = 0
	}
	if err != nil {
		return nil, TeeIdentity{}, fmt.Errorf("TEE decrypt-readiness probe: %w", err)
	}
	probeMatches := bytes.Equal(decryptedProbe, decryptReadinessMessage)
	for index := range decryptedProbe {
		decryptedProbe[index] = 0
	}
	if !probeMatches {
		return nil, TeeIdentity{}, errors.New("TEE decrypt-readiness response mismatch")
	}
	var store policyStore = newMemoryPolicyStore()
	if storeRoot != "" {
		identityDirectory := filepath.Join(storeRoot, strings.ToLower(identity.MachineID.Hex()[2:]))
		store, err = NewFilePolicyStore(identityDirectory)
		if err != nil {
			return nil, TeeIdentity{}, fmt.Errorf("initialize identity-bound policy store: %w", err)
		}
	}
	machine, err := newMachineWithSignerAndStore(
		identity.MachineID, identity.KeyFingerprint, signer, decryptor.ResolvePolicy, store,
	)
	if err != nil {
		return nil, TeeIdentity{}, err
	}
	return machine, identity, nil
}

func decodeBoundedJSON(reader io.Reader, limit int64, target any) error {
	body, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return err
	}
	if int64(len(body)) > limit {
		return errors.New("response body exceeds limit")
	}
	defer func() {
		for index := range body {
			body[index] = 0
		}
	}()
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return errors.New("response contains trailing data")
	}
	return nil
}

func VerifySignature(attestationDigest common.Hash, signature []byte, signer common.Address) bool {
	normalized, ok := normalizeCanonicalSignature(signature)
	if !ok {
		return false
	}
	publicKey, err := crypto.SigToPub(accounts.TextHash(attestationDigest.Bytes()), normalized)
	return err == nil && publicKey != nil && crypto.PubkeyToAddress(*publicKey) == signer
}

func normalizeCanonicalSignature(signature []byte) ([]byte, bool) {
	if len(signature) != 65 {
		return nil, false
	}
	normalized := append([]byte(nil), signature...)
	if normalized[64] >= 27 {
		normalized[64] -= 27
	}
	if normalized[64] > 1 {
		return nil, false
	}
	r := new(big.Int).SetBytes(normalized[:32])
	s := new(big.Int).SetBytes(normalized[32:64])
	if !crypto.ValidateSignatureValues(normalized[64], r, s, true) {
		return nil, false
	}
	return normalized, true
}
