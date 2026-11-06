import { OAuth2Client } from 'google-auth-library';
import { env, googleOAuthConfigured } from '../config/env';
import { AppError, ServiceUnavailableError } from '../lib/errors';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string | null;
  picture: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
}

export function assertGoogleConfigured(): void {
  if (!googleOAuthConfigured) {
    throw new ServiceUnavailableError(
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
    );
  }
}

function createClient(): OAuth2Client {
  return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

export function buildGoogleAuthorizeUrl(state: string): string {
  assertGoogleConfigured();
  return createClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: ['openid', 'email', 'profile'],
    state,
  });
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  assertGoogleConfigured();
  const client = createClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.id_token) {
    throw new AppError(502, 'Google did not return an ID token', 'GOOGLE_OAUTH_FAILED');
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email) {
    throw new AppError(502, 'Google profile is missing required fields', 'GOOGLE_OAUTH_FAILED');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scope: tokens.scope ?? null,
  };
}
