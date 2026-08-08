package admission

import (
	"errors"
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	csigning "github.com/flare-foundation/go-flare-common/pkg/signing"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
)

var (
	testOwner      = common.HexToAddress("0xDC1cc527423C882156a632C250528D1922d18Fc7")
	testExtension  = big.NewInt(66037)
	productionCode = common.HexToHash("0x65cc930c90ffeb8bc825998c347240239a66fa0a50928b077c49f1480932f511")
	productionAMD  = common.HexToHash("0x4743505f414d445f534556000000000000000000000000000000000000000000")
)

type fixedVerifier struct {
	claims AttestationClaims
	err    error
}

func (v fixedVerifier) Verify(token string, teeInfoHash common.Hash, expected common.Hash) (AttestationClaims, error) {
	if v.err != nil {
		return AttestationClaims{}, v.err
	}
	if token != "signed-pki-token" || teeInfoHash == (common.Hash{}) || expected != productionCode {
		return AttestationClaims{}, errors.New("attestation verifier input mismatch")
	}
	return v.claims, nil
}

func signedFixture(t *testing.T, now time.Time) *teetypes.SignedTeeInfoResponse {
	t.Helper()
	teeKey, err := crypto.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	proxyKey, err := crypto.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	publicKey := teetypes.PubKeyToStruct(&teeKey.PublicKey)
	response := &teetypes.SignedTeeInfoResponse{TeeInfoResponse: teetypes.TeeInfoResponse{
		TeeInfo: teetypes.TeeInfo{
			Challenge:    common.HexToHash("0x01"),
			PublicKey:    publicKey,
			ChainID:      Coston2ChainID,
			TeeTimestamp: uint64(now.Unix()),
		},
		MachineData: teetypes.MachineData{
			ExtensionID:    common.BigToHash(testExtension),
			InitialOwner:   testOwner,
			CodeHash:       productionCode,
			Platform:       productionAMD,
			PublicKey:      publicKey,
			GovernanceHash: common.HexToHash("0x1234"),
		},
		Attestation: "signed-pki-token",
	}}
	machineDataHash, err := response.MachineData.DataHash()
	if err != nil {
		t.Fatal(err)
	}
	machinePayloadHash, err := csigning.NewPayload(csigning.TEEMachineRegister, Coston2ChainID, machineDataHash).Hash()
	if err != nil {
		t.Fatal(err)
	}
	response.DataSignature, err = teeutils.Sign(machinePayloadHash[:], teeKey)
	if err != nil {
		t.Fatal(err)
	}
	teeInfoBytes, err := response.TeeInfo.Hash()
	if err != nil {
		t.Fatal(err)
	}
	proxyPayloadHash, err := csigning.NewPayload(csigning.ProxyTeeInfo, Coston2ChainID, common.BytesToHash(teeInfoBytes)).Hash()
	if err != nil {
		t.Fatal(err)
	}
	response.ProxySignature, err = teeutils.Sign(proxyPayloadHash[:], proxyKey)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func testConfig(now time.Time) Config {
	return Config{
		ChainID:          Coston2ChainID,
		ExtensionID:      new(big.Int).Set(testExtension),
		InitialOwner:     testOwner,
		ExpectedCodeHash: productionCode,
		Now:              now,
		MaximumClockSkew: time.Minute,
	}
}

func TestVerifyProductionMachineBindsEveryAdmissionDomain(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	response := signedFixture(t, now)
	result, err := VerifyProductionMachine(response, testConfig(now), fixedVerifier{claims: AttestationClaims{
		CodeHash: productionCode,
		Platform: productionAMD,
	}})
	if err != nil {
		t.Fatal(err)
	}
	if result.TeeID == (common.Address{}) || result.ProxyID == (common.Address{}) || result.TeeID == result.ProxyID {
		t.Fatal("machine and proxy identities were not independently recovered")
	}
	if result.MachineID != common.BytesToHash(result.TeeID.Bytes()) || result.CodeHash != productionCode || result.Platform != productionAMD {
		t.Fatal("verified descriptor lost a signed admission binding")
	}
}

func TestVerifyProductionMachineFailsClosedOnBindingDrift(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	tests := map[string]func(*teetypes.SignedTeeInfoResponse, *Config){
		"chain": func(response *teetypes.SignedTeeInfoResponse, _ *Config) { response.TeeInfo.ChainID = 1 },
		"extension": func(response *teetypes.SignedTeeInfoResponse, _ *Config) {
			response.MachineData.ExtensionID = common.HexToHash("0x01")
		},
		"owner": func(response *teetypes.SignedTeeInfoResponse, _ *Config) {
			response.MachineData.InitialOwner = common.HexToAddress("0x0000000000000000000000000000000000000001")
		},
		"code": func(response *teetypes.SignedTeeInfoResponse, _ *Config) {
			response.MachineData.CodeHash = common.HexToHash("0x02")
		},
		"platform": func(response *teetypes.SignedTeeInfoResponse, _ *Config) {
			response.MachineData.Platform = common.HexToHash(testPlatformHex)
		},
		"governance": func(response *teetypes.SignedTeeInfoResponse, _ *Config) {
			response.MachineData.GovernanceHash = common.Hash{}
		},
		"challenge": func(response *teetypes.SignedTeeInfoResponse, _ *Config) {
			response.TeeInfo.Challenge = common.Hash{}
		},
		"public key": func(response *teetypes.SignedTeeInfoResponse, _ *Config) {
			response.TeeInfo.PublicKey.X = common.HexToHash("0x03")
		},
		"machine signature": func(response *teetypes.SignedTeeInfoResponse, _ *Config) { response.DataSignature[0] ^= 1 },
		"proxy signature": func(response *teetypes.SignedTeeInfoResponse, _ *Config) {
			response.ProxySignature = response.ProxySignature[:64]
		},
		"stale timestamp": func(response *teetypes.SignedTeeInfoResponse, _ *Config) {
			response.TeeInfo.TeeTimestamp = uint64(now.Add(-2 * time.Minute).Unix())
		},
		"wrong expected chain": func(_ *teetypes.SignedTeeInfoResponse, config *Config) { config.ChainID = 1 },
		"test image": func(response *teetypes.SignedTeeInfoResponse, config *Config) {
			response.MachineData.CodeHash = common.HexToHash(testCodeHashHex)
			config.ExpectedCodeHash = common.HexToHash(testCodeHashHex)
		},
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			response := signedFixture(t, now)
			config := testConfig(now)
			mutate(response, &config)
			_, err := VerifyProductionMachine(response, config, fixedVerifier{claims: AttestationClaims{CodeHash: productionCode, Platform: productionAMD}})
			if err == nil {
				t.Fatal("drifted machine response passed admission")
			}
		})
	}
}

func TestVerifyProductionMachineRejectsAttestationMismatch(t *testing.T) {
	now := time.Unix(1_800_000_000, 0).UTC()
	response := signedFixture(t, now)
	_, err := VerifyProductionMachine(response, testConfig(now), fixedVerifier{claims: AttestationClaims{
		CodeHash: productionCode,
		Platform: common.HexToHash("0x4743505f494e54454c5f54445800000000000000000000000000000000000000"),
	}})
	if err == nil || !strings.Contains(err.Error(), "claims do not match") {
		t.Fatalf("attestation mismatch was not rejected: %v", err)
	}
	_, err = VerifyProductionMachine(response, testConfig(now), fixedVerifier{err: errors.New("PKI validation failed")})
	if err == nil || !strings.Contains(err.Error(), "PKI validation failed") {
		t.Fatalf("attestation verifier failure was not propagated: %v", err)
	}
}

func TestPinnedGoogleVerifierRejectsSimulationAndUntrustedTokens(t *testing.T) {
	verifier, err := NewGoogleAttestationVerifier()
	if err != nil {
		t.Fatal(err)
	}
	for _, token := range []string{"", teeattestationMagicPassForTest, "not-a-jwt"} {
		if _, err := verifier.Verify(token, common.HexToHash("0x01"), productionCode); err == nil {
			t.Fatalf("untrusted attestation token %q was accepted", token)
		}
	}
}

const teeattestationMagicPassForTest = "magic_pass"
