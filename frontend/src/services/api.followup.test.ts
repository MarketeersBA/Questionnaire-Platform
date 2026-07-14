import { describe, expect, it } from 'vitest';
import { parseFollowUpResponse } from './api';

describe('parseFollowUpResponse', () => {
  it('reads followup_text as primary field', () => {
    const parsed = parseFollowUpResponse({
      action: 'probe',
      followup_text: 'Tell me more about the flavor',
      key_insights: ['flavor'],
    });
    expect(parsed.action).toBe('probe');
    expect(parsed.followUpText).toBe('Tell me more about the flavor');
    expect(parsed.keyInsights).toEqual(['flavor']);
  });

  it('falls back to legacy follow_up_question when followup_text is absent', () => {
    const parsed = parseFollowUpResponse({
      action: 'probe',
      follow_up_question: 'Legacy probe question?',
    });
    expect(parsed.followUpText).toBe('Legacy probe question?');
  });

  it('prefers followup_text over legacy follow_up_question', () => {
    const parsed = parseFollowUpResponse({
      action: 'probe',
      followup_text: 'Canonical text',
      follow_up_question: 'Legacy text',
    });
    expect(parsed.followUpText).toBe('Canonical text');
  });

  it('returns null followUpText on complete action', () => {
    const parsed = parseFollowUpResponse({
      action: 'complete',
      followup_text: null,
      key_insights: [],
      reasoning: 'Answer is detailed enough',
    });
    expect(parsed.action).toBe('complete');
    expect(parsed.followUpText).toBeNull();
    expect(parsed.reasoning).toBe('Answer is detailed enough');
  });
});
