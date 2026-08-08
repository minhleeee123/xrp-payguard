const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;
export const MAX_SPEND_WINDOW_ENTRIES_V1 = 4_096;

export interface SpendWindowEntryV1 {
  value: bigint;
  executedAt: bigint;
}

export interface SpendWindowTotalsV1 {
  dailySpend: bigint;
  rollingSpend: bigint;
}

/** Sums a UTC calendar day and an exact sliding window from ordered history. */
export function spendWindowTotalsV1(
  entries: readonly SpendWindowEntryV1[],
  now: bigint,
  rollingWindowSeconds: bigint,
): SpendWindowTotalsV1 | null {
  if (now < 0n || now > MAX_UINT64 || rollingWindowSeconds <= 0n
    || rollingWindowSeconds > MAX_UINT64 || entries.length > MAX_SPEND_WINDOW_ENTRIES_V1) return null;
  const dayStart = (now / 86_400n) * 86_400n;
  const hasLowerBound = now >= rollingWindowSeconds;
  const rollingLowerBound = hasLowerBound ? now - rollingWindowSeconds : 0n;
  let dailySpend = 0n;
  let rollingSpend = 0n;
  let priorTimestamp = 0n;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (entry.value <= 0n || entry.value > MAX_UINT256 || entry.executedAt < 0n
      || entry.executedAt > now || entry.executedAt > MAX_UINT64
      || (index > 0 && entry.executedAt < priorTimestamp)) return null;
    priorTimestamp = entry.executedAt;
    if (entry.executedAt >= dayStart) {
      if (entry.value > MAX_UINT256 - dailySpend) return null;
      dailySpend += entry.value;
    }
    if (!hasLowerBound || entry.executedAt > rollingLowerBound) {
      if (entry.value > MAX_UINT256 - rollingSpend) return null;
      rollingSpend += entry.value;
    }
  }
  return { dailySpend, rollingSpend };
}
