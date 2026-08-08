const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_UINT32 = (1n << 32n) - 1n;

export interface ScheduleWindowV1 {
  slot: bigint;
  deadline: bigint;
}

/** Computes an inclusive UTC slot window using checked wire-width arithmetic. */
export function scheduleWindowV1(
  startAt: bigint,
  intervalSeconds: bigint,
  graceSeconds: bigint,
  occurrence: bigint,
): ScheduleWindowV1 | null {
  if (startAt < 0n || startAt > MAX_UINT64
    || intervalSeconds <= 0n || intervalSeconds > MAX_UINT64
    || graceSeconds <= 0n || graceSeconds >= intervalSeconds || graceSeconds > MAX_UINT64
    || occurrence <= 0n || occurrence > MAX_UINT32) return null;
  const index = occurrence - 1n;
  if (index !== 0n && intervalSeconds > (MAX_UINT64 - startAt) / index) return null;
  const slot = startAt + index * intervalSeconds;
  if (graceSeconds > MAX_UINT64 - slot) return null;
  return { slot, deadline: slot + graceSeconds };
}
