import './config/load-environment.js';
import { Worker } from 'bullmq';
import { database } from './infrastructure/database.js';
import { workerConnection } from './infrastructure/cache.js';
import { detectEmail } from './modules/analysis/detection.engine.js';
import type { ScanJob } from './infrastructure/scan.queue.js';

const worker = new Worker<ScanJob>(
  'phishguard-email-scans',
  async (job) => {
    const scan = await database.scan.findUnique({
      where: { id: job.data.scanId },
      include: { mailbox: true },
    });
    if (!scan || scan.mailbox.userId !== job.data.userId)
      throw new Error('Scan ownership check failed');
    await database.scan.update({
      where: { id: scan.id },
      data: { status: 'PROCESSING', startedAt: new Date(), error: null },
    });
    try {
      const emails = await database.email.findMany({
        where: { mailboxId: scan.mailboxId },
        select: { id: true, sender: true, subject: true, bodyText: true },
        take: 500,
      });
      for (const email of emails) {
        const detection = detectEmail(email);
        const analysis = await database.emailAnalysis.create({
          data: {
            emailId: email.id,
            scanId: scan.id,
            userId: job.data.userId,
            category: detection.category,
            riskLevel: detection.riskLevel,
            score: detection.score,
            reasons: detection.reasons,
            modelName: detection.modelName,
          },
        });
        if (detection.riskLevel === 'HIGH' || detection.riskLevel === 'CRITICAL')
          await database.alert.create({
            data: {
              userId: job.data.userId,
              analysisId: analysis.id,
              title: `${detection.riskLevel} risk email detected`,
            },
          });
      }
      await database.$transaction([
        database.scan.update({
          where: { id: scan.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        }),
        database.mailbox.update({
          where: { id: scan.mailboxId },
          data: { lastScannedAt: new Date() },
        }),
      ]);
    } catch (error) {
      await database.scan.update({
        where: { id: scan.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error: error instanceof Error ? error.message : 'Scan failed',
        },
      });
      throw error;
    }
  },
  { connection: workerConnection, concurrency: 2 },
);

worker.on('completed', (job) => console.log(`Scan ${job.data.scanId} completed`));
worker.on('failed', (job, error) =>
  console.error(`Scan ${job?.data.scanId ?? 'unknown'} failed`, error),
);
