package ingress

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/crypto/ecies"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/protocol"
)

func TestTypeScriptECIESVectorDecryptsWithTeeNodePrimitive(t *testing.T) {
	recipientKey, err := crypto.HexToECDSA(strings.Repeat("44", 32))
	if err != nil {
		t.Fatal(err)
	}
	ciphertext := common.FromHex("0x044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c122222222222222222222222222222222d168106798015fbeef771d89595c0440971d3d299f0e4c0ed341750161c273a472fb78ba1cd6f13d3503223f704bc95735a705f095cd0662")
	plaintext, err := ecies.ImportECDSA(recipientKey).Decrypt(ciphertext, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if string(plaintext) != "PAYGUARD_ECIES_VECTOR_V1" {
		t.Fatalf("cross-language ECIES plaintext mismatch: %q", plaintext)
	}
}

func TestTeeSignPortSignerUsesBase64WireAndVerifiesIdentity(t *testing.T) {
	key, err := crypto.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	message := []byte("payguard-attestation-message")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost || request.URL.Path != "/sign" {
			http.Error(w, "unexpected route", http.StatusNotFound)
			return
		}
		var payload teetypes.SignRequest
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			http.Error(w, "malformed", http.StatusBadRequest)
			return
		}
		if !bytes.Equal(payload.Message, message) {
			http.Error(w, "message mismatch", http.StatusBadRequest)
			return
		}
		signature, signErr := crypto.Sign(accounts.TextHash(crypto.Keccak256(payload.Message)), key)
		if signErr != nil {
			http.Error(w, "signing failed", http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(teetypes.SignResponse{Message: payload.Message, Signature: signature})
	}))
	defer server.Close()

	signerAddress := crypto.PubkeyToAddress(key.PublicKey)
	signer, err := newTeeSignPortSigner(server.URL, signerAddress, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	signature, err := signer.Sign(message)
	if err != nil {
		t.Fatal(err)
	}
	digest := crypto.Keccak256Hash(message)
	if !VerifySignature(digest, signature, signerAddress) {
		t.Fatal("TEE sign-port signature did not verify")
	}
	encoded, _ := json.Marshal(teetypes.SignRequest{Message: message})
	if !bytes.Contains(encoded, []byte(base64.StdEncoding.EncodeToString(message))) {
		t.Fatal("TEE sign-port request must use Go []byte base64 JSON encoding")
	}
}

func TestTeeSignPortSignerFailsClosedOnEndpointAndResponseDrift(t *testing.T) {
	key, err := crypto.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	address := crypto.PubkeyToAddress(key.PublicKey)
	if _, err := newTeeSignPortSigner("https://example.com", address, http.DefaultClient); err == nil {
		t.Fatal("non-loopback sign endpoint was accepted")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(teetypes.SignResponse{Message: []byte("substituted"), Signature: make([]byte, 65)})
	}))
	defer server.Close()
	signer, err := newTeeSignPortSigner(server.URL, address, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := signer.Sign([]byte("expected")); err == nil {
		t.Fatal("substituted sign response was accepted")
	}
}

func TestVerifySignatureRejectsHighSAndWrongSigner(t *testing.T) {
	key, err := crypto.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	digest := crypto.Keccak256Hash([]byte("attestation"))
	signature, err := crypto.Sign(accounts.TextHash(digest.Bytes()), key)
	if err != nil {
		t.Fatal(err)
	}
	curveOrder, _ := new(big.Int).SetString("fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141", 16)
	lowS := new(big.Int).SetBytes(signature[32:64])
	highS := new(big.Int).Sub(curveOrder, lowS).FillBytes(make([]byte, 32))
	copy(signature[32:64], highS)
	signature[64] ^= 1
	if VerifySignature(digest, signature, crypto.PubkeyToAddress(key.PublicKey)) {
		t.Fatal("high-S attestation signature was accepted")
	}
	other, _ := crypto.GenerateKey()
	canonical, _ := crypto.Sign(accounts.TextHash(digest.Bytes()), key)
	if VerifySignature(digest, canonical, crypto.PubkeyToAddress(other.PublicKey)) {
		t.Fatal("wrong signer was accepted")
	}
}

func TestDiscoverTeeMachineDecryptsCanonicalPolicyAndSignsReceipt(t *testing.T) {
	key, err := crypto.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/sign":
			var payload teetypes.SignRequest
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil || len(payload.Message) == 0 {
				http.Error(w, "malformed", http.StatusBadRequest)
				return
			}
			signature, signErr := crypto.Sign(accounts.TextHash(crypto.Keccak256(payload.Message)), key)
			if signErr != nil {
				http.Error(w, "signing failed", http.StatusInternalServerError)
				return
			}
			_ = json.NewEncoder(w).Encode(teetypes.SignResponse{Message: payload.Message, Signature: signature})
		case "/decrypt":
			var payload teetypes.DecryptRequest
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil || len(payload.EncryptedMessage) == 0 {
				http.Error(w, "malformed", http.StatusBadRequest)
				return
			}
			plaintext, decryptErr := teeutils.Decrypt(payload.EncryptedMessage, key)
			if decryptErr != nil {
				http.Error(w, "can not decrypt", http.StatusBadRequest)
				return
			}
			_ = json.NewEncoder(w).Encode(teetypes.DecryptResponse{DecryptedMessage: plaintext})
		default:
			http.NotFound(w, request)
		}
	}))
	defer server.Close()

	parsed, _ := url.Parse(server.URL)
	_, portText, _ := net.SplitHostPort(parsed.Host)
	port, _ := strconv.Atoi(portText)
	machine, identity, err := NewTeeMachine(port)
	if err != nil {
		t.Fatal(err)
	}
	expectedSigner := crypto.PubkeyToAddress(key.PublicKey)
	expectedFingerprint := crypto.Keccak256Hash(crypto.FromECDSAPub(&key.PublicKey)[1:])
	if identity.Signer != expectedSigner || identity.MachineID != common.BytesToHash(expectedSigner.Bytes()) || identity.KeyFingerprint != expectedFingerprint {
		t.Fatalf("discovered TEE identity mismatch: %+v", identity)
	}

	policy := testEncryptedPolicy()
	commitment, err := protocol.PolicyCommitment(policy)
	if err != nil {
		t.Fatal(err)
	}
	plaintext, err := json.Marshal(policy)
	if err != nil {
		t.Fatal(err)
	}
	ciphertext, err := teeutils.Encrypt(plaintext, &key.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	binding := protocol.PolicyBindingV1{
		ChainID: policy.ChainID, Registry: policy.Registry, Vault: policy.Vault, Router: policy.Router,
		Owner: policy.Owner, PolicyID: policy.PolicyID, PolicyVersion: policy.PolicyVersion,
		PolicyCommitment: commitment, Schema: protocol.PolicySchemaV1,
		ExtensionID:      crypto.Keccak256Hash([]byte("payguard-extension")),
		CodeVersion:      crypto.Keccak256Hash([]byte("payguard-code")),
		MachineIDs:       [3]common.Hash{identity.MachineID, crypto.Keccak256Hash([]byte("machine-b")), crypto.Keccak256Hash([]byte("machine-c"))},
		KeyFingerprints:  [3]common.Hash{identity.KeyFingerprint, crypto.Keccak256Hash([]byte("key-b")), crypto.Keccak256Hash([]byte("key-c"))},
		CustodyThreshold: 3, ResultThreshold: 2, PolicyNonce: 1,
	}
	receipt, err := machine.submit(binding, policy.SubmissionNonce, 1_000, 2_000, ciphertext)
	if err != nil {
		t.Fatal(err)
	}
	attestationDigest, err := protocol.PolicyReceiptAttestationDigest(receipt.Receipt)
	if err != nil || !VerifySignature(attestationDigest, receipt.Signature, expectedSigner) {
		t.Fatal("TEE receipt signature failed attestation verification")
	}
	wrongKey, _ := crypto.GenerateKey()
	wrongCiphertext, _ := teeutils.Encrypt(plaintext, &wrongKey.PublicKey)
	if _, err := machine.submit(binding, policy.SubmissionNonce, 1_000, 2_000, wrongCiphertext); err == nil {
		t.Fatal("ciphertext for a different TEE key was accepted")
	}
}

func testEncryptedPolicy() protocol.PolicyV1 {
	return protocol.PolicyV1{
		SchemaVersion: 1, ChainID: big.NewInt(114), Registry: common.HexToAddress("0x1000000000000000000000000000000000000001"),
		Vault: common.HexToAddress("0x2000000000000000000000000000000000000002"), Router: common.HexToAddress("0x3000000000000000000000000000000000000003"),
		Owner: common.HexToAddress("0x4000000000000000000000000000000000000004"), PolicyID: crypto.Keccak256Hash([]byte("policy")),
		PolicyVersion: 1, Asset: common.HexToAddress("0x5000000000000000000000000000000000000005"), ReferenceCurrency: crypto.Keccak256Hash([]byte("USD")),
		MaxPerAction: big.NewInt(100), DailyCap: big.NewInt(500), RollingCap: big.NewInt(250), RollingWindowSecs: 3600,
		StartAt: 100, EndAt: 10_000, ScheduleIntervalSecs: 0, ScheduleGraceSecs: 0, CooldownSecs: 0, MaxOccurrences: 5,
		AllowTargets: []common.Address{}, DenyTargets: []common.Address{}, AllowRequesters: []common.Address{},
		AllowActionTypes: []common.Hash{protocol.ActionFTestXRPTransfer}, RequireFTSO: false, FTSOFeedID: common.Hash{}, MaxPriceAgeSecs: 0,
		PrivateSalt: crypto.Keccak256Hash([]byte("private-salt")), SubmissionNonce: crypto.Keccak256Hash([]byte("submission")),
	}
}
