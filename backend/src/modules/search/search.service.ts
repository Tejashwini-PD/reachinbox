import type { Email, Prisma, Sender } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { ServiceUnavailableError } from '../../lib/errors';
import {
  EMAIL_INDEX,
  ensureEmailIndex,
  esClient,
  safeIndexEmailDocument,
  type EmailSearchDocument,
} from '../../integrations/elasticsearch';
import type { SearchEmailsQuery } from '../emails/email.schemas';

type EmailWithSender = Email & { sender: Sender };

function toDocument(email: EmailWithSender): EmailSearchDocument {
  return {
    emailId: email.id,
    userId: email.userId,
    campaignId: email.campaignId,
    recipient: email.recipient,
    recipientName: email.recipientName,
    subject: email.subject,
    body: email.body,
    senderId: email.senderId,
    senderName: email.sender.name,
    senderEmail: email.sender.email,
    status: email.status,
    scheduledAt: email.scheduledAt.toISOString(),
    sentAt: email.sentAt ? email.sentAt.toISOString() : null,
    createdAt: email.createdAt.toISOString(),
  };
}

/** Index one email and record whether the search copy is up to date. */
export async function indexEmailById(emailId: string): Promise<boolean> {
  const email = await prisma.email.findUnique({ where: { id: emailId }, include: { sender: true } });
  if (!email) return false;

  const indexed = await safeIndexEmailDocument(toDocument(email));
  if (indexed) {
    await prisma.email
      .update({ where: { id: email.id }, data: { searchIndexedAt: new Date() } })
      .catch((error) => logger.warn({ err: error, emailId }, 'Could not update searchIndexedAt'));
  }
  return indexed;
}

/** Best-effort indexing after scheduling; never throws to the caller. */
export async function indexScheduledEmails(emails: EmailWithSender[]): Promise<void> {
  for (const email of emails) {
    const indexed = await safeIndexEmailDocument(toDocument(email));
    if (indexed) {
      await prisma.email
        .update({ where: { id: email.id }, data: { searchIndexedAt: new Date() } })
        .catch(() => undefined);
    }
  }
}

export async function searchEmails(userId: string, query: SearchEmailsQuery) {
  try {
    await ensureEmailIndex();

    const must: Record<string, unknown>[] = [];
    const filter: Record<string, unknown>[] = [{ term: { userId } }];

    if (query.q) {
      must.push({
        multi_match: {
          query: query.q,
          fields: ['subject^2', 'body', 'recipient', 'recipientName', 'senderName', 'senderEmail'],
          fuzziness: 'AUTO',
        },
      });
    }
    if (query.recipient) must.push({ match: { recipient: query.recipient } });
    if (query.subject) must.push({ match: { subject: query.subject } });
    if (query.sender) {
      must.push({
        multi_match: { query: query.sender, fields: ['senderName', 'senderEmail'] },
      });
    }
    if (query.status) filter.push({ term: { status: query.status } });

    const from = (query.page - 1) * query.limit;
    const result = await esClient.search<EmailSearchDocument>({
      index: EMAIL_INDEX,
      from,
      size: query.limit,
      query: { bool: { must, filter } },
      sort: [{ scheduledAt: { order: 'desc' } }],
      track_total_hits: true,
    });

    const totalRaw = result.hits.total;
    const total = typeof totalRaw === 'number' ? totalRaw : totalRaw?.value ?? 0;

    return {
      items: result.hits.hits.map((hit) => hit._source),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      source: 'elasticsearch',
    };
  } catch (error) {
    logger.warn({ err: error, userId }, 'Elasticsearch search failed');
    throw new ServiceUnavailableError(
      'Email search is temporarily unavailable because Elasticsearch is offline.',
    );
  }
}

/**
 * Reindexes emails from PostgreSQL, the source of truth. Used by the API
 * endpoint and the CLI script to recover from Elasticsearch downtime.
 */
export async function reindexEmails(options?: {
  userId?: string;
  batchSize?: number;
}): Promise<{ indexed: number; failed: number; total: number }> {
  const batchSize = options?.batchSize ?? 200;
  const where: Prisma.EmailWhereInput = options?.userId ? { userId: options.userId } : {};

  try {
    await ensureEmailIndex();
  } catch (error) {
    logger.warn({ err: error }, 'Cannot reindex: Elasticsearch unavailable');
    throw new ServiceUnavailableError('Elasticsearch is unavailable, cannot reindex.');
  }

  const total = await prisma.email.count({ where });
  let indexed = 0;
  let failed = 0;
  let skip = 0;

  while (skip < total) {
    const emails = await prisma.email.findMany({
      where,
      include: { sender: true },
      orderBy: { id: 'asc' },
      skip,
      take: batchSize,
    });
    if (emails.length === 0) break;

    const successfulIds: string[] = [];
    for (const email of emails) {
      const ok = await safeIndexEmailDocument(toDocument(email));
      if (ok) {
        successfulIds.push(email.id);
        indexed += 1;
      } else {
        failed += 1;
      }
    }
    if (successfulIds.length > 0) {
      await prisma.email.updateMany({
        where: { id: { in: successfulIds } },
        data: { searchIndexedAt: new Date() },
      });
    }
    skip += emails.length;
  }

  return { indexed, failed, total };
}
