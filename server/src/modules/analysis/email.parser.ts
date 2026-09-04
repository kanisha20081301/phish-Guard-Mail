export interface ParsedEmail {
  providerId?: string;
  sender: string;
  recipient: string;
  subject: string;
  bodyText: string;
  receivedAt: Date;
}

export function parseEmail(input: {
  sender?: string;
  recipient?: string;
  subject?: string;
  bodyText?: string;
  rawEmail?: string;
  providerId?: string;
  receivedAt?: string;
}): ParsedEmail {
  if (input.rawEmail) return parseRawEmail(input.rawEmail, input.providerId, input.receivedAt);
  if (!input.sender || !input.recipient || !input.subject || !input.bodyText)
    throw new Error('sender, recipient, subject, and bodyText are required');
  return {
    providerId: input.providerId,
    sender: input.sender.trim(),
    recipient: input.recipient.trim(),
    subject: input.subject.trim(),
    bodyText: stripHtml(input.bodyText),
    receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
  };
}

function parseRawEmail(
  rawEmail: string,
  providerId: string | undefined,
  receivedAt: string | undefined,
): ParsedEmail {
  const separator = rawEmail.match(/\r?\n\r?\n/);
  const headerText = separator ? rawEmail.slice(0, separator.index) : rawEmail;
  const bodyText = separator ? rawEmail.slice((separator.index ?? 0) + separator[0].length) : '';
  const headers = new Map<string, string>();
  for (const line of headerText.split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index > 0) headers.set(line.slice(0, index).toLowerCase(), line.slice(index + 1).trim());
  }
  const sender = headers.get('from');
  const recipient = headers.get('to');
  const subject = headers.get('subject');
  if (!sender || !recipient || !subject)
    throw new Error('rawEmail must include From, To, and Subject headers');
  const date = headers.get('date');
  return {
    providerId,
    sender,
    recipient,
    subject,
    bodyText: stripHtml(bodyText),
    receivedAt: receivedAt ? new Date(receivedAt) : date ? new Date(date) : new Date(),
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
