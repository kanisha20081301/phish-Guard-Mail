import { Queue } from 'bullmq';
import { workerConnection } from './cache.js';

export interface ScanJob {
  scanId: string;
  userId: string;
  mailboxId: string;
}

export const scanQueue = new Queue<ScanJob>('phishguard-email-scans', {
  connection: workerConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
