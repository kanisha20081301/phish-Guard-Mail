export type Classification = 'safe' | 'marketing' | 'spam' | 'phishing';

export interface ClassificationResult {
  category: Classification;
  score: number;
  reasons: string[];
}

const marketingSignals = ['newsletter', 'unsubscribe', 'promotional', 'special offer'];

// Replace this adapter with a hosted model or an approved local model. Keep model calls server-side.
export function classifyEmail(input: {
  sender: string;
  subject: string;
  body: string;
}): ClassificationResult {
  const text = `${input.sender} ${input.subject} ${input.body}`.toLowerCase();
  const phishingSignals = [
    'verify your account',
    'urgent action',
    'password expires',
    'payment failed',
  ];
  const spamSignals = ['limited time', 'you won', 'special offer'];
  const phishingHits = phishingSignals.filter((signal) => text.includes(signal)).length;
  const spamHits = spamSignals.filter((signal) => text.includes(signal)).length;
  if (phishingHits > 0)
    return {
      category: 'phishing',
      score: Math.min(0.99, 0.78 + phishingHits * 0.06),
      reasons: ['Urgency language', 'Potential credential or payment request'],
    };
  if (spamHits > 0)
    return {
      category: 'spam',
      score: Math.min(0.96, 0.68 + spamHits * 0.08),
      reasons: ['Promotional language', 'Bulk-mail indicator'],
    };
  if (marketingSignals.some((signal) => text.includes(signal)))
    return { category: 'marketing', score: 0.84, reasons: ['Newsletter or promotional content'] };
  return { category: 'safe', score: 0.91, reasons: ['No high-risk indicators detected'] };
}
