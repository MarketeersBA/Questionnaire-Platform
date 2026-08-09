import { useEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import OpenEndAnswerWithFollowUpThread from '../voice-feedback/OpenEndAnswerWithFollowUpThread';
import AiFollowUpPanel from '../voice-feedback/AiFollowUpPanel';
import type { AiFollowupConfig } from '../../pages/CreateSurvey/types';
import {
  canSubmitFollowUpReply,
  classifyQuestionCategory,
  getMaxFollowUpRounds,
  isFollowUpAnswerEligible,
  type FollowUpReplyChangeHandler,
  type FollowUpStateMap,
  type FollowUpTriggerHandler,
  type VoiceFollowUpTriggerHandler,
} from '../../utils/aiFollowup';
import { resolveMinAnswerLength } from '../../utils/aiFollowupConfig';
import { normalizeOpenEndAnswer } from '../../utils/voiceQuestions';
import {
  buildTasteTestFollowUpEligibility,
  evaluateTasteTestTextBlurFollowUp,
  evaluateTasteTestVoiceUploadFollowUp,
  logTasteTestFollowUpTriggerBlock,
  shouldShowTasteTestFollowUpPanel,
} from './tasteTestOpenEndInteractions';
import {
  appendTasteTestFollowUpToOpenEndValue,
} from './tasteTestOpenEndFollowUp';
import {
  FOLLOWUP_VOICE_REPLY_PLACEHOLDER,
  splitFollowUpAnswerText,
} from '../../utils/followUpAnswerPersistence';

export interface TasteTestOpenEndQuestionProps {
  questionId: string;
  questionText: string;
  effectiveType: string;
  timing?: string;
  sectionTitle?: string;
  value: unknown;
  onChange: (next: unknown) => void;
  language: 'en' | 'ar';
  brandName: string;
  publicToken?: string;
  showVoice: boolean;
  aiFollowup?: AiFollowupConfig | null;
  followUpStateMap?: FollowUpStateMap;
  /** Latest follow-up map snapshot (ref-backed in parent for async handlers). */
  getFollowUpStateSnapshot: () => FollowUpStateMap;
  onFollowUpTrigger?: FollowUpTriggerHandler;
  onVoiceFollowUpTrigger?: VoiceFollowUpTriggerHandler;
  onFollowUpReplyChange?: FollowUpReplyChangeHandler;
}

export default function TasteTestOpenEndQuestion({
  questionId,
  questionText,
  effectiveType,
  timing,
  sectionTitle,
  value,
  onChange,
  language,
  brandName,
  publicToken,
  showVoice,
  aiFollowup,
  followUpStateMap,
  getFollowUpStateSnapshot,
  onFollowUpTrigger,
  onVoiceFollowUpTrigger,
  onFollowUpReplyChange,
}: TasteTestOpenEndQuestionProps) {
  const isArabic = language === 'ar';
  const followUpEligibility = useMemo(() => buildTasteTestFollowUpEligibility({
    questionId,
    questionText,
    effectiveType,
    timing,
    sectionTitle,
  }), [questionId, questionText, effectiveType, timing, sectionTitle]);
  const minAnswerLength = resolveMinAnswerLength(aiFollowup);
  const panelState = followUpStateMap?.[questionId];
  const questionCategory = classifyQuestionCategory(questionText);

  const appendFollowUpExchange = (respondentPart: string) => {
    onChange(appendTasteTestFollowUpToOpenEndValue(
      value,
      panelState?.followUpText,
      respondentPart,
    ));
  };

  const textValue = normalizeOpenEndAnswer(value).text || '';
  const primaryText = splitFollowUpAnswerText(textValue).primaryText;

  useEffect(() => {
    const timeout = setTimeout(() => {
      const debounceCtx = {
        questionId,
        questionText,
        effectiveType,
        timing,
        sectionTitle,
        aiFollowup,
        text: primaryText,
        followUpStateMap: getFollowUpStateSnapshot(),
      };
      const evaluation = evaluateTasteTestTextBlurFollowUp(debounceCtx);
      if (evaluation.shouldTrigger && onFollowUpTrigger) {
        onFollowUpTrigger(
          questionId,
          primaryText,
          questionText,
          brandName,
          'text',
          followUpEligibility
        );
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [
    primaryText, questionId, questionText, effectiveType, timing, sectionTitle,
    aiFollowup, brandName, followUpEligibility, onFollowUpTrigger, getFollowUpStateSnapshot
  ]);

  return (
    <>
      <OpenEndAnswerWithFollowUpThread
        value={value}
        showVoice={showVoice}
        publicToken={publicToken}
        questionId={questionId}
        brandName={brandName}
        questionText={questionText}
        language={language}
        onChange={(next) => {
          const prev = normalizeOpenEndAnswer(value);
          onChange(next);
          const nextNormalized = normalizeOpenEndAnswer(next);
          const voiceCtx = {
            questionId,
            questionText,
            effectiveType,
            timing,
            sectionTitle,
            aiFollowup,
            followUpStateMap: getFollowUpStateSnapshot(),
            prevVoiceFeedbackId: prev.voice_feedback_id,
            nextVoiceFeedbackId: nextNormalized.voice_feedback_id,
          };
          const voiceEvaluation = evaluateTasteTestVoiceUploadFollowUp(voiceCtx);
          if (!voiceEvaluation.shouldTrigger) {
            logTasteTestFollowUpTriggerBlock('voice_upload', voiceEvaluation, {
              questionId,
              questionText,
            });
          }
          if (
            voiceEvaluation.shouldTrigger
            && onVoiceFollowUpTrigger
            && nextNormalized.voice_feedback_id
          ) {
            onVoiceFollowUpTrigger(
                questionId,
                nextNormalized.voice_feedback_id,
                questionText,
                brandName,
                followUpEligibility,
              );
          }
          if (!prev.voice_feedback_id && nextNormalized.voice_feedback_id) {
            toast.success(isArabic ? 'تم حفظ التسجيل' : 'Recording saved');
          }
        }}
        onBlur={(text) => {
          const blurCtx = {
            questionId,
            questionText,
            effectiveType,
            timing,
            sectionTitle,
            aiFollowup,
            text,
            followUpStateMap: getFollowUpStateSnapshot(),
          };
          const blurEvaluation = evaluateTasteTestTextBlurFollowUp(blurCtx);
          if (!blurEvaluation.shouldTrigger) {
            logTasteTestFollowUpTriggerBlock('text_blur', blurEvaluation, {
              questionId,
              questionText,
            });
            return;
          }
          if (!onFollowUpTrigger) return;
          onFollowUpTrigger(
              questionId,
              text,
              questionText,
              brandName,
              'text',
              followUpEligibility,
            );
        }}
      />

      <AnimatePresence>
        {shouldShowTasteTestFollowUpPanel({
          questionId,
          questionText,
          effectiveType,
          timing,
          sectionTitle,
          aiFollowup,
          followUpStateMap,
        }) && panelState && (
          <AiFollowUpPanel
            visible
            state={panelState}
            language={language}
            maxRounds={getMaxFollowUpRounds(aiFollowup, questionCategory)}
            variant="premium"
            showVoice={showVoice}
            publicToken={publicToken}
            replyQuestionId={`followup-${questionId}-${panelState.round}`}
            brandName={brandName}
            followUpQuestionText={panelState.followUpText}
            onReplyChange={(replyValue) => onFollowUpReplyChange?.(questionId, replyValue)}
            onReplyTextSubmit={(text) => {
              if (!aiFollowup?.apply_to_text || !isFollowUpAnswerEligible(text, minAnswerLength) || !onFollowUpTrigger) return;
              if (!canSubmitFollowUpReply(getFollowUpStateSnapshot()[questionId])) return;
              appendFollowUpExchange(text);
              onFollowUpTrigger(
                questionId,
                text,
                questionText,
                brandName,
                'text',
                followUpEligibility,
              );
            }}
            onReplyVoiceUpload={(feedbackId) => {
              if (!aiFollowup?.apply_to_voice || !onVoiceFollowUpTrigger) return;
              toast.success(isArabic ? 'تم حفظ التسجيل' : 'Recording saved');
              appendFollowUpExchange(FOLLOWUP_VOICE_REPLY_PLACEHOLDER);
              onVoiceFollowUpTrigger(
                questionId,
                feedbackId,
                questionText,
                brandName,
                followUpEligibility,
              );
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
