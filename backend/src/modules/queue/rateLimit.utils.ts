export const HOUR_MS = 60 * 60 * 1000;

export function rateLimitKeys(senderId: string): { delayKey: string; hourlyKey: string } {
  return {
    delayKey: `reachinbox:ratelimit:delay:${senderId}`,
    hourlyKey: `reachinbox:ratelimit:hourly:${senderId}`,
  };
}

/** Time until the oldest send in the sliding window leaves the window. */
export function computeHourlyRetryDelay(
  oldestTimestampMs: number,
  nowMs: number,
  windowMs = HOUR_MS,
): number {
  return Math.max(1, oldestTimestampMs + windowMs - nowMs);
}

export const MIN_RESCHEDULE_MS = 1_000;

export function computeRescheduleTimestamp(nowMs: number, waitMs: number): number {
  return nowMs + Math.max(waitMs, MIN_RESCHEDULE_MS);
}

export function hourlyNotificationKey(senderId: string, nowMs: number): string {
  const bucket = Math.floor(nowMs / HOUR_MS);
  return `reachinbox:slack:hourly-limit:${senderId}:${bucket}`;
}

/**
 * Atomically verifies the minimum delay and the hourly sliding window, then
 * reserves a send slot. The Lua script is the distributed lock: multiple
 * workers can call it at the same time without exceeding limits.
 */
export const ACQUIRE_SEND_SLOT_LUA = `
local delayKey = KEYS[1]
local hourlyKey = KEYS[2]
local now = tonumber(ARGV[1])
local minDelay = tonumber(ARGV[2])
local hourlyLimit = tonumber(ARGV[3])
local window = tonumber(ARGV[4])
local member = ARGV[5]

local last = redis.call('GET', delayKey)
if last then
  local wait = minDelay - (now - tonumber(last))
  if wait > 0 then
    return {0, wait, -1, 0}
  end
end

redis.call('ZREMRANGEBYSCORE', hourlyKey, '-inf', now - window)
local count = redis.call('ZCARD', hourlyKey)

if count >= hourlyLimit then
  local oldest = redis.call('ZRANGE', hourlyKey, 0, 0, 'WITHSCORES')
  local wait = window
  if oldest[2] then
    wait = tonumber(oldest[2]) + window - now
  end
  if wait < 1 then wait = 1 end
  return {0, wait, count, 0}
end

local ttl = math.max(minDelay * 2, 60000)
redis.call('SET', delayKey, now, 'PX', ttl)
redis.call('ZADD', hourlyKey, now, member)
redis.call('PEXPIRE', hourlyKey, window + 60000)
local newCount = count + 1
local reached = 0
if newCount >= hourlyLimit then reached = 1 end
return {1, 0, newCount, reached}
`;
