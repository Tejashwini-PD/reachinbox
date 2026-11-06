import { describe, expect, it } from 'vitest';
import {
  buildBullJobId,
  hashRequest,
  stableStringify,
} from '../src/modules/emails/schedule.utils';

describe('idempotency helpers', () => {
  it('serializes objects deterministically regardless of key order', () => {
    const a = stableStringify({ b: 2, a: 1, nested: { z: true, y: ['x'] } });
    const b = stableStringify({ nested: { y: ['x'], z: true }, a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('hashes identical requests identically', () => {
    const request = {
      subject: 'Hello',
      recipients: [{ email: 'a@example.com' }],
      senderId: 'sender-1',
    };
    expect(hashRequest(request)).toBe(hashRequest({ ...request }));
  });

  it('hashes different payloads differently', () => {
    expect(hashRequest({ subject: 'Hello' })).not.toBe(hashRequest({ subject: 'Goodbye' }));
  });

  it('uses the email id as a stable BullMQ job id', () => {
    expect(buildBullJobId('email-123')).toBe('email-123');
    expect(buildBullJobId('email-123')).toBe(buildBullJobId('email-123'));
  });
});
