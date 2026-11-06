import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env, isProduction } from './config/env';
import { logger } from './lib/logger';
import { redis } from './lib/redis';
import { RedisSessionStore } from './lib/sessionStore';
import { SESSION_COOKIE_NAME } from './lib/constants';
import { emailQueue } from './modules/queue/queue';
import { authRouter } from './modules/auth/auth.routes';
import { emailRouter } from './modules/emails/email.routes';
import { senderRouter } from './modules/senders/sender.routes';
import { searchRouter } from './modules/search/search.routes';
import { slackRouter } from './modules/slack/slack.routes';
import { healthRouter } from './modules/health/health.routes';
import { errorHandler, notFoundHandler } from './middleware/error';

export function createApp() {
  const app = express();

  if (isProduction) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );

  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      secret: env.SESSION_SECRET,
      store: new RedisSessionStore(redis),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: 'lax',
        maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
        path: '/',
      },
    }),
  );

  app.get('/', (_req, res) => {
    res.json({
      name: 'ReachInbox Email Scheduler API',
      docs: '/api/health',
      queueDashboard: '/admin/queues',
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/emails', emailRouter);
  app.use('/api/senders', senderRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/slack', slackRouter);
  app.use('/api/health', healthRouter);

  // BullMQ dashboard. Prefer HTTP Basic credentials in production; otherwise
  // require a valid ReachInbox session cookie.
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');
  createBullBoard({
    queues: [new BullMQAdapter(emailQueue)],
    serverAdapter,
  });
  app.use('/admin/queues', queueDashboardAuth, serverAdapter.getRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function queueDashboardAuth(req: Request, res: Response, next: NextFunction): void {
  if (env.QUEUE_DASHBOARD_USER && env.QUEUE_DASHBOARD_PASSWORD) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="ReachInbox Queue Dashboard"');
      res.status(401).send('Authentication required');
      return;
    }
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    const username = separator >= 0 ? decoded.slice(0, separator) : decoded;
    const password = separator >= 0 ? decoded.slice(separator + 1) : '';
    if (
      safeEqual(username, env.QUEUE_DASHBOARD_USER) &&
      safeEqual(password, env.QUEUE_DASHBOARD_PASSWORD)
    ) {
      next();
      return;
    }
    res.status(401).send('Invalid queue dashboard credentials');
    return;
  }

  if (!req.session?.userId) {
    res.status(401).send('Login required to view the queue dashboard');
    return;
  }
  next();
}
