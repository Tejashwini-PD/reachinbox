import session from 'express-session';
import type Redis from 'ioredis';
import { env } from '../config/env';

/**
 * Small Redis-backed express-session store. Keeping it in-house avoids a second
 * Redis client dependency and makes the behaviour easy to inspect.
 */
export class RedisSessionStore extends session.Store {
  private readonly prefix = 'reachinbox:sess:';
  private readonly defaultTtlSeconds = env.SESSION_TTL_HOURS * 60 * 60;

  constructor(private readonly client: Redis) {
    super();
  }

  private key(sid: string): string {
    return `${this.prefix}${sid}`;
  }

  private ttlFor(sess: session.SessionData): number {
    const expires = sess.cookie?.expires;
    if (expires) {
      const seconds = Math.floor((new Date(expires).getTime() - Date.now()) / 1000);
      if (seconds > 0) return seconds;
    }
    return this.defaultTtlSeconds;
  }

  get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void): void {
    this.client
      .get(this.key(sid))
      .then((value) => {
        if (!value) return callback(null, null);
        try {
          callback(null, JSON.parse(value) as session.SessionData);
        } catch {
          callback(null, null);
        }
      })
      .catch((error) => callback(error));
  }

  set(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void): void {
    const ttl = this.ttlFor(sess);
    this.client
      .set(this.key(sid), JSON.stringify(sess), 'EX', ttl)
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    this.client
      .del(this.key(sid))
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }

  touch(sid: string, sess: session.SessionData, callback?: () => void): void {
    this.client
      .expire(this.key(sid), this.ttlFor(sess))
      .then(() => callback?.())
      .catch(() => callback?.());
  }
}
