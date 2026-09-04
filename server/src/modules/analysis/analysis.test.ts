import assert from 'node:assert/strict';
import test from 'node:test';
import { detectEmail } from './detection.engine.js';
import { parseEmail } from './email.parser.js';

test('parses required raw email headers and strips HTML', () => {
  const email = parseEmail({
    rawEmail:
      'From: attacker@example.com\nTo: user@example.com\nSubject: Verify now\n\n<p>Verify your account</p>',
  });
  assert.equal(email.sender, 'attacker@example.com');
  assert.equal(email.bodyText, 'Verify your account');
});

test('classifies urgent account verification as critical phishing', () => {
  const result = detectEmail({
    sender: 'attacker@example.com',
    subject: 'Urgent action: verify your account',
    bodyText: 'Payment failed. Verify your account.',
  });
  assert.equal(result.category, 'PHISHING');
  assert.equal(result.riskLevel, 'CRITICAL');
  assert.ok(result.score >= 0.9);
});

test('classifies newsletters as marketing when no phishing signal exists', () => {
  const result = detectEmail({
    sender: 'news@example.com',
    subject: 'This week newsletter',
    bodyText: 'Read more and unsubscribe anytime.',
  });
  assert.equal(result.category, 'MARKETING');
});
