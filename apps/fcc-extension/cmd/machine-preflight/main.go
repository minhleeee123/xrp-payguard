package main

import (
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"math/big"
	"os"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/admission"
)

const (
	defaultExtensionID = "66037"
	defaultOwner       = "0xDC1cc527423C882156a632C250528D1922d18Fc7"
)

type output struct {
	Status            string `json:"status"`
	ChainID           uint64 `json:"chainId"`
	ExtensionID       string `json:"extensionId"`
	TeeID             string `json:"teeId"`
	ProxyID           string `json:"proxyId"`
	MachineID         string `json:"machineId"`
	KeyFingerprint    string `json:"keyFingerprint"`
	CodeHash          string `json:"codeHash"`
	Platform          string `json:"platform"`
	GovernanceHash    string `json:"governanceHash"`
	AttestationPKI    bool   `json:"attestationPkiVerified"`
	MachineSignature  bool   `json:"machineSignatureVerified"`
	ProxySignature    bool   `json:"proxySignatureVerified"`
	ProductionOnly    bool   `json:"productionPlatformVerified"`
	NoSensitiveOutput bool   `json:"noRawAttestationOrSignatureOutput"`
}

func main() {
	machineURL := flag.String("url", "", "credential-free HTTPS origin of the production extension proxy")
	imageID := flag.String("image-id", "", "expected production image ID as sha256:<64 hex> or 0x<64 hex>")
	extensionIDValue := flag.String("extension-id", defaultExtensionID, "expected registered extension ID")
	ownerValue := flag.String("initial-owner", defaultOwner, "expected initial owner address")
	timeout := flag.Duration("timeout", 10*time.Second, "HTTP timeout, at most 30s")
	flag.Parse()

	origin, err := admission.NormalizeProductionOrigin(*machineURL)
	check(err)
	codeHash, err := parseHash(*imageID)
	check(err)
	extensionID, ok := new(big.Int).SetString(*extensionIDValue, 10)
	if !ok || extensionID.Sign() <= 0 || extensionID.BitLen() > 256 {
		check(fmt.Errorf("extension ID must be an unsigned decimal integer"))
	}
	if !common.IsHexAddress(*ownerValue) {
		check(fmt.Errorf("initial owner must be a checksummed EVM address"))
	}
	owner := common.HexToAddress(*ownerValue)
	if owner.Hex() != *ownerValue {
		check(fmt.Errorf("initial owner must use the exact EIP-55 checksum"))
	}
	client, err := admission.NewProductionHTTPClient(*timeout)
	check(err)
	info, err := admission.FetchInfo(origin, client)
	check(err)
	verifier, err := admission.NewGoogleAttestationVerifier()
	check(err)
	result, err := admission.VerifyProductionMachine(info, admission.Config{
		ChainID:          admission.Coston2ChainID,
		ExtensionID:      extensionID,
		InitialOwner:     owner,
		ExpectedCodeHash: codeHash,
	}, verifier)
	check(err)

	encoded, err := json.Marshal(output{
		Status:            "verified",
		ChainID:           admission.Coston2ChainID,
		ExtensionID:       extensionID.String(),
		TeeID:             result.TeeID.Hex(),
		ProxyID:           result.ProxyID.Hex(),
		MachineID:         result.MachineID.Hex(),
		KeyFingerprint:    result.KeyFingerprint.Hex(),
		CodeHash:          result.CodeHash.Hex(),
		Platform:          result.Platform.Hex(),
		GovernanceHash:    result.GovernanceHash.Hex(),
		AttestationPKI:    true,
		MachineSignature:  true,
		ProxySignature:    true,
		ProductionOnly:    true,
		NoSensitiveOutput: true,
	})
	check(err)
	fmt.Println(string(encoded))
}

func parseHash(value string) (common.Hash, error) {
	trimmed := strings.TrimPrefix(value, "sha256:")
	trimmed = strings.TrimPrefix(trimmed, "0x")
	if len(trimmed) != 64 {
		return common.Hash{}, fmt.Errorf("image ID must contain exactly 32 bytes")
	}
	decoded, err := hex.DecodeString(trimmed)
	if err != nil {
		return common.Hash{}, fmt.Errorf("image ID must be hexadecimal")
	}
	return common.BytesToHash(decoded), nil
}

func check(err error) {
	if err == nil {
		return
	}
	fmt.Fprintf(os.Stderr, "machine preflight failed: %v\n", err)
	os.Exit(1)
}
