import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { loginSchema, registerSchema } from './auth.schemas.js';
import { authenticateUser, getUserById, registerUser } from './auth.service.js';
import {
  getGoogleAuthUrl,
  handleGoogleCallback,
  isGoogleOAuthConfigured,
} from './google.service.js';
import { requireAuthentication } from '../../middleware/auth.middleware.js';
import { environment } from '../../config/environment.js';
import { database } from '../../infrastructure/database.js';

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 15 * 60 * 1000,
  path: '/',
};

router.post('/register', authLimiter, async (request, response, next) => {
  try {
    const result = await registerUser(registerSchema.parse(request.body));
    response
      .cookie('phishguard_access', result.token, cookieOptions)
      .status(201)
      .json({ user: result.user });
  } catch (error) {
    next(error);
  }
});

router.post('/login', authLimiter, async (request, response, next) => {
  try {
    const result = await authenticateUser(loginSchema.parse(request.body));
    response.cookie('phishguard_access', result.token, cookieOptions).json({ user: result.user });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (_request, response) =>
  response
    .clearCookie('phishguard_access', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })
    .status(204)
    .send(),
);

router.get('/me', requireAuthentication, async (request, response, next) => {
  try {
    const user = await getUserById(request.authenticatedUser!.id);
    if (!user) {
      response.status(401).json({ error: 'User no longer exists' });
      return;
    }
    response.json({ user });
  } catch (error) {
    next(error);
  }
});

router.get('/google/status', (_request, response) => {
  const configured = isGoogleOAuthConfigured();
  response.json({
    configured,
    authUrl: configured ? getGoogleAuthUrl() : null,
  });
});

router.get('/google/login', (_request, response) => {
  if (!isGoogleOAuthConfigured()) {
    response.status(400).json({
      error:
        'Google OAuth credentials not configured in server/.env (GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET).',
    });
    return;
  }
  response.redirect(getGoogleAuthUrl());
});

router.get('/google/callback', async (request, response, next) => {
  const code = String(request.query.code ?? '');
  if (!code) {
    response.redirect(`${environment.CLIENT_ORIGIN}/?error=Missing+Google+authorization+code`);
    return;
  }
  try {
    const result = await handleGoogleCallback(code);
    response
      .cookie('phishguard_access', result.token, cookieOptions)
      .redirect(`${environment.CLIENT_ORIGIN}/`);
  } catch (error) {
    next(error);
  }
});

router.post('/google/quick-connect', authLimiter, async (request, response, next) => {
  try {
    const email = String(request.body.email || '')
      .trim()
      .toLowerCase();
    if (!email || !email.includes('@')) {
      response.status(400).json({ error: 'Please provide a valid Google email address.' });
      return;
    }
    const displayName = String(
      request.body.displayName || email.split('@')[0] || 'Google User',
    ).trim();

    let user = await database.user.findUnique({ where: { email } });
    if (!user) {
      user = await database.user.create({
        data: {
          email,
          displayName,
          passwordHash: null,
        },
      });
      await database.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_REGISTERED_GMAIL_DIRECT',
          entity: 'User',
          entityId: user.id,
        },
      });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      environment.SESSION_SECRET,
      { expiresIn: '15m' },
    );

    response.cookie('phishguard_access', token, cookieOptions).json({
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    });
  } catch (error) {
    next(error);
  }
});

export { router as authRouter };
