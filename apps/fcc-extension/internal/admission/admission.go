package admission

import (
	"bytes"
	"crypto/sha256"
	"crypto/x509"
	_ "embed"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	csigning "github.com/flare-foundation/go-flare-common/pkg/signing"
	"github.com/flare-foundation/go-flare-common/pkg/tee/attestation/googlecloud"
	teeattestation "github.com/flare-foundation/tee-node/pkg/attestation"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
)

const (
	Coston2ChainID          = uint64(114)
	GoogleAudience          = "https://sts.google.com"
	productionDebugStatus   = "disabled-since-boot"
	testCodeHashHex         = "0x194844cf417dde867073e5ab7199fa4d21fd82b5dbe2bdea8b3d7fc18d10fdc2"
	testPlatformHex         = "0x544553545f504c4154464f524d00000000000000000000000000000000000000"
	rootCertificateDERHash  = "148b293821bb0c6a317f413c8ba475814091cb22d49b9e3c94198db8e8f86c39"
	defaultMaximumClockSkew = 2 * time.Minute
)

var supportedProductionPlatforms = map[string]struct{}{
	"GCP_AMD_SEV":    {},
	"GCP_AMD_SEV_ES": {},
	"GCP_INTEL_TDX":  {},
}

//go:embed google_confidential_space_root.crt
var googleConfidentialSpaceRootPEM []byte

type AttestationClaims struct {
	CodeHash common.Hash
	Platform common.Hash
}

type AttestationVerifier interface {
	Verify(token string, teeInfoHash common.Hash, expectedCodeHash common.Hash) (AttestationClaims, error)
}

type Config struct {
	ChainID          uint64
	ExtensionID      *big.Int
	InitialOwner     common.Address
	ExpectedCodeHash common.Hash
	Now              time.Time
	MaximumClockSkew time.Duration
}

type Result struct {
	TeeID          common.Address
	ProxyID        common.Address
	MachineID      common.Hash
	KeyFingerprint common.Hash
	CodeHash       common.Hash
	Platform       common.Hash
	GovernanceHash common.Hash
	TeeTimestamp   uint64
}

type GoogleAttestationVerifier struct {
	root *x509.Certificate
}

func NewGoogleAttestationVerifier() (*GoogleAttestationVerifier, error) {
	block, rest := pem.Decode(googleConfidentialSpaceRootPEM)
	if block == nil || block.Type != "CERTIFICATE" || len(bytes.TrimSpace(rest)) != 0 {
		return nil, errors.New("embedded Google Confidential Space root is malformed")
	}
	root, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse embedded Google Confidential Space root: %w", err)
	}
	digest := sha256.Sum256(root.Raw)
	if hex.EncodeToString(digest[:]) != rootCertificateDERHash {
		return nil, errors.New("embedded Google Confidential Space root fingerprint mismatch")
	}
	return &GoogleAttestationVerifier{root: root}, nil
}

func (v *GoogleAttestationVerifier) Verify(token string, teeInfoHash common.Hash, expectedCodeHash common.Hash) (AttestationClaims, error) {
	if v == nil || v.root == nil {
		return AttestationClaims{}, errors.New("Google attestation verifier is not initialized")
	}
	if token == "" || token == teeattestation.MagicPass {
		return AttestationClaims{}, errors.New("production attestation token is required")
	}
	if expectedCodeHash == (common.Hash{}) || expectedCodeHash == common.HexToHash(testCodeHashHex) {
		return AttestationClaims{}, errors.New("expected production image code hash is required")
	}
	policy := googlecloud.Policy{
		Audience:             GoogleAudience,
		RequireCRL:           true,
		AllowedImageIDs:      map[common.Hash]struct{}{expectedCodeHash: {}},
		AllowedHWModels:      supportedProductionPlatforms,
		EATNonce:             hex.EncodeToString(teeInfoHash[:]),
		RequireSecBoot:       true,
		AllowedDebugStatuses: []string{productionDebugStatus},
	}
	_, claims, err := googlecloud.ParseAndValidatePKIToken(token, v.root, nil, nil, policy)
	if err != nil {
		return AttestationClaims{}, fmt.Errorf("verify Google Confidential Space attestation: %w", err)
	}
	codeHash, err := claims.CodeHash()
	if err != nil {
		return AttestationClaims{}, fmt.Errorf("decode attested image code hash: %w", err)
	}
	platform, err := claims.Platform()
	if err != nil {
		return AttestationClaims{}, fmt.Errorf("decode attested platform: %w", err)
	}
	return AttestationClaims{CodeHash: codeHash, Platform: platform}, nil
}

func VerifyProductionMachine(response *teetypes.SignedTeeInfoResponse, config Config, verifier AttestationVerifier) (Result, error) {
	if response == nil || verifier == nil {
		return Result{}, errors.New("machine response and attestation verifier are required")
	}
	if config.ChainID != Coston2ChainID || response.TeeInfo.ChainID != config.ChainID {
		return Result{}, errors.New("machine chain ID is not Coston2")
	}
	if config.ExtensionID == nil || config.ExtensionID.Sign() <= 0 || config.ExtensionID.BitLen() > 256 {
		return Result{}, errors.New("expected extension ID is invalid")
	}
	if response.MachineData.ExtensionID != common.BigToHash(config.ExtensionID) {
		return Result{}, errors.New("machine extension ID mismatch")
	}
	if config.InitialOwner == (common.Address{}) || response.MachineData.InitialOwner != config.InitialOwner {
		return Result{}, errors.New("machine initial owner mismatch")
	}
	if config.ExpectedCodeHash == (common.Hash{}) || config.ExpectedCodeHash == common.HexToHash(testCodeHashHex) || response.MachineData.CodeHash != config.ExpectedCodeHash {
		return Result{}, errors.New("machine production code hash mismatch")
	}
	if response.MachineData.Platform == (common.Hash{}) || response.MachineData.Platform == common.HexToHash(testPlatformHex) {
		return Result{}, errors.New("machine platform is not production")
	}
	if response.MachineData.GovernanceHash == (common.Hash{}) {
		return Result{}, errors.New("machine governance hash is not configured")
	}
	if response.TeeInfo.Challenge == (common.Hash{}) {
		return Result{}, errors.New("TEE info challenge is missing")
	}
	if response.TeeInfo.PublicKey != response.MachineData.PublicKey {
		return Result{}, errors.New("TEE info and machine-data public keys differ")
	}
	publicKey, err := teetypes.ParsePubKey(response.MachineData.PublicKey)
	if err != nil {
		return Result{}, fmt.Errorf("parse machine public key: %w", err)
	}
	teeID := crypto.PubkeyToAddress(*publicKey)
	machineDataHash, err := response.MachineData.DataHash()
	if err != nil {
		return Result{}, fmt.Errorf("hash machine data: %w", err)
	}
	machinePayloadHash, err := csigning.NewPayload(csigning.TEEMachineRegister, config.ChainID, machineDataHash).Hash()
	if err != nil {
		return Result{}, fmt.Errorf("hash machine registration domain: %w", err)
	}
	if err := teeutils.VerifySignature(machinePayloadHash[:], response.DataSignature, teeID); err != nil {
		return Result{}, errors.New("machine-data signature mismatch")
	}
	teeInfoHashBytes, err := response.TeeInfo.Hash()
	if err != nil {
		return Result{}, fmt.Errorf("hash TEE info: %w", err)
	}
	teeInfoHash := common.BytesToHash(teeInfoHashBytes)
	proxyPayloadHash, err := csigning.NewPayload(csigning.ProxyTeeInfo, config.ChainID, teeInfoHash).Hash()
	if err != nil {
		return Result{}, fmt.Errorf("hash proxy TEE-info domain: %w", err)
	}
	proxyID, err := teeutils.SignatureToSignersAddress(proxyPayloadHash[:], response.ProxySignature)
	if err != nil || proxyID == (common.Address{}) {
		return Result{}, errors.New("proxy TEE-info signature is invalid")
	}
	if proxyID == teeID {
		return Result{}, errors.New("machine and proxy identities must be distinct")
	}
	claims, err := verifier.Verify(response.Attestation, teeInfoHash, config.ExpectedCodeHash)
	if err != nil {
		return Result{}, err
	}
	if claims.CodeHash != response.MachineData.CodeHash || claims.Platform != response.MachineData.Platform {
		return Result{}, errors.New("attestation claims do not match signed machine data")
	}
	now := config.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}
	skew := config.MaximumClockSkew
	if skew == 0 {
		skew = defaultMaximumClockSkew
	}
	if skew < 0 {
		return Result{}, errors.New("maximum clock skew is invalid")
	}
	teeTime := time.Unix(int64(response.TeeInfo.TeeTimestamp), 0)
	if teeTime.Before(now.Add(-skew)) || teeTime.After(now.Add(skew)) {
		return Result{}, errors.New("TEE info timestamp is outside the admission window")
	}
	publicBytes := teetypes.PubKeyToBytes(publicKey)
	return Result{
		TeeID:          teeID,
		ProxyID:        proxyID,
		MachineID:      common.BytesToHash(teeID.Bytes()),
		KeyFingerprint: crypto.Keccak256Hash(publicBytes),
		CodeHash:       claims.CodeHash,
		Platform:       claims.Platform,
		GovernanceHash: response.MachineData.GovernanceHash,
		TeeTimestamp:   response.TeeInfo.TeeTimestamp,
	}, nil
}
