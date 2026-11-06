import { z } from 'zod';
import type { NormalizedRecipient } from './schedule.utils';

const recipientSchema = z.union([
  z.object({
    email: z.string().trim().email('Invalid recipient email'),
    name: z.string().trim().max(120).optional(),
  }),
  z.string().trim().email('Invalid recipient email'),
]);

export const scheduleEmailsSchema = z
  .object({
    subject: z.string().trim().min(1, 'Subject is required').max(255),
    body: z.string().trim().min(1, 'Body is required').max(200_000),
    recipients: z
      .array(recipientSchema)
      .min(1, 'At least one recipient is required')
      .max(2_000, 'A batch can contain at most 2000 recipients'),
    senderId: z.string().trim().min(1, 'senderId is required'),
    startAt: z.coerce.date(),
    delayMs: z.coerce.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
    hourlyLimit: z.coerce.number().int().min(1).max(1_000_000).optional(),
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
  })
  .transform((input) => {
    const seen = new Set<string>();
    const recipients: NormalizedRecipient[] = [];
    for (const item of input.recipients) {
      const normalized =
        typeof item === 'string'
          ? { email: item.toLowerCase() }
          : { email: item.email.toLowerCase(), name: item.name };
      if (seen.has(normalized.email)) continue;
      seen.add(normalized.email);
      recipients.push(normalized);
    }
    return { ...input, recipients };
  })
  .refine((input) => input.recipients.length > 0, {
    message: 'At least one unique recipient is required',
    path: ['recipients'],
  });

export type ScheduleEmailsInput = z.infer<typeof scheduleEmailsSchema>;

export const listEmailsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['SCHEDULED', 'PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'])
    .optional(),
  campaignId: z.string().trim().min(1).optional(),
  recipient: z.string().trim().max(320).optional(),
});

export const emailIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export const searchEmailsQuerySchema = z.object({
  q: z.string().trim().max(500).optional(),
  recipient: z.string().trim().max(320).optional(),
  subject: z.string().trim().max(255).optional(),
  sender: z.string().trim().max(320).optional(),
  status: z
    .enum(['SCHEDULED', 'PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SearchEmailsQuery = z.infer<typeof searchEmailsQuerySchema>;

export const createSenderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  smtpHost: z.string().trim().min(1).max(255),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(587),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().trim().min(1).max(320),
  smtpPass: z.string().min(1).max(500),
});

export const updateSenderSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  smtpHost: z.string().trim().min(1).max(255).optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().trim().min(1).max(320).optional(),
  smtpPass: z.string().min(1).max(500).optional(),
  isActive: z.boolean().optional(),
});

export const senderIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});
