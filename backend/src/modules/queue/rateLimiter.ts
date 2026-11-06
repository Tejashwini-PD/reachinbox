import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import {
  ACQUIRE_SEND_SLOT_LUA,
  HOUR_MS,
  hourlyNotificationKey,
  rateLimitKeys,
} from './rateLimit.utils';

export interface SendSlotResult {
  allowed: boolean;
  /** Milliseconds to wait before retrying when allowed === false. */
  waitMs: number;
  hourlyCount: number;
  hourlyLimitReached: boolean;
  hourlyLimit: number;
}

/**
 * Distributed rate limiter. Returns allowed=false when the caller should
 * reschedule the BullMQ job instead of failing it.
 */
export async function acquireSendSlot(
  senderId: string,
  options?: {
    minDelayMs?: number;
    hourlyLimit?: number;
  },
): Promise<SendSlotResult> {
  const minDelayMs = options?.minDelayMs ?? env.MIN_DELAY_BETWEEN_EMAILS_MS;
  const hourlyLimit = options?.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;
  const { delayKey, hourlyKey } = rateLimitKeys(senderId);
  const now = Date.now();

  const raw = (await redis.eval(
    ACQUIRE_SEND_SLOT_LUA,
    2,
    delayKey,
    hourlyKey,
    String(now),
    String(minDelayMs),
    String(hourlyLimit),
    String(HOUR_MS),
    `${now}-${randomUUID()}`,
  )) as unknown[];

  const allowed = Number(raw[0]) === 1;
  const waitMs = Number(raw[1]) || 0;
  const hourlyCount = Number(raw[2]);
  const hourlyLimitReached = Number(raw[3]) === 1;

  return {
    allowed,
    waitMs: Math.max(0, waitMs),
    hourlyCount,
    hourlyLimitReached,
    hourlyLimit,
  };
}

/**
 * Deduplicates Slack alerts per sender per hour bucket using SET NX EX.
 * Returns true only for the first caller in the bucket.
 */
export async function claimHourlyLimitNotification(senderId: string): Promise<boolean> {
  try {
    const result = await redis.set(hourlyNotificationKey(senderId, Date.now()), '1', 'EX', 7200, 'NX');
    return result === 'OK';
  } catch (error) {
    logger.warn({ err: error, senderId }, 'Could not claim Slack notification slot');
    return false;
  }
}
