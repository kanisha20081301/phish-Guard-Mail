import { classifyEmail } from '../../classifier.js';
import { EmailCategory, RiskLevel } from '@prisma/client';

export interface DetectionResult {
  category: EmailCategory;
  riskLevel: RiskLevel;
  score: number;
  reasons: string[];
  modelName: string;
}

export function detectEmail(input: {
  sender: string;
  subject: string;
  bodyText: string;
}): DetectionResult {
  const result = classifyEmail({
    sender: input.sender,
    subject: input.subject,
    body: input.bodyText,
  });
  const category = result.category.toUpperCase() as EmailCategory;
  const riskLevel =
    category === EmailCategory.PHISHING && result.score >= 0.9
      ? RiskLevel.CRITICAL
      : category === EmailCategory.PHISHING
        ? RiskLevel.HIGH
        : category === EmailCategory.SPAM
          ? RiskLevel.MEDIUM
          : RiskLevel.LOW;
  return {
    category,
    riskLevel,
    score: result.score,
    reasons: result.reasons,
    modelName: 'phishguard-rules-v1',
  };
}
