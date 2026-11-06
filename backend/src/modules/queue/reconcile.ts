import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { indexEmailById } from '../search/search.service';
import { refreshCampaignStatus } from '../emails/email.service';
import { emailQueue, enqueueEmailJob } from './queue';

/**
 * Emails left in PROCESSING after a crash have an unknown SMTP outcome. We
 * deliberately do NOT retry them automatically: the SMTP server may already
 * have accepted the message, and resending could duplicate it. They are marked
 * FAILED for manual review instead.
 */
export async function recoverStaleProcessingEmails(): Promise<number> {
  const cutoff = new Date(Date.now() - env.STALE_PROCESSING_MINUTES * 60 * 1000);
  const stale = await prisma.email.findMany({
    where: { status: 'PROCESSING', updatedAt: { lt: cutoff } },
    select: { id: true, campaignId: true },
    take: 5_000,
  });
  if (stale.length === 0) return 0;

  await prisma.email.updateMany({
    where: { id: { in: stale.map((email) => email.id) } },
    data: {
      status: 'FAILED',
      lastError:
        'Worker stopped while sending; SMTP delivery state is unknown. Not retried automatically to avoid duplicates.',
    },
  });

  for (const email of stale) {
    void indexEmailById(email.id).catch(() => undefined);
  }
  const campaignIds = [...new Set(stale.map((email) => email.campaignId).filter(Boolean))] as string[];
  for (const campaignId of campaignIds) {
    await refreshCampaignStatus(campaignId).catch(() => undefined);
  }

  logger.warn({ count: stale.length }, 'Recovered stale PROCESSING emails as FAILED (unknown delivery state)');
  return stale.length;
}

/**
 * Re-queues SCHEDULED/PENDING database rows whose BullMQ job is missing (for
 * example if Redis was flushed or the API crashed after the DB commit).
 */
export async function requeueOrphanedEmails(): Promise<number> {
  const candidates = await prisma.email.findMany({
    where: { status: { in: ['SCHEDULED', 'PENDING'] } },
    select: { id: true, bullJobId: true, scheduledAt: true },
    orderBy: { scheduledAt: 'asc' },
    take: 5_000,
  });

  let requeued = 0;
  for (const email of candidates) {
    const job = await emailQueue.getJob(email.bullJobId);
    if (job) continue;

    const scheduledAt = new Date(Math.max(Date.now(), email.scheduledAt.getTime()));
    await enqueueEmailJob(email.id, scheduledAt);
    await prisma.email.update({
      where: { id: email.id },
      data: { status: 'PENDING', scheduledAt },
    });
    requeued += 1;
  }

  if (requeued > 0) logger.info({ requeued }, 'Re-queued orphaned scheduled emails');
  return requeued;
}

export async function reconcileEmailQueue(): Promise<{ stale: number; requeued: number }> {
  const stale = await recoverStaleProcessingEmails();
  const requeued = await requeueOrphanedEmails();
  return { stale, requeued };
}
