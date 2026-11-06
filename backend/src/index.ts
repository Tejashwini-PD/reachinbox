import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { connectPrisma, disconnectPrisma } from './lib/prisma';
import { closeRedis } from './lib/redis';
import { ensureEmailIndex } from './integrations/elasticsearch';
import { syncSendersFromEnv } from './modules/senders/sender.service';
import { closeQueue } from './modules/queue/queue';
import { reconcileEmailQueue } from './modules/queue/reconcile';

async function main(): Promise<void> {
  await connectPrisma();

  try {
    await ensureEmailIndex();
  } catch (error) {
    logger.warn({ err: error }, 'Elasticsearch unavailable at startup; search will be degraded');
  }

  try {
    await syncSendersFromEnv();
  } catch (error) {
    logger.error(
      { err: error },
      'Could not sync senders. Did you run prisma db push/migrate and is PostgreSQL running?',
    );
  }

  try {
    const result = await reconcileEmailQueue();
    logger.info(result, 'Email queue reconciliation complete');
  } catch (error) {
    logger.warn({ err: error }, 'Queue reconciliation failed at startup');
  }

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, frontend: env.FRONTEND_URL },
      'ReachInbox API listening',
    );
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Graceful API shutdown started');

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      setTimeout(resolve, 10_000).unref();
    });

    await closeQueue().catch(() => undefined);
    await closeRedis().catch(() => undefined);
    await disconnectPrisma().catch(() => undefined);
    logger.info('API shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (error) => {
  logger.fatal({ err: error }, 'API failed to start');
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});
