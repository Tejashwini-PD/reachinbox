import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { getUserId, requireAuth } from '../../middleware/auth';
import { validateQuery } from '../../middleware/validate';
import { searchEmailsQuerySchema, type SearchEmailsQuery } from '../emails/email.schemas';
import { reindexEmails, searchEmails } from './search.service';

export const searchRouter = Router();

searchRouter.use(requireAuth);

searchRouter.get(
  '/emails',
  validateQuery(searchEmailsQuerySchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const result = await searchEmails(userId, res.locals.query as SearchEmailsQuery);
    res.json(result);
  }),
);

searchRouter.post(
  '/reindex',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const result = await reindexEmails({ userId });
    res.json(result);
  }),
);
