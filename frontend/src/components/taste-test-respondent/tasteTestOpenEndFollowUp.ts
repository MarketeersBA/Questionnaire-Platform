import {
  appendFollowUpExchangeToText,
  appendFollowUpExchangeToOpenEndValue,
} from '../../utils/followUpAnswerPersistence';
import type { FollowUpEligibilityInput } from '../../utils/aiFollowup';
import type { AiFollowupConfig } from '../../utils/aiFollowupConfig';
import { isAiFollowUpEligible } from '../../utils/aiFollowup';

export interface TasteTestOpenEndFollowUpContext {
  questionText: string;
  effectiveType: string;
  timing?: string;
  sectionTitle?: string;
}

/** Build taste-test L2 follow-up eligibility input (surface always taste_l2_open_end). */
export function buildTasteTestOpenEndFollowUpEligibility(
  ctx: TasteTestOpenEndFollowUpContext,
): FollowUpEligibilityInput {
  return {
    surface: 'taste_l2_open_end',
    questionText: ctx.questionText,
    effectiveType: ctx.effectiveType,
    timing: ctx.timing,
    sectionTitle: ctx.sectionTitle,
  };
}

export function isTasteTestOpenEndFollowUpEligible(
  ctx: TasteTestOpenEndFollowUpContext,
  config?: AiFollowupConfig | null,
): boolean {
  return isAiFollowUpEligible(buildTasteTestOpenEndFollowUpEligibility(ctx), config);
}

/** Append AI follow-up exchange into stored open-end answer text. */
export function appendTasteTestFollowUpToAnswer(
  currentText: string,
  followUpPrompt: string | null | undefined,
  respondentPart: string,
): string {
  return appendFollowUpExchangeToText(currentText, followUpPrompt, respondentPart);
}

export function appendTasteTestFollowUpToOpenEndValue(
  value: unknown,
  followUpPrompt: string | null | undefined,
  respondentPart: string,
) {
  return appendFollowUpExchangeToOpenEndValue(value, followUpPrompt, respondentPart);
}
