import { Router } from 'express';
import { env, googleOAuthConfigured, slackOAuthConfigured } from '../../config/env';
import { asyncHandler } from '../../lib/asyncHandler';
import { logger } from '../../lib/logger';
import { consumeOAuthState, createOAuthState } from '../../lib/oauthState';
import { appendQuery, safeReturnTo } from '../../lib/urls';
import { SESSION_COOKIE_NAME } from '../../lib/constants';
import {
  assertGoogleConfigured,
  buildGoogleAuthorizeUrl,
  exchangeGoogleCode,
} from '../../integrations/google';
import { getCurrentUser, saveGoogleConnection, upsertGoogleUser } from './auth.service';
import { requireAuth } from '../../middleware/auth';

export const authRouter = Router();

function loginErrorRedirect(reason: string): string {
  return appendQuery(`${env.FRONTEND_URL}/login`, { error: reason });
}

async function establishSession(req: import('express').Request, userId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
  req.session.userId = userId;
  await new Promise<void>((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

authRouter.get('/config', (_req, res) => {
  res.json({
    googleConfigured: googleOAuthConfigured,
    slackConfigured: slackOAuthConfigured,
    frontendUrl: env.FRONTEND_URL,
  });
});

authRouter.get(
  '/google',
  asyncHandler(async (req, res) => {
    assertGoogleConfigured();
    const returnTo = safeReturnTo(req.query.returnTo, '/dashboard');
    const state = await createOAuthState('google', { returnTo });
    res.redirect(buildGoogleAuthorizeUrl(state));
  }),
);

authRouter.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    if (typeof req.query.error === 'string') {
      logger.warn({ error: req.query.error }, 'Google OAuth was denied');
      res.redirect(loginErrorRedirect('google_denied'));
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const statePayload = await consumeOAuthState('google', state);

    if (!statePayload || !code) {
      res.redirect(loginErrorRedirect('invalid_state'));
      return;
    }

    try {
      const profile = await exchangeGoogleCode(code);
      const user = await upsertGoogleUser(profile);
      await saveGoogleConnection(user.id, profile);
      await establishSession(req, user.id);
      res.redirect(safeReturnTo(statePayload.returnTo, '/dashboard'));
    } catch (error) {
      logger.error({ err: error }, 'Google OAuth callback failed');
      res.redirect(loginErrorRedirect('google_oauth_failed'));
    }
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser(req.session.userId as string);
    res.json({ user });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    if (!req.session) {
      res.json({ ok: true });
      return;
    }
    await new Promise<void>((resolve) => {
      req.session.destroy(() => resolve());
    });
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  }),
);
