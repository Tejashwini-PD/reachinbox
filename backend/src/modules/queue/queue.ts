import { Queue, type JobsOptions } from 'bullmq';
import { env } from '../../config/env';
import { createBullConnection } from '../../lib/redis';
import { logger } from '../../lib/logger';

export const EMAIL_QUEUE_NAME = 'reachinbox-email-send';

export interface EmailJobData {
  emailId: string;
}

export const emailJobOptions: JobsOptions = {
  attempts: env.MAX_EMAIL_ATTEMPTS,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 10_000 },
};

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: createBullConnection(),
  defaultJobOptions: emailJobOptions,
});

emailQueue.on('error', (error) => logger.warn({ err: error }, 'Email queue error'));

/**
 * Adds a delayed job with a stable ID (the email id). BullMQ ignores a second
 * add for an existing job id, which makes scheduling retries idempotent.
 */
export async function enqueueEmailJob(emailId: string, scheduledAt: Date): Promise<void> {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());
  await emailQueue.add(
    'send-email',
    { emailId },
    {
      ...emailJobOptions,
      jobId: emailId,
      delay,
    },
  );
}

export async function removeEmailJob(emailId: string): Promise<void> {
  try {
    const job = await emailQueue.getJob(emailId);
    if (job) await job.remove();
  } catch (error) {
    logger.warn({ err: error, emailId }, 'Could not remove queue job');
  }
}

export async function getQueueCounts(): Promise<Record<string, number>> {
  const counts = await emailQueue.getJobCounts(
    'waiting',
    'delayed',
    'active',
    'completed',
    'failed',
    'paused',
  );
  return counts as Record<string, number>;
}

export async function closeQueue(): Promise<void> {
  await emailQueue.close();
}
