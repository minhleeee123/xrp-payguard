package protocol

import (
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"
)

func TestSpendWindowTotalsV1CapsPrivateHistory(t *testing.T) {
	entries := make([]SpendWindowEntryV1, MaxSpendWindowEntriesV1+1)
	for index := range entries {
		entries[index] = SpendWindowEntryV1{Value: big.NewInt(1)}
	}
	if _, valid := SpendWindowTotalsV1(entries, 0, 1); valid {
		t.Fatal("oversized history accepted")
	}
	if _, valid := SpendWindowTotalsV1([]SpendWindowEntryV1{{Value: big.NewInt(-1)}}, 0, 1); valid {
		t.Fatal("negative value accepted")
	}
}

func TestSpendWindowTotalsV1SharedVectors(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime caller unavailable")
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(file), "../../../../packages/protocol/fixtures/spend-window-v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Schema           string `json:"schema"`
		CalendarBoundary string `json:"calendarBoundary"`
		RollingBoundary  string `json:"rollingBoundary"`
		CaseCount        int    `json:"caseCount"`
		Cases            []struct {
			Name       string `json:"name"`
			Now        string `json:"now"`
			Window     string `json:"window"`
			EntryCount int    `json:"entryCount"`
			Entries    []struct {
				Value      string `json:"value"`
				ExecutedAt string `json:"executedAt"`
			} `json:"entries"`
			Daily   string `json:"daily"`
			Rolling string `json:"rolling"`
			Valid   bool   `json:"valid"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.Schema != "SPEND_WINDOW_V1" || fixture.CalendarBoundary != "[dayStart, now]" || fixture.RollingBoundary != "(now-window, now]" || fixture.CaseCount != len(fixture.Cases) {
		t.Fatal("unexpected spend window fixture domain")
	}
	for _, vector := range fixture.Cases {
		t.Run(vector.Name, func(t *testing.T) {
			if vector.EntryCount != len(vector.Entries) {
				t.Fatal("entry count mismatch")
			}
			entries := make([]SpendWindowEntryV1, len(vector.Entries))
			for index, entry := range vector.Entries {
				entries[index] = SpendWindowEntryV1{Value: mathBig(entry.Value), ExecutedAt: spendWindowUint(t, entry.ExecutedAt)}
			}
			actual, valid := SpendWindowTotalsV1(entries, spendWindowUint(t, vector.Now), spendWindowUint(t, vector.Window))
			if valid != vector.Valid {
				t.Fatalf("validity mismatch: %v", valid)
			}
			if valid && (actual.DailySpend.Cmp(mathBig(vector.Daily)) != 0 || actual.RollingSpend.Cmp(mathBig(vector.Rolling)) != 0) {
				t.Fatalf("totals mismatch: %+v", actual)
			}
		})
	}
}

func spendWindowUint(t *testing.T, value string) uint64 {
	t.Helper()
	result, err := strconv.ParseUint(value, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	return result
}
