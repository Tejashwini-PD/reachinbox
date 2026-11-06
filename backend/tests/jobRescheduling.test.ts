import { describe, expect, it } from 'vitest';
import {
  computeHourlyRetryDelay,
  computeRescheduleTimestamp,
  MIN_RESCHEDULE_MS,
} from '../src/modules/queue/rateLimit.utils';

describe('rate-limited job rescheduling', () => {
  it('schedules the job in the future instead of dropping it', () => {
    const now = Date.now();
    const waitMs = computeHourlyRetryDelay(now - 59 * 60 * 1000, now);
    const resumeAt = computeRescheduleTimestamp(now, waitMs);
    expect(resumeAt).toBeGreaterThan(now);
    expect(resumeAt - now).toBe(waitMs);
  });

  it('enforces a minimum reschedule delay to avoid hot retry loops', () => {
    const now = Date.now();
    expect(computeRescheduleTimestamp(now, 0) - now).toBe(MIN_RESCHEDULE_MS);
    expect(computeRescheduleTimestamp(now, -100) - now).toBe(MIN_RESCHEDULE_MS);
  });
});
