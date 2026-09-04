import type { ErrorRequestHandler } from 'express';
import { AuthenticationError, ConflictError } from '../modules/auth/auth.service.js';
import { MailboxNotFoundError } from '../modules/analysis/analysis.service.js';
import { ScanMailboxNotFoundError } from '../modules/analysis/scan.service.js';
import { RoleUpdateConflictError } from '../modules/admin/admin.service.js';
import { ZodError } from 'zod';

export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  void next;
  if (error instanceof AuthenticationError) {
    response.status(401).json({ error: error.message });
    return;
  }
  if (error instanceof ConflictError) {
    response.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof MailboxNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof ScanMailboxNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof RoleUpdateConflictError) {
    response.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof ZodError) {
    response
      .status(400)
      .json({ error: 'Request validation failed', details: error.flatten().fieldErrors });
    return;
  }
  if (error && typeof error === 'object' && 'status' in error && error.status === 400) {
    response.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }
  console.error(error);
  response.status(500).json({ error: 'Internal server error' });
};
