import { describe, expect, it, vi, afterEach } from 'vitest';
import { DEFAULT_AI_FOLLOWUP } from '../../utils/aiFollowupConfig';
import {
  evaluateTasteTestTextBlurFollowUp,
  evaluateTasteTestVoiceUploadFollowUp,
  logTasteTestFollowUpTriggerBlock,
} from './tasteTestOpenEndTriggerEvaluation';

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

describe('evaluateTasteTestTextBlurFollowUp', () => {
  it('returns eligible when all gates pass', () => {
    const result = evaluateTasteTestTextBlurFollowUp({
      ...LIKE_QUESTION,
      aiFollowup: ENABLED_CONFIG,
      text: 'It tasted very creamy and smooth',
      followUpStateMap: {},
    });
    expect(result.shouldTrigger).toBe(true);
    expect(result.blockReason).toBe('eligible');
    expect(result.surface).toBe('taste_l2_open_end');
    expect(result.category).toBe('likes');
  });

  it('blocks when AI/MI disabled', () => {
    const result = evaluateTasteTestTextBlurFollowUp({
      ...LIKE_QUESTION,
      aiFollowup: { ...ENABLED_CONFIG, is_enabled: false },
      text: 'It tasted very creamy and smooth',
      followUpStateMap: {},
    });
    expect(result.blockReason).toBe('ai_disabled');
  });

  it('blocks when text channel disabled', () => {
    const result = evaluateTasteTestTextBlurFollowUp({
      ...LIKE_QUESTION,
      aiFollowup: { ...ENABLED_CONFIG, apply_to_text: false },
      text: 'It tasted very creamy and smooth',
      followUpStateMap: {},
    });
    expect(result.blockReason).toBe('text_channel_disabled');
  });

  it('blocks when taste_l2_open_end surface excluded from config', () => {
    const result = evaluateTasteTestTextBlurFollowUp({
      ...LIKE_QUESTION,
      aiFollowup: {
        ...ENABLED_CONFIG,
        eligible_surfaces: ['product_test_open_end'],
      },
      text: 'It tasted very creamy and smooth',
      followUpStateMap: {},
    });
    expect(result.blockReason).toBe('surface_not_enabled');
  });

  it('blocks when likes category disabled', () => {
    const result = evaluateTasteTestTextBlurFollowUp({
      ...LIKE_QUESTION,
      aiFollowup: {
        ...ENABLED_CONFIG,
        category_config: { likes: { enabled: false } },
      },
      text: 'It tasted very creamy and smooth',
      followUpStateMap: {},
    });
    expect(result.blockReason).toBe('category_disabled');
  });

  it('blocks when follow-up session already active', () => {
    const result = evaluateTasteTestTextBlurFollowUp({
      ...LIKE_QUESTION,
      aiFollowup: ENABLED_CONFIG,
      text: 'It tasted very creamy and smooth',
      followUpStateMap: {
        [LIKE_QUESTION.questionId]: {
          questionId: LIKE_QUESTION.questionId,
          round: 1,
          followUpText: 'Tell me more?',
          loading: false,
        },
      },
    });
    expect(result.blockReason).toBe('active_follow_up');
  });

  it('blocks when answer too short', () => {
    const result = evaluateTasteTestTextBlurFollowUp({
      ...LIKE_QUESTION,
      aiFollowup: ENABLED_CONFIG,
      text: 'ok',
      followUpStateMap: {},
    });
    expect(result.blockReason).toBe('answer_too_short');
  });
});

describe('evaluateTasteTestVoiceUploadFollowUp', () => {
  it('returns eligible for new voice upload', () => {
    const result = evaluateTasteTestVoiceUploadFollowUp({
      ...LIKE_QUESTION,
      aiFollowup: ENABLED_CONFIG,
      followUpStateMap: {},
      prevVoiceFeedbackId: null,
      nextVoiceFeedbackId: 'fb-1',
    });
    expect(result.shouldTrigger).toBe(true);
    expect(result.blockReason).toBe('eligible');
  });

  it('blocks when voice channel disabled', () => {
    const result = evaluateTasteTestVoiceUploadFollowUp({
      ...LIKE_QUESTION,
      aiFollowup: { ...ENABLED_CONFIG, apply_to_voice: false },
      followUpStateMap: {},
      prevVoiceFeedbackId: null,
      nextVoiceFeedbackId: 'fb-1',
    });
    expect(result.blockReason).toBe('voice_channel_disabled');
  });

  it('blocks when voice feedback already existed', () => {
    const result = evaluateTasteTestVoiceUploadFollowUp({
      ...LIKE_QUESTION,
      aiFollowup: ENABLED_CONFIG,
      followUpStateMap: {},
      prevVoiceFeedbackId: 'fb-existing',
      nextVoiceFeedbackId: 'fb-1',
    });
    expect(result.blockReason).toBe('voice_already_recorded');
  });
});

describe('logTasteTestFollowUpTriggerBlock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs blocked triggers in dev mode', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const evaluation = evaluateTasteTestTextBlurFollowUp({
      ...LIKE_QUESTION,
      aiFollowup: { ...ENABLED_CONFIG, is_enabled: false },
      text: 'creamy taste',
      followUpStateMap: {},
    });

    logTasteTestFollowUpTriggerBlock('text_blur', evaluation, {
      questionId: LIKE_QUESTION.questionId,
      questionText: LIKE_QUESTION.questionText,
    });

    if (import.meta.env.DEV) {
      expect(debugSpy).toHaveBeenCalledWith(
        '[AI MI taste L2] trigger blocked',
        expect.objectContaining({
          channel: 'text_blur',
          blockReason: 'ai_disabled',
          questionId: LIKE_QUESTION.questionId,
        }),
      );
    } else {
      expect(debugSpy).not.toHaveBeenCalled();
    }
  });
});
