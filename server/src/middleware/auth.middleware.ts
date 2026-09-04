import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { environment } from '../config/environment.js';
import type { AuthenticatedUser } from '../shared/types.js';

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const pair = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}

export function requireAuthentication(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const token = readCookie(request, 'phishguard_access');
  if (!token) {
    response.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, environment.SESSION_SECRET);
    if (
      typeof payload === 'string' ||
      !payload.sub ||
      typeof payload.email !== 'string' ||
      typeof payload.role !== 'string'
    )
      throw new Error('Invalid token');
    request.authenticatedUser = {
      id: payload.sub,
      email: payload.email,
      role: payload.role as AuthenticatedUser['role'],
    };
    next();
  } catch {
    response.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requireRole(...roles: AuthenticatedUser['role'][]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.authenticatedUser || !roles.includes(request.authenticatedUser.role)) {
      response.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
