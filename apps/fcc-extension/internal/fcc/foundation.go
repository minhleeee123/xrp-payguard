package fcc

import (
	"bytes"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/flare-foundation/go-flare-common/pkg/tee/structs"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
)

type FoundationRequest struct {
	SchemaVersion uint16         `json:"schemaVersion" abi:"schemaVersion"`
	ChainID       *big.Int       `json:"chainId" abi:"chainId"`
	Sender        common.Address `json:"sender" abi:"sender"`
	ExtensionID   *big.Int       `json:"extensionId" abi:"extensionId"`
	CodeVersion   common.Hash    `json:"codeVersion" abi:"codeVersion"`
	RequestNonce  common.Hash    `json:"requestNonce" abi:"requestNonce"`
	PayloadHash   common.Hash    `json:"payloadHash" abi:"payloadHash"`
}

type FoundationResponse struct {
	SchemaVersion uint16         `json:"schemaVersion" abi:"schemaVersion"`
	ChainID       *big.Int       `json:"chainId" abi:"chainId"`
	Sender        common.Address `json:"sender" abi:"sender"`
	ExtensionID   *big.Int       `json:"extensionId" abi:"extensionId"`
	CodeVersion   common.Hash    `json:"codeVersion" abi:"codeVersion"`
	RequestNonce  common.Hash    `json:"requestNonce" abi:"requestNonce"`
	PayloadHash   common.Hash    `json:"payloadHash" abi:"payloadHash"`
	BindingHash   common.Hash    `json:"bindingHash" abi:"bindingHash"`
}

var (
	foundationRequestArg  abi.Argument
	foundationResponseArg abi.Argument
	foundationBindingArgs abi.Arguments
	foundationCodeVersion = crypto.Keccak256Hash([]byte(Version))
)

func init() {
	foundationRequestArg = abi.Argument{Type: mustFoundationTuple([]abi.ArgumentMarshaling{
		{Name: "schemaVersion", Type: "uint16"},
		{Name: "chainId", Type: "uint256"},
		{Name: "sender", Type: "address"},
		{Name: "extensionId", Type: "uint256"},
		{Name: "codeVersion", Type: "bytes32"},
		{Name: "requestNonce", Type: "bytes32"},
		{Name: "payloadHash", Type: "bytes32"},
	})}
	foundationResponseArg = abi.Argument{Type: mustFoundationTuple([]abi.ArgumentMarshaling{
		{Name: "schemaVersion", Type: "uint16"},
		{Name: "chainId", Type: "uint256"},
		{Name: "sender", Type: "address"},
		{Name: "extensionId", Type: "uint256"},
		{Name: "codeVersion", Type: "bytes32"},
		{Name: "requestNonce", Type: "bytes32"},
		{Name: "payloadHash", Type: "bytes32"},
		{Name: "bindingHash", Type: "bytes32"},
	})}
	foundationBindingArgs = abi.Arguments{
		{Type: mustFoundationType("bytes32")},
		{Type: mustFoundationType("bytes32")},
		{Type: mustFoundationType("bytes32")},
		{Type: mustFoundationType("uint16")},
		{Type: mustFoundationType("uint256")},
		{Type: mustFoundationType("address")},
		{Type: mustFoundationType("uint256")},
		{Type: mustFoundationType("bytes32")},
		{Type: mustFoundationType("bytes32")},
		{Type: mustFoundationType("bytes32")},
	}
}

func decodeFoundationRequest(data []byte, destination *FoundationRequest) error {
	if destination == nil {
		return fmt.Errorf("foundation request destination is nil")
	}
	if err := structs.DecodeTo(foundationRequestArg, data, destination); err != nil {
		return fmt.Errorf("decode foundation request: %w", err)
	}
	canonical, err := abi.Arguments{foundationRequestArg}.Pack(*destination)
	if err != nil {
		return fmt.Errorf("re-encode foundation request: %w", err)
	}
	if !bytes.Equal(canonical, data) {
		return fmt.Errorf("foundation request is not canonical")
	}
	return nil
}

func encodeFoundationResponse(response FoundationResponse) ([]byte, error) {
	data, err := abi.Arguments{foundationResponseArg}.Pack(response)
	if err != nil {
		return nil, fmt.Errorf("encode foundation response: %w", err)
	}
	return data, nil
}

func foundationBindingHash(request FoundationRequest) (common.Hash, error) {
	encoded, err := foundationBindingArgs.Pack(
		crypto.Keccak256Hash([]byte(FoundationDomain)),
		teeutils.ToHash(OPTypePayGuard),
		teeutils.ToHash(OPCommandPing),
		request.SchemaVersion,
		request.ChainID,
		request.Sender,
		request.ExtensionID,
		request.CodeVersion,
		request.RequestNonce,
		request.PayloadHash,
	)
	if err != nil {
		return common.Hash{}, fmt.Errorf("encode foundation binding: %w", err)
	}
	return crypto.Keccak256Hash(encoded), nil
}

func mustFoundationTuple(components []abi.ArgumentMarshaling) abi.Type {
	value, err := abi.NewType("tuple", "", components)
	if err != nil {
		panic(err)
	}
	return value
}

func mustFoundationType(name string) abi.Type {
	value, err := abi.NewType(name, "", nil)
	if err != nil {
		panic(err)
	}
	return value
}
