import type { OAuthConnection } from '@prisma/client';
import { env, slackOAuthConfigured } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { encryptSecret, decryptSecret } from '../../lib/crypto';
import { postSlackMessage, isSlackTokenRevoked, type SlackOAuthResult } from '../../integrations/slack';

export async function saveSlackConnection(
  userId: string,
  oauth: SlackOAuthResult,
): Promise<OAuthConnection> {
  const metadata = {
    teamId: oauth.teamId,
    teamName: oauth.teamName,
    botUserId: oauth.botUserId,
    authedUserId: oauth.authedUserId,
  };

  return prisma.oAuthConnection.upsert({
    where: { userId_provider: { userId, provider: 'SLACK' } },
    create: {
      userId,
      provider: 'SLACK',
      providerAccountId: oauth.teamId,
      accessTokenEncrypted: encryptSecret(oauth.accessToken),
      tokenType: oauth.tokenType,
      scope: oauth.scope,
      status: 'CONNECTED',
      metadata,
    },
    update: {
      providerAccountId: oauth.teamId,
      accessTokenEncrypted: encryptSecret(oauth.accessToken),
      tokenType: oauth.tokenType,
      scope: oauth.scope,
      status: 'CONNECTED',
      metadata,
    },
  });
}

export async function getSlackStatus(userId: string) {
  const connection = await prisma.oAuthConnection.findUnique({
    where: { userId_provider: { userId, provider: 'SLACK' } },
  });

  if (!connection) {
    return { configured: slackOAuthConfigured, connected: false, status: 'NOT_CONNECTED' as const };
  }

  const metadata = (connection.metadata ?? {}) as Record<string, unknown>;
  return {
    configured: slackOAuthConfigured,
    connected: connection.status === 'CONNECTED',
    status: connection.status,
    teamId: metadata.teamId ?? connection.providerAccountId,
    teamName: metadata.teamName ?? null,
    scope: connection.scope,
    connectedAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    notificationChannelConfigured: Boolean(env.SLACK_NOTIFICATION_CHANNEL_ID),
  };
}

export async function disconnectSlack(userId: string) {
  const connection = await prisma.oAuthConnection.findUnique({
    where: { userId_provider: { userId, provider: 'SLACK' } },
  });
  if (!connection) return { disconnected: false };

  await prisma.oAuthConnection.update({
    where: { id: connection.id },
    data: { status: 'REVOKED' },
  });
  return { disconnected: true };
}

/**
 * Posts a real Slack message when a sender hits its hourly limit. Missing or
 * revoked connections are ignored; a revoked token updates the stored status.
 */
export async function notifyHourlyLimitReached(params: {
  userId: string;
  senderEmail: string;
  hourlyLimit: number;
}): Promise<void> {
  if (!env.SLACK_NOTIFICATION_CHANNEL_ID) {
    logger.info('Slack hourly-limit alert skipped: SLACK_NOTIFICATION_CHANNEL_ID is not set');
    return;
  }

  const connection = await prisma.oAuthConnection.findUnique({
    where: { userId_provider: { userId: params.userId, provider: 'SLACK' } },
  });
  if (!connection || connection.status !== 'CONNECTED') return;

  let token: string;
  try {
    token = decryptSecret(connection.accessTokenEncrypted);
  } catch (error) {
    logger.warn({ err: error, userId: params.userId }, 'Could not decrypt Slack token');
    return;
  }

  const text = [
    ':warning: *ReachInbox hourly send limit reached*',
    `Sender: ${params.senderEmail}`,
    `Limit: ${params.hourlyLimit} emails/hour`,
    'Queued emails will be automatically rescheduled, not dropped.',
  ].join('\n');

  const result = await postSlackMessage(token, env.SLACK_NOTIFICATION_CHANNEL_ID, text);

  if (!result.ok && isSlackTokenRevoked(result.error)) {
    await prisma.oAuthConnection
      .update({ where: { id: connection.id }, data: { status: 'REVOKED' } })
      .catch(() => undefined);
    logger.warn({ userId: params.userId, error: result.error }, 'Slack connection marked revoked');
  }
}
