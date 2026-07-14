/**
 * Structured taste-test L2 AI/MI trigger evaluation and dev diagnostics.
 * Pure functions — no React dependencies.
 */

import {
  classifyQuestionCategory,
  isFollowUpAnswerEligible,
  isFollowUpCategoryEnabled,
  shouldTriggerInitialFollowUp,
  type FollowUpStateMap,
} from '../../utils/aiFollowup';
import type { AiFollowupConfig } from '../../utils/aiFollowupConfig';
import { resolveMinAnswerLength } from '../../utils/aiFollowupConfig';
import { isTasteTestOpenEndFollowUpEligible } from './tasteTestOpenEndFollowUp';

export const TASTE_TEST_FOLLOW_UP_SURFACE = 'taste_l2_open_end' as const;

export interface TasteTestOpenEndContext {
  questionId: string;
  questionText: string;
  effectiveType: string;
  timing?: string;
  sectionTitle?: string;
  aiFollowup?: AiFollowupConfig | null;
}

export interface TasteTestTextBlurContext extends TasteTestOpenEndContext {
  text: string;
  followUpStateMap: FollowUpStateMap;
}

export interface TasteTestVoiceUploadContext extends TasteTestOpenEndContext {
  followUpStateMap: FollowUpStateMap;
  prevVoiceFeedbackId?: string | null;
  nextVoiceFeedbackId?: string | null;
}

export type TasteTestFollowUpTriggerChannel = 'text_blur' | 'voice_upload';

export type TasteTestFollowUpBlockReason =
  | 'eligible'
  | 'active_follow_up'
  | 'ai_disabled'
  | 'text_channel_disabled'
  | 'voice_channel_disabled'
  | 'surface_not_enabled'
  | 'category_disabled'
  | 'answer_too_short'
  | 'voice_already_recorded'
  | 'voice_missing';

export interface TasteTestFollowUpTriggerEvaluation {
  shouldTrigger: boolean;
  blockReason: TasteTestFollowUpBlockReason;
  category: string;
  surface: typeof TASTE_TEST_FOLLOW_UP_SURFACE;
}

function isTasteTestSurfaceEligible(ctx: TasteTestOpenEndContext): boolean {
  return isTasteTestOpenEndFollowUpEligible(
    {
      questionText: ctx.questionText,
      effectiveType: ctx.effectiveType,
      timing: ctx.timing,
      sectionTitle: ctx.sectionTitle,
    },
    ctx.aiFollowup,
  );
}

function evaluateSharedProbeGates(
  ctx: TasteTestOpenEndContext,
  followUpStateMap: FollowUpStateMap,
): Pick<TasteTestFollowUpTriggerEvaluation, 'blockReason' | 'category'> | null {
  if (!shouldTriggerInitialFollowUp(ctx.questionId, followUpStateMap)) {
    return { blockReason: 'active_follow_up', category: classifyQuestionCategory(ctx.questionText) };
  }
  if (!ctx.aiFollowup?.is_enabled) {
    return { blockReason: 'ai_disabled', category: classifyQuestionCategory(ctx.questionText) };
  }
  if (!isTasteTestSurfaceEligible(ctx)) {
    return { blockReason: 'surface_not_enabled', category: classifyQuestionCategory(ctx.questionText) };
  }
  const category = classifyQuestionCategory(ctx.questionText);
  if (!isFollowUpCategoryEnabled(ctx.aiFollowup, category)) {
    return { blockReason: 'category_disabled', category };
  }
  return null;
}

function buildEvaluation(
  blockReason: TasteTestFollowUpBlockReason,
  category: string,
): TasteTestFollowUpTriggerEvaluation {
  return {
    shouldTrigger: blockReason === 'eligible',
    blockReason,
    category,
    surface: TASTE_TEST_FOLLOW_UP_SURFACE,
  };
}

/** Full gate evaluation for text blur follow-up triggers. */
export function evaluateTasteTestTextBlurFollowUp(
  ctx: TasteTestTextBlurContext,
): TasteTestFollowUpTriggerEvaluation {
  const shared = evaluateSharedProbeGates(ctx, ctx.followUpStateMap);
  if (shared) {
    return buildEvaluation(shared.blockReason, shared.category);
  }
  if (!ctx.aiFollowup?.apply_to_text) {
    const category = classifyQuestionCategory(ctx.questionText);
    return buildEvaluation('text_channel_disabled', category);
  }
  const category = classifyQuestionCategory(ctx.questionText);
  const minLength = resolveMinAnswerLength(ctx.aiFollowup);
  if (!isFollowUpAnswerEligible(ctx.text, minLength)) {
    return buildEvaluation('answer_too_short', category);
  }
  return buildEvaluation('eligible', category);
}

/** Full gate evaluation for voice upload follow-up triggers. */
export function evaluateTasteTestVoiceUploadFollowUp(
  ctx: TasteTestVoiceUploadContext,
): TasteTestFollowUpTriggerEvaluation {
  if (!ctx.aiFollowup?.is_enabled) {
    return buildEvaluation('ai_disabled', classifyQuestionCategory(ctx.questionText));
  }
  if (!ctx.aiFollowup.apply_to_voice) {
    return buildEvaluation('voice_channel_disabled', classifyQuestionCategory(ctx.questionText));
  }
  if (!isTasteTestSurfaceEligible(ctx)) {
    return buildEvaluation('surface_not_enabled', classifyQuestionCategory(ctx.questionText));
  }
  if (ctx.prevVoiceFeedbackId) {
    return buildEvaluation('voice_already_recorded', classifyQuestionCategory(ctx.questionText));
  }
  if (!ctx.nextVoiceFeedbackId) {
    return buildEvaluation('voice_missing', classifyQuestionCategory(ctx.questionText));
  }
  const shared = evaluateSharedProbeGates(ctx, ctx.followUpStateMap);
  if (shared) {
    return buildEvaluation(shared.blockReason, shared.category);
  }
  return buildEvaluation('eligible', classifyQuestionCategory(ctx.questionText));
}

const BLOCK_REASON_MESSAGES: Record<
  Exclude<TasteTestFollowUpBlockReason, 'eligible'>,
  string
> = {
  active_follow_up: 'Follow-up session already active for this question',
  ai_disabled: 'AI/MI follow-up disabled in survey config',
  text_channel_disabled: 'Text channel disabled for AI/MI',
  voice_channel_disabled: 'Voice channel disabled for AI/MI',
  surface_not_enabled: 'taste_l2_open_end surface not enabled or question ineligible',
  category_disabled: 'Question category disabled in AI/MI config',
  answer_too_short: 'Answer shorter than configured minimum length',
  voice_already_recorded: 'Voice feedback already attached — not a new upload',
  voice_missing: 'No voice feedback id on upload',
};

/** Dev-only console diagnostics when a trigger gate blocks AI/MI. */
export function logTasteTestFollowUpTriggerBlock(
  channel: TasteTestFollowUpTriggerChannel,
  evaluation: TasteTestFollowUpTriggerEvaluation,
  context: { questionId: string; questionText?: string },
): void {
  if (!import.meta.env.DEV || evaluation.shouldTrigger) return;

  console.debug('[AI MI taste L2] trigger blocked', {
    channel,
    questionId: context.questionId,
    questionText: context.questionText,
    surface: evaluation.surface,
    category: evaluation.category,
    blockReason: evaluation.blockReason,
    message: BLOCK_REASON_MESSAGES[evaluation.blockReason],
  });
}
