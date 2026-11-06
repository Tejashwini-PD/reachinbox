import { describe, expect, it } from 'vitest';
import {
  ACQUIRE_SEND_SLOT_LUA,
  HOUR_MS,
  computeHourlyRetryDelay,
  hourlyNotificationKey,
  rateLimitKeys,
} from '../src/modules/queue/rateLimit.utils';

describe('rate limit helpers', () => {
  it('computes the wait until the oldest send leaves the hourly window', () => {
    const now = 1_000_000;
    const oldest = now - 10 * 60 * 1000;
    expect(computeHourlyRetryDelay(oldest, now)).toBe(50 * 60 * 1000);
  });

  it('never returns a non-positive delay', () => {
    expect(computeHourlyRetryDelay(0, Date.now() + HOUR_MS)).toBe(1);
  });

  it('uses sender-scoped Redis keys', () => {
    expect(rateLimitKeys('sender-a')).toEqual({
      delayKey: 'reachinbox:ratelimit:delay:sender-a',
      hourlyKey: 'reachinbox:ratelimit:hourly:sender-a',
    });
  });

  it('changes the Slack dedupe key per hour bucket', () => {
    const now = 3 * HOUR_MS + 10;
    const keyA = hourlyNotificationKey('sender-a', now);
    const keyB = hourlyNotificationKey('sender-a', now + HOUR_MS);
    expect(keyA).not.toBe(keyB);
    expect(keyA).toContain('sender-a');
  });

  it('exposes an atomic Lua script that checks both delay and hourly window', () => {
    expect(ACQUIRE_SEND_SLOT_LUA).toContain('ZREMRANGEBYSCORE');
    expect(ACQUIRE_SEND_SLOT_LUA).toContain('ZCARD');
    expect(ACQUIRE_SEND_SLOT_LUA).toContain('SET');
  });
});
