package ingress

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/crypto"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
)

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
