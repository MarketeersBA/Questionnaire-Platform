/**
 * Phase 3 — focused interaction gate regression for taste-test L2 AI/MI.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_FOLLOWUP } from '../../utils/aiFollowupConfig';
import {
  buildTasteTestFollowUpEligibility,
  evaluateTasteTestTextBlurFollowUp,
  evaluateTasteTestVoiceUploadFollowUp,
  isTasteTestFollowUpSurfaceEligible,
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
  effectiveType: 'open-ended' as const,
};

describe('tasteTestOpenEndInteractions — text blur matrix', () => {
  const eligibleText = 'It tasted very creamy and smooth';

  it('fires for eligible taste L2 open-end', () => {
    const ctx = {
      ...LIKE_QUESTION,
      aiFollowup: ENABLED_CONFIG,
      text: eligibleText,
      followUpStateMap: {},
    };
    expect(shouldTriggerTasteTestTextBlurFollowUp(ctx)).toBe(true);
    expect(evaluateTasteTestTextBlurFollowUp(ctx).blockReason).toBe('eligible');
  });

  it('does not fire when taste_l2_open_end surface excluded', () => {
    const ctx = {
      ...LIKE_QUESTION,
      aiFollowup: {
        ...ENABLED_CONFIG,
        eligible_surfaces: ['product_test_open_end'],
      },
      text: eligibleText,
      followUpStateMap: {},
    };
    expect(shouldTriggerTasteTestTextBlurFollowUp(ctx)).toBe(false);
    expect(evaluateTasteTestTextBlurFollowUp(ctx).blockReason).toBe('surface_not_enabled');
  });

  it('does not fire when likes category disabled', () => {
    const ctx = {
      ...LIKE_QUESTION,
      aiFollowup: {
        ...ENABLED_CONFIG,
        category_config: { likes: { enabled: false } },
      },
      text: eligibleText,
      followUpStateMap: {},
    };
    expect(evaluateTasteTestTextBlurFollowUp(ctx).blockReason).toBe('category_disabled');
  });

  it('does not fire when text channel disabled', () => {
    const ctx = {
      ...LIKE_QUESTION,
      aiFollowup: { ...ENABLED_CONFIG, apply_to_text: false },
      text: eligibleText,
      followUpStateMap: {},
    };
    expect(evaluateTasteTestTextBlurFollowUp(ctx).blockReason).toBe('text_channel_disabled');
  });

  it('buildTasteTestFollowUpEligibility always targets taste_l2_open_end surface', () => {
    expect(buildTasteTestFollowUpEligibility(LIKE_QUESTION).surface).toBe('taste_l2_open_end');
  });
});

describe('tasteTestOpenEndInteractions — voice upload matrix', () => {
  it('starts only after a new feedback id is assigned', () => {
    const base = {
      ...LIKE_QUESTION,
      aiFollowup: ENABLED_CONFIG,
      followUpStateMap: {},
    };
    expect(
      shouldTriggerTasteTestVoiceUploadFollowUp({
        ...base,
        prevVoiceFeedbackId: null,
        nextVoiceFeedbackId: 'fb-new',
      }),
    ).toBe(true);
    expect(
      evaluateTasteTestVoiceUploadFollowUp({
        ...base,
        prevVoiceFeedbackId: 'fb-existing',
        nextVoiceFeedbackId: 'fb-new',
      }).blockReason,
    ).toBe('voice_already_recorded');
    expect(
      evaluateTasteTestVoiceUploadFollowUp({
        ...base,
        prevVoiceFeedbackId: null,
        nextVoiceFeedbackId: null,
      }).blockReason,
    ).toBe('voice_missing');
  });

  it('does not fire when voice channel disabled', () => {
    expect(
      evaluateTasteTestVoiceUploadFollowUp({
        ...LIKE_QUESTION,
        aiFollowup: { ...ENABLED_CONFIG, apply_to_voice: false },
        followUpStateMap: {},
        prevVoiceFeedbackId: null,
        nextVoiceFeedbackId: 'fb-new',
      }).blockReason,
    ).toBe('voice_channel_disabled');
  });
});

describe('tasteTestOpenEndInteractions — surface eligibility', () => {
  it('rejects scale effectiveType even when AI/MI enabled', () => {
    expect(
      isTasteTestFollowUpSurfaceEligible({
        questionId: 'BrandA_q_scale',
        questionText: 'What did you like?',
        effectiveType: 'scale',
        aiFollowup: ENABLED_CONFIG,
      }),
    ).toBe(false);
  });
});
