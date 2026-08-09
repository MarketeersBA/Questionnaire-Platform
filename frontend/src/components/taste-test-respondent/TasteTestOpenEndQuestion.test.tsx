import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_FOLLOWUP } from '../../utils/aiFollowupConfig';
import { appendTasteTestFollowUpToAnswer } from './tasteTestOpenEndFollowUp';
import {
  shouldShowTasteTestFollowUpPanel,
  shouldTriggerTasteTestTextBlurFollowUp,
  shouldTriggerTasteTestVoiceUploadFollowUp,
} from './tasteTestOpenEndInteractions';

const ENABLED_CONFIG = {
  ...DEFAULT_AI_FOLLOWUP,
  is_enabled: true,
  apply_to_text: true,
  apply_to_voice: true,
};

const LIKE_QUESTION = {
  questionId: 'BrandA_q_like',
  questionText: 'What did you like about the taste?',
  effectiveType: 'open-ended',
};

describe('tasteTestOpenEndFollowUp append helper', () => {
  it('appends follow-up transcript blocks consistently', () => {
    const combined = appendTasteTestFollowUpToAnswer(
      'Sweet taste',
      'Why did you like it?',
      'Because it is creamy',
    );
    expect(combined).toContain('AI Follow-up: Why did you like it?');
    expect(combined).toContain('Respondent: Because it is creamy');
  });
});

describe('TasteTestOpenEndQuestion interactions (Phase 8)', () => {
  it('text blur triggers follow-up when config allows it', () => {
    expect(
      shouldTriggerTasteTestTextBlurFollowUp({
        ...LIKE_QUESTION,
        aiFollowup: ENABLED_CONFIG,
        text: 'It tasted very creamy and smooth',
        followUpStateMap: {},
      }),
    ).toBe(true);
  });

  it('text blur does not trigger when AI/MI disabled', () => {
    expect(
      shouldTriggerTasteTestTextBlurFollowUp({
        ...LIKE_QUESTION,
        aiFollowup: { ...ENABLED_CONFIG, is_enabled: false },
        text: 'It tasted very creamy and smooth',
        followUpStateMap: {},
      }),
    ).toBe(false);
  });

  it('text blur does not trigger when taste_l2_open_end surface excluded', () => {
    expect(
      shouldTriggerTasteTestTextBlurFollowUp({
        ...LIKE_QUESTION,
        aiFollowup: {
          ...ENABLED_CONFIG,
          eligible_surfaces: ['product_test_open_end'],
        },
        text: 'It tasted very creamy and smooth',
        followUpStateMap: {},
      }),
    ).toBe(false);
  });

  it('text blur triggers for Egyptian Arabic like open-end', () => {
    expect(
      shouldTriggerTasteTestTextBlurFollowUp({
        questionId: 'abu auf_tt_q13',
        questionText: 'إيه أكتر حاجة عجبتك في الطعم؟',
        effectiveType: 'open-ended',
        aiFollowup: ENABLED_CONFIG,
        text: 'الطعم كان كريمي وحلو جدا',
        followUpStateMap: {},
      }),
    ).toBe(true);
  });

  it('text blur does not trigger when likes category is disabled', () => {
    expect(
      shouldTriggerTasteTestTextBlurFollowUp({
        ...LIKE_QUESTION,
        aiFollowup: {
          ...ENABLED_CONFIG,
          category_config: { likes: { enabled: false } },
        },
        text: 'It tasted very creamy and smooth',
        followUpStateMap: {},
      }),
    ).toBe(false);
  });

  it('text blur does not trigger when text channel is disabled', () => {
    expect(
      shouldTriggerTasteTestTextBlurFollowUp({
        ...LIKE_QUESTION,
        aiFollowup: { ...ENABLED_CONFIG, apply_to_text: false },
        text: 'It tasted very creamy and smooth',
        followUpStateMap: {},
      }),
    ).toBe(false);
  });

  it('text blur does not trigger for short answers', () => {
    expect(
      shouldTriggerTasteTestTextBlurFollowUp({
        ...LIKE_QUESTION,
        aiFollowup: ENABLED_CONFIG,
        text: 'ok',
        followUpStateMap: {},
      }),
    ).toBe(false);
  });

  it('voice upload triggers follow-up when voice channel allows it', () => {
    expect(
      shouldTriggerTasteTestVoiceUploadFollowUp({
        ...LIKE_QUESTION,
        aiFollowup: ENABLED_CONFIG,
        followUpStateMap: {},
        prevVoiceFeedbackId: null,
        nextVoiceFeedbackId: 'fb-voice-1',
      }),
    ).toBe(true);
  });

  it('voice upload does not trigger when voice channel is disabled', () => {
    expect(
      shouldTriggerTasteTestVoiceUploadFollowUp({
        ...LIKE_QUESTION,
        aiFollowup: { ...ENABLED_CONFIG, apply_to_voice: false },
        followUpStateMap: {},
        prevVoiceFeedbackId: null,
        nextVoiceFeedbackId: 'fb-voice-1',
      }),
    ).toBe(false);
  });

  it('voice upload does not re-trigger when feedback id already exists', () => {
    expect(
      shouldTriggerTasteTestVoiceUploadFollowUp({
        ...LIKE_QUESTION,
        aiFollowup: ENABLED_CONFIG,
        followUpStateMap: {},
        prevVoiceFeedbackId: 'fb-existing',
        nextVoiceFeedbackId: 'fb-voice-1',
      }),
    ).toBe(false);
  });

  it('scale questions do not render follow-up panel', () => {
    expect(
      shouldShowTasteTestFollowUpPanel({
        questionId: 'BrandA_q_scale',
        questionText: 'What did you like?',
        effectiveType: 'scale',
        aiFollowup: ENABLED_CONFIG,
        followUpStateMap: {
          BrandA_q_scale: {
            questionId: 'BrandA_q_scale',
            round: 1,
            followUpText: 'Tell me more?',
            loading: false,
          },
        },
      }),
    ).toBe(false);
  });

  it('shows follow-up panel for eligible open-end when state exists', () => {
    expect(
      shouldShowTasteTestFollowUpPanel({
        ...LIKE_QUESTION,
        aiFollowup: ENABLED_CONFIG,
        followUpStateMap: {
          [LIKE_QUESTION.questionId]: {
            questionId: LIKE_QUESTION.questionId,
            round: 1,
            followUpText: 'What stood out most?',
            loading: false,
          },
        },
      }),
    ).toBe(true);
  });

  it('hides follow-up panel after AI finishes with empty leftover state', () => {
    expect(
      shouldShowTasteTestFollowUpPanel({
        ...LIKE_QUESTION,
        aiFollowup: ENABLED_CONFIG,
        followUpStateMap: {
          [LIKE_QUESTION.questionId]: {
            questionId: LIKE_QUESTION.questionId,
            round: 2,
            followUpText: null,
            loading: false,
          },
        },
      }),
    ).toBe(false);
  });

  it('does not show panel for generic overall open-end even with state', () => {
    expect(
      shouldShowTasteTestFollowUpPanel({
        questionId: 'BrandA_q_overall',
        questionText: 'What did you think overall?',
        effectiveType: 'open-ended',
        aiFollowup: ENABLED_CONFIG,
        followUpStateMap: {
          BrandA_q_overall: {
            questionId: 'BrandA_q_overall',
            round: 1,
            followUpText: 'Why?',
            loading: false,
          },
        },
      }),
    ).toBe(false);
  });
});
