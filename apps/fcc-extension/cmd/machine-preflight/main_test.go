package main

import (
	"bytes"
	"os"
	"path/filepath"
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

func TestReadPublicCRLIsOptionalAndBounded(t *testing.T) {
	value, err := readPublicCRL("")
	if err != nil || value != nil {
		t.Fatalf("empty optional CRL path rejected: %v", err)
	}
	directory := t.TempDir()
	path := filepath.Join(directory, "leaf.crl")
	expected := []byte("public-crl-fixture")
	if err := os.WriteFile(path, expected, 0o600); err != nil {
		t.Fatal(err)
	}
	value, err = readPublicCRL(path)
	if err != nil || !bytes.Equal(value, expected) {
		t.Fatalf("bounded public CRL read failed: %v", err)
	}
	if _, err := readPublicCRL(directory); err == nil {
		t.Fatal("directory was accepted as a public CRL")
	}
	oversized := filepath.Join(directory, "oversized.crl")
	file, err := os.Create(oversized)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(maxCRLBytes + 1); err != nil {
		file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := readPublicCRL(oversized); err == nil {
		t.Fatal("oversized public CRL was accepted")
	}
}
