import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { database } from '../../infrastructure/database.js';
import { environment } from '../../config/environment.js';

const passwordRounds = 12;
const publicUserSelect = { id: true, email: true, displayName: true, role: true } as const;

type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
};

export class AuthenticationError extends Error {}
export class ConflictError extends Error {}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const existingUser = await database.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) throw new ConflictError('An account with that email already exists');

  const passwordHash = await bcrypt.hash(input.password, passwordRounds);
  const user = await database.user.create({
    data: { email, displayName: input.displayName.trim(), passwordHash },
    select: publicUserSelect,
  });
  await database.auditLog.create({
    data: { userId: user.id, action: 'USER_REGISTERED', entity: 'User', entityId: user.id },
  });
  return { token: createToken(user), user };
}

export async function authenticateUser(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const user = await database.user.findUnique({ where: { email } });
  const validPassword = user?.passwordHash
    ? await bcrypt.compare(input.password, user.passwordHash)
    : false;
  if (!user || !validPassword) throw new AuthenticationError('Invalid email or password');

  await database.auditLog.create({
    data: { userId: user.id, action: 'USER_SIGNED_IN', entity: 'User', entityId: user.id },
  });
  return { token: createToken(user), user: toPublicUser(user) };
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  return database.user.findUnique({ where: { id }, select: publicUserSelect });
}

function createToken(user: { id: string; email: string; role: UserRole }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    environment.SESSION_SECRET,
    { expiresIn: '15m' },
  );
}

function toPublicUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}): PublicUser {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}
