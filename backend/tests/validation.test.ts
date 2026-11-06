import { describe, expect, it } from 'vitest';
import {
  listEmailsQuerySchema,
  scheduleEmailsSchema,
  searchEmailsQuerySchema,
} from '../src/modules/emails/email.schemas';

const baseInput = {
  subject: 'Hello',
  body: 'Test body',
  recipients: ['Alice@Example.com', 'bob@example.com'],
  senderId: 'sender-1',
  startAt: '2030-01-01T10:00:00.000Z',
};

describe('scheduleEmailsSchema', () => {
  it('accepts multiple recipients and normalizes emails', () => {
    const parsed = scheduleEmailsSchema.parse(baseInput);
    expect(parsed.recipients).toEqual([
      { email: 'alice@example.com' },
      { email: 'bob@example.com' },
    ]);
    expect(parsed.startAt).toBeInstanceOf(Date);
  });

  it('accepts recipient objects with names and removes duplicates', () => {
    const parsed = scheduleEmailsSchema.parse({
      ...baseInput,
      recipients: [{ email: 'alice@example.com', name: 'Alice' }, 'ALICE@example.com'],
    });
    expect(parsed.recipients).toHaveLength(1);
    expect(parsed.recipients[0].name).toBe('Alice');
  });

  it('rejects invalid recipient addresses', () => {
    const result = scheduleEmailsSchema.safeParse({
      ...baseInput,
      recipients: ['not-an-email'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing subject', () => {
    const result = scheduleEmailsSchema.safeParse({ ...baseInput, subject: '' });
    expect(result.success).toBe(false);
  });

  it('rejects negative delays and invalid hourly limits', () => {
    expect(scheduleEmailsSchema.safeParse({ ...baseInput, delayMs: -1 }).success).toBe(false);
    expect(scheduleEmailsSchema.safeParse({ ...baseInput, hourlyLimit: 0 }).success).toBe(false);
  });
});

describe('query schemas', () => {
  it('applies pagination defaults', () => {
    const parsed = listEmailsQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it('rejects oversized pages', () => {
    expect(listEmailsQuerySchema.safeParse({ limit: 500 }).success).toBe(false);
  });

  it('accepts search filters', () => {
    const parsed = searchEmailsQuerySchema.parse({
      q: 'invoice',
      status: 'SENT',
      page: '2',
      limit: '10',
    });
    expect(parsed).toMatchObject({ q: 'invoice', status: 'SENT', page: 2, limit: 10 });
  });
});
