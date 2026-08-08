package main

import (
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func TestParseImageHash(t *testing.T) {
	expected := common.HexToHash("0x65cc930c90ffeb8bc825998c347240239a66fa0a50928b077c49f1480932f511")
	for _, value := range []string{
		expected.Hex(),
		"sha256:" + strings.TrimPrefix(expected.Hex(), "0x"),
		strings.TrimPrefix(expected.Hex(), "0x"),
	} {
		actual, err := parseHash(value)
		if err != nil || actual != expected {
			t.Fatalf("valid image hash %q rejected: %s %v", value, actual.Hex(), err)
		}
	}
	for _, value := range []string{"", "0x01", strings.Repeat("z", 64), strings.Repeat("0", 63)} {
		if _, err := parseHash(value); err == nil {
			t.Fatalf("invalid image hash %q accepted", value)
		}
	}
}
