import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env';
import { logger } from '../lib/logger';

export const EMAIL_INDEX = env.ELASTICSEARCH_EMAILS_INDEX;

export const esClient = new Client({
  node: env.ELASTICSEARCH_URL,
  requestTimeout: 5_000,
  maxRetries: 1,
});

export interface EmailSearchDocument {
  emailId: string;
  userId: string;
  campaignId: string | null;
  recipient: string;
  recipientName: string | null;
  subject: string;
  body: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
}

/** Creates the email index with explicit mappings. Safe to call repeatedly. */
export async function ensureEmailIndex(): Promise<void> {
  const exists = await esClient.indices.exists({ index: EMAIL_INDEX });
  if (exists) return;

  await esClient.indices.create({
    index: EMAIL_INDEX,
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
    mappings: {
      properties: {
        emailId: { type: 'keyword' },
        userId: { type: 'keyword' },
        campaignId: { type: 'keyword' },
        recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
        recipientName: { type: 'text' },
        subject: { type: 'text' },
        body: { type: 'text' },
        senderId: { type: 'keyword' },
        senderName: { type: 'text' },
        senderEmail: { type: 'keyword' },
        status: { type: 'keyword' },
        scheduledAt: { type: 'date' },
        sentAt: { type: 'date' },
        createdAt: { type: 'date' },
      },
    },
  });

  logger.info({ index: EMAIL_INDEX }, 'Elasticsearch email index created');
}

export async function indexEmailDocument(document: EmailSearchDocument): Promise<void> {
  await esClient.index({
    index: EMAIL_INDEX,
    id: document.emailId,
    document,
    refresh: false,
  });
}

export async function deleteEmailDocument(emailId: string): Promise<void> {
  await esClient.delete({ index: EMAIL_INDEX, id: emailId, refresh: false });
}

/** Indexing failures must never stop email delivery. */
export async function safeIndexEmailDocument(document: EmailSearchDocument): Promise<boolean> {
  try {
    await ensureEmailIndex();
    await indexEmailDocument(document);
    return true;
  } catch (error) {
    logger.warn({ err: error, emailId: document.emailId }, 'Elasticsearch indexing failed');
    return false;
  }
}

export async function checkElasticsearch(): Promise<boolean> {
  try {
    await esClient.ping();
    return true;
  } catch {
    return false;
  }
}
