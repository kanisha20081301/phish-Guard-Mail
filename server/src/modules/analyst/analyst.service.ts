import { database } from '../../infrastructure/database.js';

export async function getThreatSummary() {
  const [total, phishing, spam, openAlerts, recent] = await Promise.all([
    database.emailAnalysis.count(),
    database.emailAnalysis.count({ where: { category: 'PHISHING' } }),
    database.emailAnalysis.count({ where: { category: 'SPAM' } }),
    database.alert.count({ where: { status: 'OPEN' } }),
    database.emailAnalysis.findMany({
      orderBy: { analyzedAt: 'desc' },
      take: 50,
      include: {
        email: { select: { sender: true, recipient: true, subject: true, receivedAt: true } },
        user: { select: { email: true } },
      },
    }),
  ]);
  return { total, phishing, spam, openAlerts, recent };
}

export async function investigateThreat(analysisId: string) {
  return database.emailAnalysis.findUnique({
    where: { id: analysisId },
    include: {
      email: true,
      alerts: true,
      user: { select: { id: true, email: true, displayName: true } },
      scan: true,
    },
  });
}
