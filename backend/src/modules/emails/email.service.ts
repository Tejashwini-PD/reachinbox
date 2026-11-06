import { randomUUID } from 'node:crypto';
import type { Email, EmailStatus, Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { emailJobOptions, emailQueue, removeEmailJob } from '../queue/queue';
import { getUsableSender } from '../senders/sender.service';
import { indexEmailById, indexScheduledEmails } from '../search/search.service';
import { computeScheduledTimes, hashRequest } from './schedule.utils';
import type { ScheduleEmailsInput } from './email.schemas';

const emailListSelect = {
  id: true,
  campaignId: true,
  recipient: true,
  recipientName: true,
  subject: true,
  status: true,
  scheduledAt: true,
  sentAt: true,
  attempts: true,
  lastError: true,
  messageId: true,
  previewUrl: true,
  senderId: true,
  createdAt: true,
  updatedAt: true,
  sender: { select: { id: true, name: true, email: true } },
} satisfies Prisma.EmailSelect;

export interface ScheduleResponse {
  campaignId: string;
  totalRecipients: number;
  emailIds: string[];
  status: string;
  warning?: string;
  idempotentReplay?: boolean;
}

function isPrismaUniqueError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}

async function handleExistingIdempotency(
  existing: {
    requestHash: string;
    status: string;
    response: Prisma.JsonValue | null;
  },
  requestHash: string,
): Promise<ScheduleResponse> {
  if (existing.requestHash !== requestHash) {
    throw new ConflictError('Idempotency-Key was already used with a different request payload');
  }
  if (existing.status === 'PROCESSING') {
    throw new ConflictError('An identical scheduling request is already being processed');
  }
  return {
    ...(existing.response as unknown as ScheduleResponse),
    idempotentReplay: true,
  };
}

/**
 * Creates a campaign and one Email row per recipient, then adds persistent
 * delayed BullMQ jobs. Stable job ids (email ids) plus Idempotency-Key support
 * prevent duplicate jobs when the same request is retried.
 */
export async function scheduleEmails(
  userId: string,
  input: ScheduleEmailsInput,
  idempotencyHeader?: string,
): Promise<ScheduleResponse> {
  const sender = await getUsableSender(userId, input.senderId);
  const delayMs = input.delayMs ?? env.MIN_DELAY_BETWEEN_EMAILS_MS;
  const hourlyLimit = input.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;
  const idempotencyKey = input.idempotencyKey ?? idempotencyHeader;

  const requestHash = hashRequest({
    subject: input.subject,
    body: input.body,
    recipients: input.recipients,
    senderId: input.senderId,
    startAt: input.startAt.toISOString(),
    delayMs,
    hourlyLimit,
  });

  let idempotencyRecordId: string | null = null;

  if (idempotencyKey) {
    const existing = await prisma.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key: idempotencyKey } },
    });
    if (existing) return handleExistingIdempotency(existing, requestHash);

    try {
      const record = await prisma.idempotencyRecord.create({
        data: {
          userId,
          key: idempotencyKey,
          requestHash,
          status: 'PROCESSING',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      idempotencyRecordId = record.id;
    } catch (error) {
      if (!isPrismaUniqueError(error)) throw error;
      const existing = await prisma.idempotencyRecord.findUnique({
        where: { userId_key: { userId, key: idempotencyKey } },
      });
      if (!existing) throw error;
      return handleExistingIdempotency(existing, requestHash);
    }
  }

  try {
    const scheduledTimes = computeScheduledTimes(
      input.startAt,
      delayMs,
      input.recipients.length,
    );

    const { campaign, emails } = await prisma.$transaction(
      async (tx) => {
        const createdCampaign = await tx.campaign.create({
          data: {
            userId,
            senderId: sender.id,
            subject: input.subject,
            body: input.body,
            startAt: input.startAt,
            delayMs,
            hourlyLimit,
            status: 'SCHEDULED',
            totalRecipients: input.recipients.length,
          },
        });

        const createdEmails: Email[] = [];
        for (let index = 0; index < input.recipients.length; index += 1) {
          const recipient = input.recipients[index];
          const emailId = randomUUID();
          const email = await tx.email.create({
            data: {
              id: emailId,
              campaignId: createdCampaign.id,
              userId,
              senderId: sender.id,
              recipient: recipient.email,
              recipientName: recipient.name,
              subject: input.subject,
              body: input.body,
              status: 'SCHEDULED',
              scheduledAt: scheduledTimes[index],
              // The database id is the stable BullMQ job id.
              bullJobId: emailId,
            },
          });
          createdEmails.push(email);
        }

        return { campaign: createdCampaign, emails: createdEmails };
      },
      { timeout: 30_000 },
    );

    let queueWarning: string | undefined;
    try {
      await emailQueue.addBulk(
        emails.map((email) => ({
          name: 'send-email',
          data: { emailId: email.id },
          opts: {
            ...emailJobOptions,
            jobId: email.id,
            delay: Math.max(0, email.scheduledAt.getTime() - Date.now()),
          },
        })),
      );
      await prisma.email.updateMany({
        where: { id: { in: emails.map((email) => email.id) }, status: 'SCHEDULED' },
        data: { status: 'PENDING' },
      });
    } catch (error) {
      queueWarning =
        'Emails were saved but could not be queued. They will be re-queued by the recovery process.';
      logger.error({ err: error, campaignId: campaign.id }, 'Failed to enqueue scheduled emails');
    }

    const response: ScheduleResponse = {
      campaignId: campaign.id,
      totalRecipients: emails.length,
      emailIds: emails.map((email) => email.id),
      status: queueWarning ? 'SCHEDULED' : 'PENDING',
      ...(queueWarning ? { warning: queueWarning } : {}),
    };

    if (idempotencyRecordId) {
      await prisma.idempotencyRecord.update({
        where: { id: idempotencyRecordId },
        data: { status: 'COMPLETED', response: response as unknown as Prisma.InputJsonValue },
      });
    }

    // Indexing is best-effort and must never block scheduling or sending.
    void indexScheduledEmails(emails.map((email) => ({ ...email, sender }))).catch((error) =>
      logger.warn({ err: error, campaignId: campaign.id }, 'Background indexing failed'),
    );

    return response;
  } catch (error) {
    if (idempotencyRecordId) {
      await prisma.idempotencyRecord
        .delete({ where: { id: idempotencyRecordId } })
        .catch(() => undefined);
    }
    throw error;
  }
}

export async function listEmails(
  userId: string,
  options: {
    page: number;
    limit: number;
    status?: EmailStatus;
    statuses?: EmailStatus[];
    campaignId?: string;
    recipient?: string;
  },
) {
  const where: Prisma.EmailWhereInput = { userId };
  if (options.status) where.status = options.status;
  if (options.statuses) where.status = { in: options.statuses };
  if (options.campaignId) where.campaignId = options.campaignId;
  if (options.recipient) {
    where.recipient = { contains: options.recipient, mode: 'insensitive' };
  }

  const skip = (options.page - 1) * options.limit;
  const [items, total] = await Promise.all([
    prisma.email.findMany({
      where,
      select: emailListSelect,
      orderBy: { scheduledAt: 'desc' },
      skip,
      take: options.limit,
    }),
    prisma.email.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.ceil(total / options.limit),
    },
  };
}

export async function getEmailForUser(userId: string, emailId: string) {
  const email = await prisma.email.findFirst({
    where: { id: emailId, userId },
    include: {
      sender: { select: { id: true, name: true, email: true } },
      campaign: { select: { id: true, status: true, totalRecipients: true, createdAt: true } },
      deliveryAttempts: { orderBy: { attemptNumber: 'desc' } },
    },
  });
  if (!email) throw new NotFoundError('Email not found');
  return email;
}

export async function cancelEmail(userId: string, emailId: string) {
  const email = await prisma.email.findFirst({ where: { id: emailId, userId } });
  if (!email) throw new NotFoundError('Email not found');
  if (!['SCHEDULED', 'PENDING'].includes(email.status)) {
    throw new ConflictError(`Only scheduled or pending emails can be cancelled (current: ${email.status})`);
  }

  const updated = await prisma.email.update({
    where: { id: email.id },
    data: { status: 'CANCELLED', lastError: 'Cancelled by user' },
  });

  await removeEmailJob(email.id);
  await refreshCampaignStatus(email.campaignId);
  void indexEmailById(email.id).catch(() => undefined);

  return updated;
}

/** Keeps campaign status derived from its individual email statuses. */
export async function refreshCampaignStatus(campaignId: string | null): Promise<void> {
  if (!campaignId) return;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status === 'CANCELLED') return;

  const [remaining, started] = await Promise.all([
    prisma.email.count({
      where: { campaignId, status: { in: ['SCHEDULED', 'PENDING', 'PROCESSING'] } },
    }),
    prisma.email.count({
      where: { campaignId, status: { in: ['SENT', 'PROCESSING', 'FAILED'] } },
    }),
  ]);

  let nextStatus = campaign.status;
  if (remaining === 0) nextStatus = 'COMPLETED';
  else if (started > 0) nextStatus = 'RUNNING';

  if (nextStatus !== campaign.status) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: nextStatus } });
  }
}

