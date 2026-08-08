package protocol

import "math/big"

const MaxSpendWindowEntriesV1 = 4096

// SpendWindowEntryV1 is one ordered, reference-valued execution.
type SpendWindowEntryV1 struct {
	Value      *big.Int
	ExecutedAt uint64
}

// SpendWindowTotalsResultV1 contains the two deterministic cap aggregates.
type SpendWindowTotalsResultV1 struct {
	DailySpend   *big.Int
	RollingSpend *big.Int
}

// SpendWindowTotalsV1 sums UTC calendar-day and exact sliding-window history.
func SpendWindowTotalsV1(entries []SpendWindowEntryV1, now, rollingWindowSeconds uint64) (SpendWindowTotalsResultV1, bool) {
	if rollingWindowSeconds == 0 || len(entries) > MaxSpendWindowEntriesV1 {
		return SpendWindowTotalsResultV1{}, false
	}
	dayStart := now / 86400 * 86400
	hasLowerBound := now >= rollingWindowSeconds
	rollingLowerBound := uint64(0)
	if hasLowerBound {
		rollingLowerBound = now - rollingWindowSeconds
	}
	dailySpend, rollingSpend := new(big.Int), new(big.Int)
	var priorTimestamp uint64
	for index, entry := range entries {
		if entry.Value == nil || entry.Value.Sign() <= 0 || entry.Value.Cmp(maxUint256) > 0 || entry.ExecutedAt > now || (index > 0 && entry.ExecutedAt < priorTimestamp) {
			return SpendWindowTotalsResultV1{}, false
		}
		priorTimestamp = entry.ExecutedAt
		if entry.ExecutedAt >= dayStart {
			if entry.Value.Cmp(new(big.Int).Sub(new(big.Int).Set(maxUint256), dailySpend)) > 0 {
				return SpendWindowTotalsResultV1{}, false
			}
			dailySpend.Add(dailySpend, entry.Value)
		}
		if !hasLowerBound || entry.ExecutedAt > rollingLowerBound {
			if entry.Value.Cmp(new(big.Int).Sub(new(big.Int).Set(maxUint256), rollingSpend)) > 0 {
				return SpendWindowTotalsResultV1{}, false
			}
			rollingSpend.Add(rollingSpend, entry.Value)
		}
	}
	return SpendWindowTotalsResultV1{DailySpend: dailySpend, RollingSpend: rollingSpend}, true
}
