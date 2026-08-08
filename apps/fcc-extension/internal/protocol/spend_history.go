package protocol

import (
	"math/big"

	"github.com/ethereum/go-ethereum/common"
)

// SpendHistoryEntryV1 contains public data for one canonical transition.
type SpendHistoryEntryV1 struct {
	Request     ActionRequestV1
	AccountedAt uint64
	FTSO        *FTSOSnapshotV1
}

func matchesPolicyDomain(policy PolicyV1, request ActionRequestV1, commitment common.Hash) bool {
	return request.ChainID != nil && request.ChainID.Cmp(policy.ChainID) == 0 && request.Registry == policy.Registry && request.Vault == policy.Vault && request.Router == policy.Router && request.PolicyID == policy.PolicyID && request.PolicyVersion == policy.PolicyVersion && request.PolicyCommitment == commitment
}

func historyReferenceValue(policy PolicyV1, request ActionRequestV1, feed *FTSOSnapshotV1, now uint64) (*big.Int, bool) {
	if feed == nil || feed.Value == nil || feed.FeedID != policy.FTSOFeedID || feed.Timestamp > now || now-feed.Timestamp > policy.MaxPriceAgeSecs || feed.Checkpoint == zeroHash() || request.InputCommitment != feed.Checkpoint {
		return nil, false
	}
	return ReferenceValueV1(request.Amount, feed.Value, feed.Decimals)
}

func replaySpendHistoryV1(policy PolicyV1, state SpendStateV1, commitment common.Hash) (SpendWindowTotalsResultV1, uint8) {
	if state.History == nil || len(state.History) > MaxSpendWindowEntriesV1 {
		return SpendWindowTotalsResultV1{}, ReasonMalformed
	}
	checkpoint, err := GenesisSpendCheckpoint(commitment)
	if err != nil {
		return SpendWindowTotalsResultV1{}, ReasonMalformed
	}
	windowEntries := make([]SpendWindowEntryV1, 0, len(state.History))
	for index, entry := range state.History {
		request := entry.Request
		occurrence := uint32(index + 1)
		if !matchesPolicyDomain(policy, request, commitment) || request.Asset != policy.Asset || request.ActionType != ActionFTestXRPTransfer || request.Amount == nil || request.Amount.Sign() <= 0 || request.Amount.Cmp(maxUint256) > 0 || request.Occurrence != occurrence || request.SpendCheckpoint != checkpoint || entry.AccountedAt < request.CreatedAt || entry.AccountedAt > request.Expiry || request.GraceDeadline < request.CreatedAt || request.Expiry < request.GraceDeadline || entry.AccountedAt > state.Now {
			return SpendWindowTotalsResultV1{}, ReasonMalformed
		}
		value := new(big.Int).Set(request.Amount)
		if policy.RequireFTSO {
			converted, valid := historyReferenceValue(policy, request, entry.FTSO, entry.AccountedAt)
			if !valid {
				return SpendWindowTotalsResultV1{}, ReasonFTSOInvalid
			}
			value = converted
		} else if entry.FTSO != nil {
			return SpendWindowTotalsResultV1{}, ReasonMalformed
		}
		checkpoint, err = calculateNextCheckpoint(request, request.Amount, occurrence, entry.AccountedAt)
		if err != nil {
			return SpendWindowTotalsResultV1{}, ReasonMalformed
		}
		windowEntries = append(windowEntries, SpendWindowEntryV1{Value: value, ExecutedAt: entry.AccountedAt})
	}
	lastAccountingAt := uint64(0)
	if len(state.History) != 0 {
		lastAccountingAt = state.History[len(state.History)-1].AccountedAt
	}
	if int(state.OccurrenceCount) != len(state.History) || state.LastAccountingAt != lastAccountingAt || state.SpendCheckpoint != checkpoint {
		return SpendWindowTotalsResultV1{}, ReasonStaleInput
	}
	effectiveWindow := policy.RollingWindowSecs
	if effectiveWindow == 0 {
		effectiveWindow = 1
	}
	totals, valid := SpendWindowTotalsV1(windowEntries, state.Now, effectiveWindow)
	if !valid {
		return SpendWindowTotalsResultV1{}, ReasonMalformed
	}
	return totals, ReasonOK
}
