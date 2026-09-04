import { UserRole } from '@prisma/client';
import { database } from '../../infrastructure/database.js';

export class RoleUpdateConflictError extends Error {}

export async function listUsers(search?: string) {
  return database.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      createdAt: true,
      _count: { select: { mailboxes: true, analyses: true, alerts: true } },
    },
  });
}

export async function updateUserRole(actorId: string, userId: string, role: UserRole) {
  if (actorId === userId && role !== UserRole.ADMIN)
    throw new RoleUpdateConflictError('Admins cannot remove their own admin role');
  const user = await database.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return null;
  const updated = await database.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, email: true, displayName: true, role: true },
  });
  await database.auditLog.create({
    data: {
      userId: actorId,
      action: 'USER_ROLE_UPDATED',
      entity: 'User',
      entityId: userId,
      metadata: { role },
    },
  });
  return updated;
}

export async function listThreats(category?: string, riskLevel?: string) {
  return database.emailAnalysis.findMany({
    where: {
      ...(category ? { category: category as 'SAFE' | 'MARKETING' | 'SPAM' | 'PHISHING' } : {}),
      ...(riskLevel ? { riskLevel: riskLevel as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' } : {}),
    },
    orderBy: { analyzedAt: 'desc' },
    take: 100,
    include: {
      email: { select: { sender: true, recipient: true, subject: true, receivedAt: true } },
      user: { select: { id: true, email: true } },
      alerts: { select: { id: true, status: true, title: true } },
    },
  });
}

export async function listAuditLogs() {
  return database.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { email: true } } },
  });
}
