import { connectPrisma, disconnectPrisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { closeRedis } from '../lib/redis';
import { syncSendersFromEnv } from '../modules/senders/sender.service';

async function main(): Promise<void> {
  await connectPrisma();
  await syncSendersFromEnv();
  await disconnectPrisma();
  await closeRedis();
  logger.info('Sender sync complete');
}

main().catch(async (error) => {
  logger.fatal({ err: error }, 'Sender sync failed');
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});
