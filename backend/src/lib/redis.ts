import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

function attachLogging(client: Redis, name: string): Redis {
  client.on('error', (error) => logger.warn({ err: error, redis: name }, 'Redis error'));
  client.on('connect', () => logger.info({ redis: name }, 'Redis connected'));
  return client;
}

/**
 * General-purpose Redis connection used for OAuth state, sessions and the
 * distributed rate limiter.
 */
export const redis = attachLogging(
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  }),
  'main',
);

/**
 * BullMQ requires a connection with maxRetriesPerRequest = null and its own
 * blocking connection. Never share this instance between Queue and Worker in
 * the same process unless BullMQ explicitly allows it.
 */
export function createBullConnection(): Redis {
  return attachLogging(
    new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    }),
    'bullmq',
  );
}

export async function checkRedis(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  await redis.quit().catch(() => undefined);
}
