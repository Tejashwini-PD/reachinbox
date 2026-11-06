import { env, slackOAuthConfigured } from '../config/env';
import { AppError, ServiceUnavailableError } from '../lib/errors';
import { logger } from '../lib/logger';

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_OAUTH_ACCESS_URL = 'https://slack.com/api/oauth.v2.access';
const SLACK_CHAT_POST_URL = 'https://slack.com/api/chat.postMessage';
const SLACK_SCOPES = ['chat:write', 'team:read'];

export interface SlackOAuthResult {
  accessToken: string;
  tokenType: string;
  scope: string;
  botUserId: string | null;
  teamId: string;
  teamName: string;
  authedUserId: string | null;
}

export function assertSlackConfigured(): void {
  if (!slackOAuthConfigured) {
    throw new ServiceUnavailableError(
      'Slack OAuth is not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.',
    );
  }
}

export function buildSlackAuthorizeUrl(state: string): string {
  assertSlackConfigured();
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: SLACK_SCOPES.join(','),
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
  });
  return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeSlackCode(code: string): Promise<SlackOAuthResult> {
  assertSlackConfigured();

  const body = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    client_secret: env.SLACK_CLIENT_SECRET,
    code,
    redirect_uri: env.SLACK_REDIRECT_URI,
  });

  const response = await fetch(SLACK_OAUTH_ACCESS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  const data = (await response.json()) as {
    ok: boolean;
    error?: string;
    access_token?: string;
    token_type?: string;
    scope?: string;
    bot_user_id?: string;
    team?: { id?: string; name?: string };
    authed_user?: { id?: string };
  };

  if (!response.ok || !data.ok || !data.access_token || !data.team?.id) {
    throw new AppError(
      502,
      `Slack OAuth exchange failed: ${data.error ?? response.statusText}`,
      'SLACK_OAUTH_FAILED',
    );
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type ?? 'bot',
    scope: data.scope ?? SLACK_SCOPES.join(','),
    botUserId: data.bot_user_id ?? null,
    teamId: data.team.id,
    teamName: data.team.name ?? data.team.id,
    authedUserId: data.authed_user?.id ?? null,
  };
}

export interface SlackPostResult {
  ok: boolean;
  error?: string;
  ts?: string;
}

export async function postSlackMessage(
  botToken: string,
  channel: string,
  text: string,
): Promise<SlackPostResult> {
  try {
    const response = await fetch(SLACK_CHAT_POST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, text }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = (await response.json()) as { ok: boolean; error?: string; ts?: string };
    if (!data.ok) {
      logger.warn({ error: data.error }, 'Slack chat.postMessage rejected');
    }
    return data;
  } catch (error) {
    logger.warn({ err: error }, 'Slack chat.postMessage request failed');
    return { ok: false, error: 'request_failed' };
  }
}

export function isSlackTokenRevoked(error?: string): boolean {
  return Boolean(
    error &&
      ['invalid_auth', 'token_revoked', 'account_inactive', 'not_authed', 'missing_scope'].includes(
        error,
      ),
  );
}
