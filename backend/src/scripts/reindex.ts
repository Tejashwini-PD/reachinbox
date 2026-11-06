import { connectPrisma, disconnectPrisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { closeRedis } from '../lib/redis';
import { reindexEmails } from '../modules/search/search.service';

/** CLI recovery tool: rebuilds the Elasticsearch email index from PostgreSQL. */
async function main(): Promise<void> {
  await connectPrisma();
  const result = await reindexEmails({ batchSize: 200 });
  logger.info(result, 'Reindex complete');
  await disconnectPrisma();
  await closeRedis();
}

main().catch(async (error) => {
  logger.fatal({ err: error }, 'Reindex failed');
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});
