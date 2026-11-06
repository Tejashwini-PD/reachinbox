import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { checkRedis } from '../../lib/redis';
import { checkElasticsearch } from '../../integrations/elasticsearch';
import { getQueueCounts } from '../queue/queue';
import { logger } from '../../lib/logger';

export const healthRouter = Router();

async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

healthRouter.get('/', async (_req, res) => {
  const [database, redis, elasticsearch] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkElasticsearch(),
  ]);

  let queue: Record<string, number> | null = null;
  try {
    queue = await getQueueCounts();
  } catch (error) {
    logger.warn({ err: error }, 'Could not read queue counts for health check');
  }

  const criticalOk = database && redis;
  res.status(criticalOk ? 200 : 503).json({
    status: criticalOk ? (elasticsearch ? 'ok' : 'degraded') : 'unhealthy',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: { database, redis, elasticsearch },
    queue,
    workerConcurrency: process.env.WORKER_CONCURRENCY,
  });
});
