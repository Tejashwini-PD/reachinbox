import { randomState } from './crypto';
import { redis } from './redis';

export interface OAuthStatePayload {
  userId?: string;
  returnTo?: string;
}

const TTL_SECONDS = 10 * 60;

function stateKey(provider: string, state: string): string {
  return `reachinbox:oauth:state:${provider}:${state}`;
}

export async function createOAuthState(
  provider: 'google' | 'slack',
  payload: OAuthStatePayload,
): Promise<string> {
  const state = randomState();
  await redis.set(stateKey(provider, state), JSON.stringify(payload), 'EX', TTL_SECONDS);
  return state;
}

/** One-time state consumption prevents OAuth CSRF and replay attacks. */
export async function consumeOAuthState(
  provider: 'google' | 'slack',
  state: string,
): Promise<OAuthStatePayload | null> {
  if (!state) return null;
  const key = stateKey(provider, state);
  const value = await redis.getdel(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as OAuthStatePayload;
  } catch {
    return null;
  }
}
