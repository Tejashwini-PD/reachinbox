import crypto from 'node:crypto';

export interface NormalizedRecipient {
  email: string;
  name?: string;
}

/** Recipient i starts at startAt + i * delayMs. */
export function computeScheduledTimes(startAt: Date, delayMs: number, recipientCount: number): Date[] {
  const base = startAt.getTime();
  return Array.from({ length: recipientCount }, (_, index) => new Date(base + index * delayMs));
}

/** Deterministic JSON serialization used for idempotency request hashes. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function hashRequest(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

/** BullMQ job id is the email row id, giving us a stable idempotency key. */
export function buildBullJobId(emailId: string): string {
  return emailId;
}
