package protocol

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"
)

func TestScheduleWindowSharedVectors(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime caller unavailable")
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(file), "../../../../packages/protocol/fixtures/schedule-v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Schema    string `json:"schema"`
		Boundary  string `json:"boundary"`
		CaseCount int    `json:"caseCount"`
		Cases     []struct {
			Name       string `json:"name"`
			StartAt    string `json:"startAt"`
			Interval   string `json:"interval"`
			Grace      string `json:"grace"`
			Occurrence string `json:"occurrence"`
			Slot       string `json:"slot"`
			Deadline   string `json:"deadline"`
			Valid      bool   `json:"valid"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.Schema != "SCHEDULE_WINDOW_V1" || fixture.Boundary != "INCLUSIVE" || fixture.CaseCount != len(fixture.Cases) {
		t.Fatal("unexpected schedule fixture domain")
	}
	for _, vector := range fixture.Cases {
		t.Run(vector.Name, func(t *testing.T) {
			startAt := scheduleUint(t, vector.StartAt)
			interval := scheduleUint(t, vector.Interval)
			grace := scheduleUint(t, vector.Grace)
			occurrence := scheduleUint(t, vector.Occurrence)
			actual, valid := ScheduleWindowV1(startAt, interval, grace, occurrence)
			if valid != vector.Valid {
				t.Fatalf("validity mismatch: %v", valid)
			}
			if valid && (actual.Slot != scheduleUint(t, vector.Slot) || actual.Deadline != scheduleUint(t, vector.Deadline)) {
				t.Fatalf("window mismatch: %+v", actual)
			}
		})
	}
}

func scheduleUint(t *testing.T, value string) uint64 {
	t.Helper()
	result, err := strconv.ParseUint(value, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	return result
}
