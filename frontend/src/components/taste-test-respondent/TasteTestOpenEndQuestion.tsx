import { useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import OpenEndAnswerWithFollowUpThread from '../voice-feedback/OpenEndAnswerWithFollowUpThread';
import AiFollowUpPanel from '../voice-feedback/AiFollowUpPanel';
import type { AiFollowupConfig } from '../../pages/CreateSurvey/types';
import {
  canSubmitFollowUpReply,
  classifyQuestionCategory,
  getMaxFollowUpRounds,
  isFollowUpReplyEligible,
  type FollowUpReplyChangeHandler,
  type FollowUpStateMap,
  type FollowUpTriggerHandler,
  type VoiceFollowUpTriggerHandler,
} from '../../utils/aiFollowup';
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
  /** Respondent-facing 1-3 follow-up rounds slider — omit to keep prior behavior. */
  onMaxRoundsChange?: (questionId: string, rounds: number) => void;
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
  const panelState = followUpStateMap?.[questionId];
  const questionCategory = classifyQuestionCategory(questionText);

  const appendFollowUpExchange = (respondentPart: string) => {
    onChange(appendTasteTestFollowUpToOpenEndValue(
      value,
      panelState?.followUpText,
      respondentPart,
    ));
  };


  // No idle timer here, deliberately.
  //
  // The moderator used to start probing 1.6s after the last keystroke,
  // guessing that a pause meant the respondent had finished. It interrupted
  // people mid-thought — they were still composing an answer when the AI cut
  // in on a half-written one. The probe now waits for a real signal that the
  // answer is done: the respondent leaving the field (`onBlur` below), which
  // is something they did rather than something we inferred.

  return (
    <>
      {/* No respondent-facing rounds control.
          How many follow-ups a study asks is a research-design decision: it
          determines how much depth the data carries, and it has to be the same
          for everyone or the answers are not comparable. Letting respondents
          lower it meant each person effectively ran a different study, and in
          practice it was used to cut the interview short. The creator's
          `max_rounds` is now the only source, enforced server-side. */}
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
              // A reply is judged by `isFollowUpReplyEligible`, not the initial-answer
              // minimum: "اه" or "لا" is a real answer to a direct probe, and
              // the five-character gate used to discard it without a word.
              if (!aiFollowup?.apply_to_text || !isFollowUpReplyEligible(text) || !onFollowUpTrigger) return;
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
