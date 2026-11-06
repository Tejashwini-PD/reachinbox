import { Worker, UnrecoverableError, DelayedError, type Job } from 'bullmq';
import { env } from '../config/env';
import { prisma, connectPrisma, disconnectPrisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { createBullConnection, closeRedis } from '../lib/redis';
import { EMAIL_QUEUE_NAME, closeQueue, type EmailJobData } from '../modules/queue/queue';
import { acquireSendSlot, claimHourlyLimitNotification } from '../modules/queue/rateLimiter';
import { computeRescheduleTimestamp } from '../modules/queue/rateLimit.utils';
import { reconcileEmailQueue } from '../modules/queue/reconcile';
import { toSmtpSender } from '../modules/senders/sender.service';
import { sendEmail, isTransientSmtpError } from '../integrations/mailer';
import { indexEmailById } from '../modules/search/search.service';
import { refreshCampaignStatus } from '../modules/emails/email.service';
import { notifyHourlyLimitReached } from '../modules/slack/slack.service';
import { ensureEmailIndex } from '../integrations/elasticsearch';

async function maybeNotifyHourlyLimit(
  email: { userId: string; senderId: string },
  senderEmail: string,
  hourlyLimit: number,
): Promise<void> {
  const shouldNotify = await claimHourlyLimitNotification(email.senderId);
  if (!shouldNotify) return;
  await notifyHourlyLimitReached({
    userId: email.userId,
    senderEmail,
    hourlyLimit,
  }).catch((error) => logger.warn({ err: error }, 'Slack hourly-limit notification failed'));
}

async function processEmailJob(job: Job<EmailJobData>, token?: string): Promise<void> {
  const email = await prisma.email.findUnique({
    where: { id: job.data.emailId },
    include: { sender: true, campaign: true },
  });

  if (!email) {
    logger.warn({ emailId: job.data.emailId }, 'Email row no longer exists; skipping job');
    return;
  }

  if (['SENT', 'FAILED', 'CANCELLED'].includes(email.status)) {
    logger.info({ emailId: email.id, status: email.status }, 'Email already terminal; skipping job');
    return;
  }

  if (!email.sender.isActive) {
    await prisma.email.update({
      where: { id: email.id },
      data: { status: 'FAILED', lastError: 'Sender is inactive' },
    });
    throw new UnrecoverableError('Sender is inactive');
  }

  const hourlyLimit = email.campaign?.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;
  const slot = await acquireSendSlot(email.senderId, {
  minDelayMs: email.campaign?.delayMs ?? env.MIN_DELAY_BETWEEN_EMAILS_MS,
  hourlyLimit,
  });

  if (!slot.allowed) {
    const resumeAt = computeRescheduleTimestamp(Date.now(), slot.waitMs);
    await prisma.email.updateMany({
      where: { id: email.id, status: { in: ['SCHEDULED', 'PENDING'] } },
      data: {
        status: 'PENDING',
        scheduledAt: new Date(resumeAt),
        lastError: `Rate limited; rescheduled for ${new Date(resumeAt).toISOString()}`,
      },
    });

    if (slot.hourlyCount >= hourlyLimit) {
      await maybeNotifyHourlyLimit(email, email.sender.email, hourlyLimit);
    }

    // moveToDelayed does not consume an attempt and avoids a retry loop.
    await job.moveToDelayed(resumeAt, token);
    logger.info(
      { emailId: email.id, waitMs: slot.waitMs, hourlyCount: slot.hourlyCount },
      'Rate limited; job moved back to delayed',
   );
   throw new DelayedError();
  }

  if (slot.hourlyLimitReached) {
    await maybeNotifyHourlyLimit(email, email.sender.email, hourlyLimit);
  }

  // Only one worker may transition the row from scheduled/pending to processing.
  const claimed = await prisma.email.updateMany({
    where: { id: email.id, status: { in: ['SCHEDULED', 'PENDING'] } },
    data: { status: 'PROCESSING', attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    logger.info({ emailId: email.id }, 'Email was cancelled or already claimed; skipping');
    return;
  }

  const attemptNumber = email.attempts + 1;
  const startedAt = new Date();

  try {
    const result = await sendEmail(toSmtpSender(email.sender), {
      to: email.recipient,
      toName: email.recipientName ?? undefined,
      subject: email.subject,
      text: email.body,
    });

    try {
      await prisma.$transaction([
        prisma.deliveryAttempt.create({
          data: {
            emailId: email.id,
            attemptNumber,
            status: 'SUCCESS',
            smtpResponse: result.response,
            startedAt,
            finishedAt: new Date(),
          },
        }),
        prisma.email.update({
          where: { id: email.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            messageId: result.messageId,
            previewUrl: result.previewUrl,
            lastError: null,
          },
        }),
      ]);
    } catch (dbError) {
      // SMTP already accepted the message. Do not throw (which could resend).
      // The row stays PROCESSING and is marked FAILED for manual review by the
      // stale recovery process.
      logger.error(
        { err: dbError, emailId: email.id },
        'Email was sent but persistence failed; not retrying to avoid duplicate delivery',
      );
      return;
    }

    await refreshCampaignStatus(email.campaignId);
    void indexEmailById(email.id).catch(() => undefined);
    logger.info(
      { emailId: email.id, recipient: email.recipient, previewUrl: result.previewUrl },
      'Email sent successfully',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const transient = isTransientSmtpError(error);
    const maxAttempts = Number(job.opts.attempts ?? 1);
    const finalAttempt = !transient || job.attemptsMade + 1 >= maxAttempts;

    await prisma
      .$transaction([
        prisma.deliveryAttempt.create({
          data: {
            emailId: email.id,
            attemptNumber,
            status: 'FAILURE',
            error: message.slice(0, 4_000),
            startedAt,
            finishedAt: new Date(),
          },
        }),
        prisma.email.update({
          where: { id: email.id },
          data: {
            status: finalAttempt ? 'FAILED' : 'PENDING',
            lastError: message.slice(0, 4_000),
          },
        }),
      ])
      .catch((dbError) =>
        logger.error({ err: dbError, emailId: email.id }, 'Could not persist SMTP failure'),
      );

    await refreshCampaignStatus(email.campaignId).catch(() => undefined);
    void indexEmailById(email.id).catch(() => undefined);

    logger.warn(
      { err: error, emailId: email.id, attemptNumber, finalAttempt, transient },
      'Email send attempt failed',
    );

    if (finalAttempt) throw new UnrecoverableError(message);
    throw error;
  }
}

async function main(): Promise<void> {
  await connectPrisma();

  try {
    await ensureEmailIndex();
  } catch (error) {
    logger.warn({ err: error }, 'Elasticsearch unavailable at worker startup; sending will continue');
  }

  const reconciliation = await reconcileEmailQueue();
  logger.info(reconciliation, 'Queue reconciliation complete');

  const workerConnection = createBullConnection();
  const worker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
    connection: workerConnection,
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: 120_000,
  });

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'BullMQ job completed'));
  worker.on('failed', (job, error) =>
    logger.warn({ jobId: job?.id, err: error }, 'BullMQ job failed'),
  );
  worker.on('stalled', (jobId) => logger.warn({ jobId }, 'BullMQ job stalled'));
  worker.on('error', (error) => logger.error({ err: error }, 'BullMQ worker error'));

  logger.info(
    { concurrency: env.WORKER_CONCURRENCY, queue: EMAIL_QUEUE_NAME },
    'Email worker started',
  );

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Graceful worker shutdown started');
    try {
      await worker.close();
      await closeQueue();
      await workerConnection.quit();
      await closeRedis();
      await disconnectPrisma();
      logger.info('Worker shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during worker shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

if (require.main === module) {
  main().catch(async (error) => {
    logger.fatal({ err: error }, 'Worker failed to start');
    await disconnectPrisma().catch(() => undefined);
    process.exit(1);
  });
}

export { processEmailJob };
