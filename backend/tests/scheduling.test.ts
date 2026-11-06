import { describe, expect, it } from 'vitest';
import { computeScheduledTimes } from '../src/modules/emails/schedule.utils';

describe('computeScheduledTimes', () => {
  it('spaces recipients by the configured delay', () => {
    const start = new Date('2030-01-01T10:00:00.000Z');
    const times = computeScheduledTimes(start, 30_000, 4);
    expect(times.map((time) => time.toISOString())).toEqual([
      '2030-01-01T10:00:00.000Z',
      '2030-01-01T10:00:30.000Z',
      '2030-01-01T10:01:00.000Z',
      '2030-01-01T10:01:30.000Z',
    ]);
  });

  it('supports zero delay', () => {
    const start = new Date('2030-01-01T10:00:00.000Z');
    const times = computeScheduledTimes(start, 0, 3);
    expect(times.every((time) => time.getTime() === start.getTime())).toBe(true);
  });

  it('returns an empty list for zero recipients', () => {
    expect(computeScheduledTimes(new Date(), 1000, 0)).toEqual([]);
  });
});
