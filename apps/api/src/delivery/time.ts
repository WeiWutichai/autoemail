/** Offset (ms) of `timeZone` from UTC at the given instant. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Midnight (start of the local day) of `at` in `timeZone`, as a UTC instant. */
export function startOfDayInZone(at: Date, timeZone: string): Date {
  const offset = zoneOffsetMs(at, timeZone);
  const local = new Date(at.getTime() + offset);
  const midnightLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // Re-evaluate the offset at midnight (DST changes during the day).
  return new Date(midnightLocal - zoneOffsetMs(new Date(midnightLocal - offset), timeZone));
}

/** Start of the next local day in `timeZone`. */
export function startOfNextDayInZone(at: Date, timeZone: string): Date {
  const today = startOfDayInZone(at, timeZone);
  return startOfDayInZone(new Date(today.getTime() + 36 * 3600 * 1000), timeZone);
}

/** Retry delays after the 1st, 2nd, ... failed attempt (DESIGN section 6). */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 8 * 3600_000];

export function backoffMs(failedAttempts: number): number {
  return BACKOFF_MS[Math.min(Math.max(failedAttempts, 1), BACKOFF_MS.length) - 1];
}
