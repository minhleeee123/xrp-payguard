package protocol

import "math"

type ScheduleWindowResultV1 struct {
	Slot     uint64
	Deadline uint64
}

// ScheduleWindowV1 computes an inclusive UTC slot window without overflowing
// the uint64 wire timestamp domain.
func ScheduleWindowV1(startAt, intervalSeconds, graceSeconds, occurrence uint64) (ScheduleWindowResultV1, bool) {
	if intervalSeconds == 0 || graceSeconds == 0 || graceSeconds >= intervalSeconds || occurrence == 0 || occurrence > math.MaxUint32 {
		return ScheduleWindowResultV1{}, false
	}
	index := occurrence - 1
	if index != 0 && intervalSeconds > (math.MaxUint64-startAt)/index {
		return ScheduleWindowResultV1{}, false
	}
	slot := startAt + index*intervalSeconds
	if graceSeconds > math.MaxUint64-slot {
		return ScheduleWindowResultV1{}, false
	}
	return ScheduleWindowResultV1{Slot: slot, Deadline: slot + graceSeconds}, true
}
