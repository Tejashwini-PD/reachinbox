import nodemailer from 'nodemailer';
import type { Sender } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { encryptSecret, decryptSecret } from '../../lib/crypto';
import { NotFoundError, ForbiddenError, ConflictError } from '../../lib/errors';
import type { SmtpSender } from '../../integrations/mailer';
import { createSenderSchema, updateSenderSchema } from '../emails/email.schemas';

interface EnvSenderConfig {
  name: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
}

function readEnvSender(index: number): EnvSenderConfig | null {
  const prefix = `SENDER_${index}_`;
  const email = process.env[`${prefix}EMAIL`]?.trim();
  const smtpUser = process.env[`${prefix}SMTP_USER`]?.trim();
  const smtpPass = process.env[`${prefix}SMTP_PASS`]?.trim();

  if (!email || !smtpUser || !smtpPass) return null;
  if (email.includes('replace-with') || smtpUser.includes('replace-with') || smtpPass.includes('replace-with')) {
    logger.warn({ sender: index }, 'Sender skipped because .env still contains placeholder credentials');
    return null;
  }

  return {
    name: process.env[`${prefix}NAME`]?.trim() || email,
    email,
    smtpHost: process.env[`${prefix}SMTP_HOST`]?.trim() || 'smtp.ethereal.email',
    smtpPort: Number(process.env[`${prefix}SMTP_PORT`] || 587),
    smtpSecure: ['true', '1', 'yes'].includes(
      String(process.env[`${prefix}SMTP_SECURE`] || 'false').toLowerCase(),
    ),
    smtpUser,
    smtpPass,
  };
}

async function upsertSharedSender(config: EnvSenderConfig, source: string): Promise<Sender> {
  const existing = await prisma.sender.findUnique({ where: { email: config.email } });
  if (existing?.userId) {
    logger.warn(
      { email: config.email },
      'Sender email already belongs to a user; environment sender was not applied',
    );
    return existing;
  }

  const data = {
    name: config.name,
    email: config.email,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure,
    smtpUser: config.smtpUser,
    smtpPassEncrypted: encryptSecret(config.smtpPass),
    isActive: true,
    isShared: true,
    userId: null,
  };

  const sender = existing
    ? await prisma.sender.update({ where: { id: existing.id }, data })
    : await prisma.sender.create({ data });

  logger.info({ senderId: sender.id, email: sender.email, source }, 'Shared sender ready');
  return sender;
}

/**
 * Seeds shared SMTP senders from SENDER_N_* environment variables. If no sender
 * is configured and USE_ETHEREAL_FALLBACK=true, a real Ethereal test account is
 * created through Nodemailer (no credentials are hardcoded).
 */
export async function syncSendersFromEnv(): Promise<void> {
  for (let index = 1; index <= env.SENDER_COUNT; index += 1) {
    const config = readEnvSender(index);
    if (config) await upsertSharedSender(config, `env:SENDER_${index}`);
  }

  const activeSenders = await prisma.sender.count({ where: { isActive: true, isShared: true } });
  if (activeSenders > 0 || !env.USE_ETHEREAL_FALLBACK) return;

  try {
    const account = await nodemailer.createTestAccount();
    await upsertSharedSender(
      {
        name: 'Ethereal Sandbox',
        email: account.user,
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        smtpSecure: account.smtp.secure,
        smtpUser: account.user,
        smtpPass: account.pass,
      },
      'ethereal-fallback',
    );
    logger.info(
      { previewUrl: 'https://ethereal.email' },
      'Created Ethereal test sender. Emails sent through it expose preview URLs.',
    );
  } catch (error) {
    logger.warn({ err: error }, 'Could not create Ethereal fallback sender');
  }
}

export function toSmtpSender(sender: Sender): SmtpSender {
  return {
    id: sender.id,
    name: sender.name,
    email: sender.email,
    smtpHost: sender.smtpHost,
    smtpPort: sender.smtpPort,
    smtpSecure: sender.smtpSecure,
    smtpUser: sender.smtpUser,
    smtpPass: decryptSecret(sender.smtpPassEncrypted),
  };
}

export async function listSendersForUser(userId: string): Promise<Sender[]> {
  return prisma.sender.findMany({
    where: {
      isActive: true,
      OR: [{ userId }, { isShared: true }],
    },
    orderBy: [{ isShared: 'asc' }, { name: 'asc' }],
  });
}

export async function getUsableSender(userId: string, senderId: string): Promise<Sender> {
  const sender = await prisma.sender.findUnique({ where: { id: senderId } });
  if (!sender || !sender.isActive) throw new NotFoundError('Sender not found or inactive');
  if (!sender.isShared && sender.userId !== userId) {
    throw new ForbiddenError('This sender does not belong to you');
  }
  return sender;
}

export async function createSenderForUser(userId: string, input: unknown): Promise<Sender> {
  const data = createSenderSchema.parse(input);
  const existing = await prisma.sender.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) throw new ConflictError('A sender with this email already exists');

  return prisma.sender.create({
    data: {
      userId,
      name: data.name,
      email: data.email.toLowerCase(),
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpSecure: data.smtpSecure,
      smtpUser: data.smtpUser,
      smtpPassEncrypted: encryptSecret(data.smtpPass),
      isShared: false,
      isActive: true,
    },
  });
}

export async function updateSenderForUser(userId: string, senderId: string, input: unknown): Promise<Sender> {
  const data = updateSenderSchema.parse(input);
  const sender = await prisma.sender.findUnique({ where: { id: senderId } });
  if (!sender) throw new NotFoundError('Sender not found');
  if (sender.userId !== userId) throw new ForbiddenError('Only the owner can edit this sender');

  return prisma.sender.update({
    where: { id: senderId },
    data: {
      name: data.name,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpSecure: data.smtpSecure,
      smtpUser: data.smtpUser,
      isActive: data.isActive,
      ...(data.smtpPass ? { smtpPassEncrypted: encryptSecret(data.smtpPass) } : {}),
    },
  });
}

/** Never expose encrypted passwords or SMTP internals to the browser. */
export function publicSender(sender: Sender) {
  return {
    id: sender.id,
    name: sender.name,
    email: sender.email,
    isShared: sender.isShared,
    isActive: sender.isActive,
    smtpHost: sender.isShared ? undefined : sender.smtpHost,
    smtpPort: sender.isShared ? undefined : sender.smtpPort,
    smtpSecure: sender.isShared ? undefined : sender.smtpSecure,
    createdAt: sender.createdAt,
  };
}
