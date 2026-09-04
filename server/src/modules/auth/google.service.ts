import jwt from 'jsonwebtoken';
import { database } from '../../infrastructure/database.js';
import { environment } from '../../config/environment.js';
import { detectEmail } from '../analysis/detection.engine.js';
import { getOrCreateUserMailbox } from '../analysis/analysis.service.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

const GMAIL_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
];

type GmailHeader = { name: string; value: string };
type GmailPart = { mimeType?: string; body?: { data?: string } };
type GmailMessage = {
  id: string;
  snippet?: string;
  payload?: { headers?: GmailHeader[]; parts?: GmailPart[] };
};

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(environment.GOOGLE_CLIENT_ID && environment.GOOGLE_CLIENT_SECRET);
}

export function getGoogleAuthUrl(): string {
  const redirectUri =
    environment.GOOGLE_REDIRECT_URI ??
    `http://localhost:${environment.PORT}/api/v1/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: environment.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function handleGoogleCallback(code: string) {
  const redirectUri =
    environment.GOOGLE_REDIRECT_URI ??
    `http://localhost:${environment.PORT}/api/v1/auth/google/callback`;

  // Exchange code for tokens
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: environment.GOOGLE_CLIENT_ID ?? '',
      client_secret: environment.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`Google token exchange failed: ${errorBody}`);
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  // Fetch Google user profile
  const userResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userResponse.ok) {
    throw new Error('Failed to retrieve Google user profile');
  }

  const googleUser = (await userResponse.json()) as {
    id: string;
    email: string;
    name?: string;
    picture?: string;
  };

  const email = googleUser.email.trim().toLowerCase();
  const displayName = googleUser.name || email.split('@')[0] || 'Google User';

  // Find or create user
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
        action: 'USER_REGISTERED_GOOGLE_OAUTH',
        entity: 'User',
        entityId: user.id,
      },
    });
  }

  // Ensure Mailbox exists and save token reference
  const tokenRef = `google-oauth-${user.id}-${Date.now()}`;
  let mailbox = await database.mailbox.findFirst({ where: { userId: user.id } });
  if (!mailbox) {
    mailbox = await database.mailbox.create({
      data: {
        userId: user.id,
        provider: 'GMAIL',
        providerUser: email,
        tokenRef,
      },
    });
  }

  // Attempt live message sync from real Gmail API
  try {
    await syncLiveGmailMessages(user.id, tokenData.access_token);
  } catch (syncErr) {
    console.warn('[Gmail API] Live sync warning (proceeding with mailbox):', syncErr);
  }

  // Create JWT session token
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    environment.SESSION_SECRET,
    { expiresIn: '15m' },
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
  };
}

export async function fetchLiveGmailMessages(accessToken: string, maxResults = 20) {
  const listResponse = await fetch(
    `${GMAIL_API_BASE}/messages?q=in:inbox&maxResults=${maxResults}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!listResponse.ok) {
    throw new Error(`Gmail list messages failed: ${listResponse.statusText}`);
  }

  const listData = (await listResponse.json()) as {
    messages?: Array<{ id: string; threadId: string }>;
  };

  const messageSummaries = listData.messages ?? [];
  const fetchedEmails: Array<{
    providerId: string;
    sender: string;
    recipient: string;
    subject: string;
    bodyText: string;
    receivedAt: Date;
  }> = [];

  for (const item of messageSummaries.slice(0, maxResults)) {
    try {
      const msgRes = await fetch(`${GMAIL_API_BASE}/messages/${item.id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!msgRes.ok) continue;

      const msgData = (await msgRes.json()) as GmailMessage;
      const headers = msgData.payload?.headers ?? [];

      const getHeader = (name: string) =>
        headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? '';

      const sender = getHeader('From') || 'unknown@sender.com';
      const recipient = getHeader('To') || 'me@gmail.com';
      const subject = getHeader('Subject') || '(No Subject)';
      const dateHeader = getHeader('Date');
      const receivedAt = dateHeader ? new Date(dateHeader) : new Date();

      let bodyText = msgData.snippet || '';
      // Attempt extracting plain text part
      const parts = msgData.payload?.parts;
      if (Array.isArray(parts)) {
        const textPart = parts.find((part) => part.mimeType === 'text/plain');
        if (textPart?.body?.data) {
          bodyText = Buffer.from(textPart.body.data, 'base64').toString('utf8');
        }
      }

      fetchedEmails.push({
        providerId: msgData.id,
        sender,
        recipient,
        subject,
        bodyText,
        receivedAt: isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
      });
    } catch {
      /* continue next message */
    }
  }

  return fetchedEmails;
}

export async function syncLiveGmailMessages(userId: string, accessToken: string) {
  const mailboxId = await getOrCreateUserMailbox(userId);
  const liveMessages = await fetchLiveGmailMessages(accessToken, 20);

  for (const msg of liveMessages) {
    let emailRecord = await database.email.findUnique({
      where: {
        mailboxId_providerId: {
          mailboxId,
          providerId: msg.providerId,
        },
      },
    });

    if (!emailRecord) {
      emailRecord = await database.email.create({
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

    const existingAnalysis = await database.emailAnalysis.findFirst({
      where: { emailId: emailRecord.id, userId },
    });

    if (!existingAnalysis) {
      const detection = detectEmail({
        sender: emailRecord.sender,
        subject: emailRecord.subject,
        bodyText: emailRecord.bodyText,
      });

      const analysis = await database.emailAnalysis.create({
        data: {
          emailId: emailRecord.id,
          userId,
          category: detection.category,
          riskLevel: detection.riskLevel,
          score: detection.score,
          reasons: detection.reasons,
          modelName: detection.modelName,
        },
      });

      if (detection.riskLevel === 'HIGH' || detection.riskLevel === 'CRITICAL') {
        await database.alert.create({
          data: {
            userId,
            analysisId: analysis.id,
            title: `${detection.riskLevel} risk threat detected in live Gmail`,
          },
        });
      }
    }
  }

  await database.mailbox.update({
    where: { id: mailboxId },
    data: { lastScannedAt: new Date() },
  });
}
