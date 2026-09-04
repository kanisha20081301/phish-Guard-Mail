import { database } from '../../infrastructure/database.js';
import { getOrCreateUserMailbox, syncAndScanUserMailbox } from '../analysis/analysis.service.js';

export async function getDashboard(userId: string) {
  const mailboxId = await getOrCreateUserMailbox(userId);
  const emailCount = await database.email.count({ where: { mailboxId } });
  if (emailCount === 0) {
    await syncAndScanUserMailbox(userId);
  }

  const [mailbox, analyses, threatsStopped, openAlerts, recentThreats, inboxEmails] =
    await Promise.all([
      database.mailbox.findUnique({
        where: { id: mailboxId },
        select: {
          id: true,
          provider: true,
          providerUser: true,
          connectedAt: true,
          lastScannedAt: true,
        },
      }),
      database.emailAnalysis.findMany({
        where: { userId },
        select: { category: true, riskLevel: true },
      }),
      database.emailAnalysis.count({ where: { userId, riskLevel: { in: ['HIGH', 'CRITICAL'] } } }),
      database.alert.count({ where: { userId, status: 'OPEN' } }),
      database.emailAnalysis.findMany({
        where: { userId, riskLevel: { in: ['HIGH', 'CRITICAL', 'MEDIUM'] } },
        orderBy: { analyzedAt: 'desc' },
        take: 10,
        include: { email: { select: { sender: true, subject: true, receivedAt: true } } },
      }),
      database.email.findMany({
        where: { mailboxId },
        include: {
          analyses: {
            where: { userId },
            select: {
              id: true,
              category: true,
              riskLevel: true,
              score: true,
              reasons: true,
              modelName: true,
              analyzedAt: true,
            },
          },
        },
        orderBy: { receivedAt: 'desc' },
        take: 50,
      }),
    ]);

  const total = analyses.length;
  const categoryCounts = analyses.reduce<Record<string, number>>((counts, analysis) => {
    counts[analysis.category] = (counts[analysis.category] ?? 0) + 1;
    return counts;
  }, {});
  const safeCount = categoryCounts.SAFE ?? 0;
  const healthScore = total === 0 ? 100 : Math.max(0, Math.round((safeCount / total) * 100));

  const criticalCount = analyses.filter((a) => a.riskLevel === 'CRITICAL').length;
  const highCount = analyses.filter((a) => a.riskLevel === 'HIGH').length;
  const threatLevel =
    criticalCount > 0
      ? 'CRITICAL_RISK'
      : highCount > 0
        ? 'HIGH_RISK'
        : (categoryCounts.SPAM ?? 0) > 0
          ? 'MODERATE_RISK'
          : 'SECURE';

  return {
    healthScore,
    threatLevel,
    scanned: total,
    threatsStopped,
    openAlerts,
    categories: Object.fromEntries(
      Object.entries(categoryCounts).map(([category, count]) => [
        category.toLowerCase(),
        total === 0 ? 0 : Math.round((count / total) * 100),
      ]),
    ),
    recentThreats,
    defaultMailboxId: mailboxId,
    mailbox: mailbox ?? {
      id: mailboxId,
      provider: 'GMAIL',
      providerUser: 'Connected Account',
      connectedAt: new Date(),
      lastScannedAt: new Date(),
    },
    inboxMessages: inboxEmails.map((email) => ({
      id: email.id,
      sender: email.sender,
      recipient: email.recipient,
      subject: email.subject,
      bodyText: email.bodyText,
      receivedAt: email.receivedAt,
      analysis: email.analyses[0] ?? null,
    })),
  };
}
