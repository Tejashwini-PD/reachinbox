import { env } from '../config/env';

/** Prevents open redirects by only allowing the configured frontend origin. */
export function safeReturnTo(value: unknown, fallbackPath = '/dashboard'): string {
  const fallback = `${env.FRONTEND_URL}${fallbackPath}`;
  if (typeof value !== 'string' || !value) return fallback;

  try {
    const target = new URL(value);
    const frontend = new URL(env.FRONTEND_URL);
    if (target.origin === frontend.origin) return target.toString();
  } catch {
    // Relative paths are allowed as well.
    if (value.startsWith('/') && !value.startsWith('//')) return `${env.FRONTEND_URL}${value}`;
  }
  return fallback;
}

export function appendQuery(url: string, params: Record<string, string>): string {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return target.toString();
}
