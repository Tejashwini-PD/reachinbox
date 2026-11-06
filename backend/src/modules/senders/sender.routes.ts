import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { getUserId, requireAuth } from '../../middleware/auth';
import { validateBody, validateParams } from '../../middleware/validate';
import {
  createSenderSchema,
  senderIdParamsSchema,
  updateSenderSchema,
} from '../emails/email.schemas';
import {
  createSenderForUser,
  listSendersForUser,
  publicSender,
  updateSenderForUser,
} from './sender.service';

export const senderRouter = Router();

senderRouter.use(requireAuth);

senderRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const senders = await listSendersForUser(userId);
    res.json({ items: senders.map(publicSender) });
  }),
);

senderRouter.post(
  '/',
  validateBody(createSenderSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const sender = await createSenderForUser(userId, req.body);
    res.status(201).json({ sender: publicSender(sender) });
  }),
);

senderRouter.patch(
  '/:id',
  validateParams(senderIdParamsSchema),
  validateBody(updateSenderSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const sender = await updateSenderForUser(userId, req.params.id, req.body);
    res.json({ sender: publicSender(sender) });
  }),
);
