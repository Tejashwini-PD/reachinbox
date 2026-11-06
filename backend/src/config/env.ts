import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanEnv = (defaultValue: boolean) =>
  z
    .preprocess((value) => {
      if (value === undefined || value === '') return defaultValue;
      if (typeof value === 'boolean') return value;
      return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
    }, z.boolean())
    .default(defaultValue);

const intEnv = (defaultValue: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .preprocess((value) => {
      if (value === undefined || value === '') return defaultValue;
      return Number(value);
    }, z.number().int().min(min).max(max))
    .default(defaultValue);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intEnv(4000, 1, 65535),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  BACKEND_URL: z.string().url().default('http://localhost:4000'),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z
    .string()
    .default('postgresql://reachinbox:reachinbox@localhost:5432/reachinbox?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),
  ELASTICSEARCH_EMAILS_INDEX: z.string().default('reachinbox-emails'),

  SESSION_SECRET: z.string().min(16).default('dev-only-session-secret-change-me'),
  ENCRYPTION_KEY: z.string().optional(),
  SESSION_TTL_HOURS: intEnv(168, 1, 24 * 365),
  COOKIE_SECURE: booleanEnv(false),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z
    .string()
    .url()
    .default('http://localhost:4000/api/auth/google/callback'),

  SLACK_CLIENT_ID: z.string().optional().default(''),
  SLACK_CLIENT_SECRET: z.string().optional().default(''),
  SLACK_REDIRECT_URI: z.string().url().default('http://localhost:4000/api/slack/callback'),
  SLACK_NOTIFICATION_CHANNEL_ID: z.string().optional().default(''),

  WORKER_CONCURRENCY: intEnv(2, 1, 100),
  MIN_DELAY_BETWEEN_EMAILS_MS: intEnv(1000, 0, 60 * 60 * 1000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: intEnv(100, 1, 1_000_000),
  MAX_EMAIL_ATTEMPTS: intEnv(3, 1, 10),
  STALE_PROCESSING_MINUTES: intEnv(10, 1, 24 * 60),

  QUEUE_DASHBOARD_USER: z.string().optional().default(''),
  QUEUE_DASHBOARD_PASSWORD: z.string().optional().default(''),

  SENDER_COUNT: intEnv(0, 0, 50),
  USE_ETHEREAL_FALLBACK: booleanEnv(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast on invalid configuration so the app never runs half-configured.
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const googleOAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const slackOAuthConfigured = Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);

if (isProduction && env.SESSION_SECRET === 'dev-only-session-secret-change-me') {
  console.warn('WARNING: SESSION_SECRET is still the development default. Change it before deploying.');
}
if (isProduction && !env.ENCRYPTION_KEY) {
  console.warn('WARNING: ENCRYPTION_KEY is not set. A key derived from SESSION_SECRET will be used.');
}
