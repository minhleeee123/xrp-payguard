package protocol

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"
)

func TestComposePolicyDecisionV1SharedVectors(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime caller unavailable")
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(file), "../../../../packages/protocol/fixtures/composition-v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Schema    string `json:"schema"`
		CaseCount int    `json:"caseCount"`
		Cases     []struct {
			Name       string `json:"name"`
			Violations string `json:"violations"`
			Decision   uint8  `json:"decision"`
			Reason     uint8  `json:"reason"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.Schema != "POLICY_COMPOSITION_V1" || fixture.CaseCount != len(fixture.Cases) {
		t.Fatal("unexpected policy composition fixture domain")
	}
	for _, vector := range fixture.Cases {
		t.Run(vector.Name, func(t *testing.T) {
			violations, err := strconv.ParseUint(vector.Violations, 10, 64)
			if err != nil {
				t.Fatal(err)
			}
			decision, reason := ComposePolicyDecisionV1(violations)
			if decision != vector.Decision || reason != vector.Reason {
				t.Fatalf("got decision=%d reason=%d", decision, reason)
			}
		})
	}
}
