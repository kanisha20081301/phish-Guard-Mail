import { AlertStatus } from '@prisma/client';
import { database } from '../../infrastructure/database.js';

export async function listAlerts(userId: string, status?: AlertStatus) {
  return database.alert.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      analysis: {
        include: {
          email: { select: { sender: true, recipient: true, subject: true, receivedAt: true } },
        },
      },
    },
  });
}

export async function updateAlert(userId: string, alertId: string, status: AlertStatus) {
  const alert = await database.alert.findFirst({
    where: { id: alertId, userId },
    select: { id: true, analysisId: true },
  });
  if (!alert) return null;
  const updated = await database.alert.update({
    where: { id: alert.id },
    data: { status, resolvedAt: status === AlertStatus.RESOLVED ? new Date() : null },
  });
  await database.auditLog.create({
    data: {
      userId,
      action: `ALERT_${status}`,
      entity: 'Alert',
      entityId: alert.id,
      metadata: { analysisId: alert.analysisId },
    },
  });
  return updated;
}
