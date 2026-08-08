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
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
)

const maxSignPortResponseBytes = 4096

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

func newTeeSignPortSigner(endpoint string, signer common.Address, client *http.Client) (*TeeSignPortSigner, error) {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "http" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("TEE sign endpoint must be a credential-free loopback HTTP origin")
	}
	if parsed.Hostname() != "127.0.0.1" && parsed.Hostname() != "localhost" && parsed.Hostname() != "::1" {
		return nil, errors.New("TEE sign endpoint must use loopback")
	}
	if signer == (common.Address{}) || client == nil {
		return nil, errors.New("TEE signer identity and HTTP client are required")
	}
	parsed.Path = "/sign"
	return &TeeSignPortSigner{endpoint: parsed.String(), address: signer, client: client}, nil
}

func (s *TeeSignPortSigner) Address() common.Address { return s.address }

func (s *TeeSignPortSigner) Sign(message []byte) ([]byte, error) {
	if len(message) == 0 {
		return nil, errors.New("attestation message is required")
	}
	body, err := json.Marshal(teetypes.SignRequest{Message: message})
	if err != nil {
		return nil, fmt.Errorf("encode TEE sign request: %w", err)
	}
	request, err := http.NewRequest(http.MethodPost, s.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build TEE sign request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := s.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("TEE sign request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxSignPortResponseBytes))
		return nil, fmt.Errorf("TEE sign request returned status %d", response.StatusCode)
	}
	var signed teetypes.SignResponse
	decoder := json.NewDecoder(io.LimitReader(response.Body, maxSignPortResponseBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&signed); err != nil {
		return nil, fmt.Errorf("decode TEE sign response: %w", err)
	}
	if !bytes.Equal(signed.Message, message) {
		return nil, errors.New("TEE sign response message mismatch")
	}
	digest := crypto.Keccak256Hash(message)
	if !VerifySignature(digest, signed.Signature, s.address) {
		return nil, errors.New("TEE sign response signature mismatch")
	}
	return append([]byte(nil), signed.Signature...), nil
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
