import { describe, expect, it } from 'vitest';
import {
  appendFollowUpExchangeToText,
  buildL2AnswerKey,
  buildStructuredAiInsightsBlock,
  FOLLOWUP_PROMPT_PREFIX,
  FOLLOWUP_RESPONDENT_PREFIX,
  FOLLOWUP_VOICE_REPLY_PLACEHOLDER,
  formatFollowUpExchangeBlock,
  normalizeAiInsightsMap,
  parseFollowUpExchangeBlocks,
} from './followUpAnswerPersistence';

describe('followUpAnswerPersistence', () => {
  it('buildL2AnswerKey matches legacy taste-test storage format', () => {
    expect(buildL2AnswerKey('BrandA', 'q_like_1')).toBe('BrandA_q_like_1');
    expect(buildL2AnswerKey(null, 'q_like_1')).toBe('q_like_1');
    expect(buildL2AnswerKey('', 'q_like_1')).toBe('q_like_1');
  });

  it('formats and parses follow-up exchange blocks for analytics', () => {
    const block = formatFollowUpExchangeBlock('Why did you like it?', 'Because it is creamy');
    expect(block).toBe(`${FOLLOWUP_PROMPT_PREFIX} Why did you like it?\n${FOLLOWUP_RESPONDENT_PREFIX} Because it is creamy`);

    const combined = appendFollowUpExchangeToText(
      'Sweet taste',
      'Why did you like it?',
      'Because it is creamy',
    );
    expect(combined.startsWith('Sweet taste')).toBe(true);
    expect(parseFollowUpExchangeBlocks(combined)).toEqual([
      { prompt: 'Why did you like it?', respondent: 'Because it is creamy' },
    ]);
  });

  it('supports multi-round appended exchanges in one answer field', () => {
    const round1 = appendFollowUpExchangeToText('Initial answer', 'Probe 1?', 'Reply 1');
    const round2 = appendFollowUpExchangeToText(round1, 'Probe 2?', 'Reply 2');
    expect(parseFollowUpExchangeBlocks(round2)).toEqual([
      { prompt: 'Probe 1?', respondent: 'Reply 1' },
      { prompt: 'Probe 2?', respondent: 'Reply 2' },
    ]);
  });

  it('keeps voice reply placeholder stable', () => {
    expect(FOLLOWUP_VOICE_REPLY_PLACEHOLDER).toBe('[Audio Answer]');
    const combined = appendFollowUpExchangeToText('Base', 'Probe?', FOLLOWUP_VOICE_REPLY_PLACEHOLDER);
    expect(parseFollowUpExchangeBlocks(combined)[0].respondent).toBe('[Audio Answer]');
  });

  it('normalizes aiInsights for session and submission payloads', () => {
    expect(
      normalizeAiInsightsMap({
        q1: ['  insight A  ', '', 'insight B'],
        q2: [],
        bad: 'x' as unknown as string[],
      }),
    ).toEqual({
      q1: ['insight A', 'insight B'],
    });
    expect(buildStructuredAiInsightsBlock({ q1: ['x'] })).toEqual({ q1: ['x'] });
  });
});
