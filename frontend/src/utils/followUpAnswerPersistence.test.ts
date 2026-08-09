import { describe, expect, it } from 'vitest';
import {
  appendFollowUpExchangeToText,
  buildL2AnswerKey,
  buildStructuredAiInsightsBlock,
  commitOpenEndPrimaryEdit,
  FOLLOWUP_PROMPT_PREFIX,
  FOLLOWUP_RESPONDENT_PREFIX,
  FOLLOWUP_VOICE_REPLY_PLACEHOLDER,
  formatFollowUpExchangeBlock,
  joinFollowUpAnswerText,
  normalizeAiInsightsMap,
  parseFollowUpExchangeBlocks,
  projectOpenEndPrimaryOnly,
  replacePrimaryAnswerText,
  splitFollowUpAnswerText,
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

  it('splits primary answer from follow-up thread for respondent UI', () => {
    const round1 = appendFollowUpExchangeToText('قللو السكر', 'كيف هيأثر؟', 'هيبقى احسن');
    const round2 = appendFollowUpExchangeToText(round1, 'ممكن توضح؟', 'مبحبش المسكر');
    expect(splitFollowUpAnswerText(round2)).toEqual({
      primaryText: 'قللو السكر',
      exchanges: [
        { prompt: 'كيف هيأثر؟', respondent: 'هيبقى احسن' },
        { prompt: 'ممكن توضح؟', respondent: 'مبحبش المسكر' },
      ],
    });
  });

  it('preserves follow-up blocks when primary answer is edited', () => {
    const stored = appendFollowUpExchangeToText('Original', 'Probe?', 'Reply');
    const updated = replacePrimaryAnswerText(stored, 'Edited original');
    expect(splitFollowUpAnswerText(updated).primaryText).toBe('Edited original');
    expect(parseFollowUpExchangeBlocks(updated)).toEqual([
      { prompt: 'Probe?', respondent: 'Reply' },
    ]);
    expect(joinFollowUpAnswerText('Edited original', [
      { prompt: 'Probe?', respondent: 'Reply' },
    ])).toBe(updated);
  });

  it('projects and commits open-end edits without exposing follow-up markers in the textbox', () => {
    const stored = {
      text: appendFollowUpExchangeToText('Base answer', 'Why?', 'Because'),
      input_modes_used: ['text'] as ('text' | 'voice')[],
    };
    expect(projectOpenEndPrimaryOnly(stored).text).toBe('Base answer');

    const committed = commitOpenEndPrimaryEdit(stored, {
      text: 'Updated base',
      voice_feedback_id: 'vf_1',
      input_modes_used: ['text', 'voice'],
    });
    expect(committed.text).toContain('Updated base');
    expect(committed.text).toContain(`${FOLLOWUP_PROMPT_PREFIX} Why?`);
    expect(committed.voice_feedback_id).toBe('vf_1');
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
