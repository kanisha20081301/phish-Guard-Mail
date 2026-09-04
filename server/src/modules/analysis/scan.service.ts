import { database } from '../../infrastructure/database.js';
import { scanQueue } from '../../infrastructure/scan.queue.js';

export class ScanMailboxNotFoundError extends Error {}

export async function enqueueScan(userId: string, mailboxId: string) {
  const mailbox = await database.mailbox.findFirst({
    where: { id: mailboxId, userId },
    select: { id: true },
  });
  if (!mailbox) throw new ScanMailboxNotFoundError('Mailbox not found for this user');
  const scan = await database.scan.create({ data: { mailboxId: mailbox.id } });
  await scanQueue.add(
    'scan-mailbox',
    { scanId: scan.id, userId, mailboxId: mailbox.id },
    { jobId: scan.id },
  );
  return scan;
}

export async function getScan(userId: string, scanId: string) {
  return database.scan.findFirst({
    where: { id: scanId, mailbox: { userId } },
    include: { _count: { select: { analyses: true } } },
  });
}
