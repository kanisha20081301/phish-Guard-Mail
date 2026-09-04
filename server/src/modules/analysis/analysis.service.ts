import { randomUUID } from 'node:crypto';
import { database } from '../../infrastructure/database.js';
import { detectEmail } from './detection.engine.js';
import { parseEmail } from './email.parser.js';

export class MailboxNotFoundError extends Error {}

export async function getOrCreateUserMailbox(userId: string): Promise<string> {
  const existing = await database.mailbox.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const user = await database.user.findUnique({ where: { id: userId }, select: { email: true } });
  const created = await database.mailbox.create({
    data: {
      userId,
      provider: 'GMAIL',
      providerUser: user?.email ?? `${userId}@local.internal`,
      tokenRef: `mailbox-${userId}-${Date.now()}`,
    },
    select: { id: true },
  });
  return created.id;
}

export async function analyzeEmail(
  userId: string,
  input: Parameters<typeof parseEmail>[0] & { mailboxId?: string },
) {
  const targetMailboxId = input.mailboxId || (await getOrCreateUserMailbox(userId));
  const mailbox = await database.mailbox.findFirst({
    where: { id: targetMailboxId, userId },
    select: { id: true },
  });
  if (!mailbox) throw new MailboxNotFoundError('Mailbox not found for this user');
  const email = parseEmail(input);
  const detection = detectEmail(email);
  return database.$transaction(async (transaction) => {
    const storedEmail = await transaction.email.create({
      data: {
        mailboxId: mailbox.id,
        providerId: email.providerId ?? `manual-${randomUUID()}`,
        sender: email.sender,
        recipient: email.recipient,
        subject: email.subject,
        bodyText: email.bodyText,
        receivedAt: email.receivedAt,
      },
    });
    const analysis = await transaction.emailAnalysis.create({
      data: {
        emailId: storedEmail.id,
        userId,
        category: detection.category,
        riskLevel: detection.riskLevel,
        score: detection.score,
        reasons: detection.reasons,
        modelName: detection.modelName,
      },
    });
    if (detection.riskLevel === 'HIGH' || detection.riskLevel === 'CRITICAL')
      await transaction.alert.create({
        data: {
          userId,
          analysisId: analysis.id,
          title: `${detection.riskLevel} risk email detected`,
        },
      });
    await transaction.auditLog.create({
      data: {
        userId,
        action: 'EMAIL_ANALYZED',
        entity: 'EmailAnalysis',
        entityId: analysis.id,
        metadata: { category: detection.category, riskLevel: detection.riskLevel },
      },
    });
    return {
      analysisId: analysis.id,
      emailId: storedEmail.id,
      category: detection.category,
      riskLevel: detection.riskLevel,
      score: detection.score,
      reasons: detection.reasons,
      modelName: detection.modelName,
    };
  });
}

export async function getAnalysis(userId: string, analysisId: string) {
  return database.emailAnalysis.findFirst({
    where: { id: analysisId, userId },
    include: {
      email: { select: { sender: true, recipient: true, subject: true, receivedAt: true } },
      alerts: { select: { id: true, status: true, title: true, createdAt: true } },
    },
  });
}

export async function syncAndScanUserMailbox(userId: string) {
  const mailboxId = await getOrCreateUserMailbox(userId);
  const user = await database.user.findUnique({ where: { id: userId }, select: { email: true } });
  const recipientEmail = user?.email ?? 'user@gmail.com';

  const existingEmailCount = await database.email.count({ where: { mailboxId } });
  if (existingEmailCount < 6) {
    const sampleInbox = [
      {
        providerId: `inbox-msg-${randomUUID()}`,
        sender: 'security-alerts@paypa1-support.com',
        recipient: recipientEmail,
        subject: 'URGENT: Unauthorized login detected - Verify your account immediately',
        bodyText:
          'Dear customer,\n\nWe detected an unauthorized sign-in from an unknown device. Your access is temporarily restricted. You must verify your account credentials within 24 hours to prevent permanent account suspension.\n\nClick: http://security-verify-paypa1.com/login',
        receivedAt: new Date(Date.now() - 1000 * 60 * 15),
      },
      {
        providerId: `inbox-msg-${randomUUID()}`,
        sender: 'billing-alert@cloud-renewals-support.com',
        recipient: recipientEmail,
        subject: 'CRITICAL: Payment failed for your cloud subscription renewal',
        bodyText:
          'Urgent action required: Your automatic subscription payment failed. Your password expires and services will terminate in 12 hours unless you update your credit card details immediately.',
        receivedAt: new Date(Date.now() - 1000 * 60 * 55),
      },
      {
        providerId: `inbox-msg-${randomUUID()}`,
        sender: 'rewards@mega-deals-direct.com',
        recipient: recipientEmail,
        subject: 'You won a $500 gift card - Limited time special offer!',
        bodyText:
          'Congratulations! You were selected as our winner of the day. Claim your special offer before midnight today.',
        receivedAt: new Date(Date.now() - 1000 * 60 * 140),
      },
      {
        providerId: `inbox-msg-${randomUUID()}`,
        sender: 'newsletter@security-digest.org',
        recipient: recipientEmail,
        subject: 'Weekly Cybersecurity Digest: Defending against zero-day exploits',
        bodyText:
          'Hello subscriber,\n\nHere is your weekly newsletter covering this week’s top security advisories and email spoofing protection strategies. To unsubscribe, click the link below.',
        receivedAt: new Date(Date.now() - 1000 * 60 * 320),
      },
      {
        providerId: `inbox-msg-${randomUUID()}`,
        sender: 'no-reply@accounts.google.com',
        recipient: recipientEmail,
        subject: 'Security alert: New sign-in on Windows',
        bodyText:
          'Your Google Account was successfully signed in from a new Windows device. If this was you, no action is needed.',
        receivedAt: new Date(Date.now() - 1000 * 60 * 480),
      },
      {
        providerId: `inbox-msg-${randomUUID()}`,
        sender: 'team-updates@acme-corp.com',
        recipient: recipientEmail,
        subject: 'Sprint 34 Review & Architecture Sync Notes',
        bodyText:
          'Hi team,\n\nGreat work on this sprint! Here are the summary notes and action items for next week’s release cycle. Please review the attached pull requests.',
        receivedAt: new Date(Date.now() - 1000 * 60 * 600),
      },
    ];

    for (const msg of sampleInbox) {
      await database.email.create({
        data: {
          mailboxId,
          providerId: msg.providerId,
          sender: msg.sender,
          recipient: msg.recipient,
          subject: msg.subject,
          bodyText: msg.bodyText,
          receivedAt: msg.receivedAt,
        },
      });
    }
  }

  // Find all unanalyzed emails for this mailbox
  const emails = await database.email.findMany({
    where: { mailboxId },
    include: { analyses: { where: { userId } } },
    orderBy: { receivedAt: 'desc' },
  });

  for (const email of emails) {
    if (email.analyses.length === 0) {
      const detection = detectEmail({
        sender: email.sender,
        subject: email.subject,
        bodyText: email.bodyText,
      });

      const analysis = await database.emailAnalysis.create({
        data: {
          emailId: email.id,
          userId,
          category: detection.category,
          riskLevel: detection.riskLevel,
          score: detection.score,
          reasons: detection.reasons,
          modelName: detection.modelName,
        },
      });

      if (detection.riskLevel === 'HIGH' || detection.riskLevel === 'CRITICAL') {
        const existingAlert = await database.alert.findFirst({
          where: { analysisId: analysis.id, userId },
        });
        if (!existingAlert) {
          await database.alert.create({
            data: {
              userId,
              analysisId: analysis.id,
              title: `${detection.riskLevel} risk threat detected in inbox`,
            },
          });
        }
      }
    }
  }

  await database.mailbox.update({
    where: { id: mailboxId },
    data: { lastScannedAt: new Date() },
  });

  return database.email.findMany({
    where: { mailboxId },
    include: { analyses: { where: { userId } } },
    orderBy: { receivedAt: 'desc' },
  });
}
