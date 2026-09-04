import { z } from 'zod';

export const createAnalysisSchema = z
  .object({
    mailboxId: z.string().uuid().optional(),
    providerId: z.string().max(255).optional(),
    sender: z.string().email().max(320).optional(),
    recipient: z.string().email().max(320).optional(),
    subject: z.string().max(998).optional(),
    bodyText: z.string().max(1_000_000).optional(),
    rawEmail: z.string().max(2_000_000).optional(),
    receivedAt: z.string().datetime().optional(),
  })
  .refine(
    (value) =>
      Boolean(value.rawEmail) ||
      Boolean(value.sender && value.recipient && value.subject && value.bodyText),
    { message: 'Provide rawEmail or sender, recipient, subject, and bodyText' },
  );
