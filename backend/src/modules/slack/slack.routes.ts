import { Router } from 'express';
import { env } from '../../config/env';
import { asyncHandler } from '../../lib/asyncHandler';
import { getUserId, requireAuth } from '../../middleware/auth';
import { logger } from '../../lib/logger';
import { consumeOAuthState, createOAuthState } from '../../lib/oauthState';
import { appendQuery, safeReturnTo } from '../../lib/urls';
import {
  assertSlackConfigured,
  buildSlackAuthorizeUrl,
  exchangeSlackCode,
} from '../../integrations/slack';
import { disconnectSlack, getSlackStatus, saveSlackConnection } from './slack.service';

export const slackRouter = Router();

slackRouter.get(
  '/connect',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertSlackConfigured();
    const userId = getUserId(req);
    const returnTo = safeReturnTo(req.query.returnTo, '/settings');
    const state = await createOAuthState('slack', { userId, returnTo });
    res.redirect(buildSlackAuthorizeUrl(state));
  }),
);

slackRouter.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const statePayload = await consumeOAuthState('slack', state);

    if (!statePayload?.userId || !code) {
      res.redirect(
        appendQuery(`${env.FRONTEND_URL}/settings`, {
          slack: 'error',
          reason: 'invalid_state',
        }),
      );
      return;
    }

    try {
      const oauth = await exchangeSlackCode(code);
      await saveSlackConnection(statePayload.userId, oauth);
      res.redirect(
        appendQuery(safeReturnTo(statePayload.returnTo, '/settings'), { slack: 'connected' }),
      );
    } catch (error) {
      logger.error({ err: error, userId: statePayload.userId }, 'Slack OAuth callback failed');
      res.redirect(
        appendQuery(safeReturnTo(statePayload.returnTo, '/settings'), {
          slack: 'error',
          reason: 'oauth_failed',
        }),
      );
    }
  }),
);

slackRouter.get(
  '/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = await getSlackStatus(getUserId(req));
    res.json(status);
  }),
);

slackRouter.post(
  '/disconnect',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await disconnectSlack(getUserId(req));
    res.json(result);
  }),
);
