import { backoffMs, startOfDayInZone, startOfNextDayInZone } from './time';

describe('day boundaries', () => {
  it('computes Bangkok midnight (UTC+7)', () => {
    const at = new Date('2026-11-09T20:00:00Z'); // 03:00 on the 10th in Bangkok
    expect(startOfDayInZone(at, 'Asia/Bangkok').toISOString()).toBe('2026-11-09T17:00:00.000Z');
    expect(startOfNextDayInZone(at, 'Asia/Bangkok').toISOString()).toBe('2026-11-10T17:00:00.000Z');
    expect(startOfDayInZone(new Date('2026-11-09T16:59:59Z'), 'Asia/Bangkok').toISOString()).toBe(
      '2026-11-08T17:00:00.000Z',
    );
  });

  it('handles UTC and DST zones', () => {
    expect(startOfDayInZone(new Date('2026-11-09T12:00:00Z'), 'UTC').toISOString()).toBe(
      '2026-11-09T00:00:00.000Z',
    );
    // New York switched back to EST (UTC-5) on 2026-11-01.
    expect(
      startOfDayInZone(new Date('2026-11-01T12:00:00Z'), 'America/New_York').toISOString(),
    ).toBe('2026-11-01T04:00:00.000Z');
  });
});

describe('backoffMs', () => {
  it('follows 1m, 5m, 30m, 2h, 8h and stays at 8h', () => {
    expect([1, 2, 3, 4, 5, 6].map(backoffMs)).toEqual([
      60_000, 300_000, 1_800_000, 7_200_000, 28_800_000, 28_800_000,
    ]);
  });
});
