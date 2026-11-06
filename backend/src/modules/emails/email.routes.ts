import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { getUserId, requireAuth } from '../../middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import {
  emailIdParamsSchema,
  listEmailsQuerySchema,
  scheduleEmailsSchema,
  type ScheduleEmailsInput,
} from './email.schemas';
import {
  cancelEmail,
  getEmailForUser,
  listEmails,
  scheduleEmails,
} from './email.service';

export const emailRouter = Router();

emailRouter.use(requireAuth);

emailRouter.post(
  '/schedule',
  validateBody(scheduleEmailsSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const idempotencyHeader = req.header('Idempotency-Key') ?? undefined;
    const result = await scheduleEmails(
      userId,
      req.body as ScheduleEmailsInput,
      idempotencyHeader,
    );
    res.status(201).json(result);
  }),
);

emailRouter.get(
  '/',
  validateQuery(listEmailsQuerySchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const query = res.locals.query as {
      page: number;
      limit: number;
      status?: import('@prisma/client').EmailStatus;
      campaignId?: string;
      recipient?: string;
    };
    const result = await listEmails(userId, query);
    res.json(result);
  }),
);

emailRouter.get(
  '/scheduled',
  validateQuery(listEmailsQuerySchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const query = res.locals.query as { page: number; limit: number };
    const result = await listEmails(userId, {
      ...query,
      statuses: ['SCHEDULED', 'PENDING'],
    });
    res.json(result);
  }),
);

emailRouter.get(
  '/sent',
  validateQuery(listEmailsQuerySchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const query = res.locals.query as { page: number; limit: number };
    const result = await listEmails(userId, { ...query, status: 'SENT' });
    res.json(result);
  }),
);

emailRouter.get(
  '/failed',
  validateQuery(listEmailsQuerySchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const query = res.locals.query as { page: number; limit: number };
    const result = await listEmails(userId, { ...query, status: 'FAILED' });
    res.json(result);
  }),
);

emailRouter.get(
  '/:id',
  validateParams(emailIdParamsSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const email = await getEmailForUser(userId, req.params.id);
    res.json({ email });
  }),
);

emailRouter.post(
  '/:id/cancel',
  validateParams(emailIdParamsSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const email = await cancelEmail(userId, req.params.id);
    res.json({ email });
  }),
);
