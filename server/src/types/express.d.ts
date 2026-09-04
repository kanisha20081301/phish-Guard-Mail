import type { AuthenticatedUser } from '../shared/types.js';

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedUser;
    }
  }
}

export {};
