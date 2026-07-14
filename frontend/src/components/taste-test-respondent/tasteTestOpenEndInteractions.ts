/**
 * Pure interaction gates for TasteTestOpenEndQuestion.
 * Keeps blur/voice/panel rules testable without heavy DOM setup.
 */

import type { FollowUpEligibilityInput, FollowUpStateMap } from '../../utils/aiFollowup';
import {
  buildTasteTestOpenEndFollowUpEligibility,
  isTasteTestOpenEndFollowUpEligible,
} from './tasteTestOpenEndFollowUp';
import {
  evaluateTasteTestTextBlurFollowUp,
  evaluateTasteTestVoiceUploadFollowUp,
  type TasteTestOpenEndContext,
} from './tasteTestOpenEndTriggerEvaluation';

export type {
  TasteTestFollowUpBlockReason,
  TasteTestFollowUpTriggerChannel,
  TasteTestFollowUpTriggerEvaluation,
  TasteTestOpenEndContext,
  TasteTestTextBlurContext,
  TasteTestVoiceUploadContext,
} from './tasteTestOpenEndTriggerEvaluation';
export {
  evaluateTasteTestTextBlurFollowUp,
  evaluateTasteTestVoiceUploadFollowUp,
  logTasteTestFollowUpTriggerBlock,
} from './tasteTestOpenEndTriggerEvaluation';

export interface TasteTestPanelVisibilityContext extends TasteTestOpenEndContext {
  followUpStateMap?: FollowUpStateMap;
}

export function buildTasteTestFollowUpEligibility(
  ctx: TasteTestOpenEndContext,
): FollowUpEligibilityInput {
  return buildTasteTestOpenEndFollowUpEligibility({
    questionText: ctx.questionText,
    effectiveType: ctx.effectiveType,
    timing: ctx.timing,
    sectionTitle: ctx.sectionTitle,
  });
}

export function isTasteTestFollowUpSurfaceEligible(
  ctx: TasteTestOpenEndContext,
): boolean {
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

/** Whether initial text blur should invoke onFollowUpTrigger. */
export function shouldTriggerTasteTestTextBlurFollowUp(
  ctx: TasteTestTextBlurContext,
): boolean {
  return evaluateTasteTestTextBlurFollowUp(ctx).shouldTrigger;
}

/** Whether a new voice upload should start transcript polling / voice follow-up. */
export function shouldTriggerTasteTestVoiceUploadFollowUp(
  ctx: TasteTestVoiceUploadContext,
): boolean {
  return evaluateTasteTestVoiceUploadFollowUp(ctx).shouldTrigger;
}

/** Whether AiFollowUpPanel should render for this question. */
export function shouldShowTasteTestFollowUpPanel(
  ctx: TasteTestPanelVisibilityContext,
): boolean {
  if (!isTasteTestFollowUpSurfaceEligible(ctx)) {
    return false;
  }
  return Boolean(ctx.followUpStateMap?.[ctx.questionId]);
}
