import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { publicApi } from '../services/api';
import type { AiFollowupConfig } from '../utils/aiFollowupConfig';
import { resolveDedupeWindowMs, resolveMinAnswerLength } from '../utils/aiFollowupConfig';
import { normalizeAiInsightsMap } from '../utils/followUpAnswerPersistence';
import {
  classifyQuestionCategory,
  FOLLOWUP_INFRA_FAILURE_MESSAGES,
  getMaxFollowUpRounds,
  getOrCreateFollowUpState,
  isAiFollowUpEligible,
  isFollowUpCategoryEnabled,
  isFollowUpRoundAllowed,
  pollVoiceTranscriptWithOutcome,
  resolveFollowUpTriggerOutcome,
  shouldTriggerInitialFollowUp,
  updateFollowUpReplyValue,
  VOICE_FOLLOWUP_TIMEOUT_MESSAGES,
  type FollowUpEligibilityInput,
  type FollowUpReplyChangeHandler,
  type FollowUpSource,
  type FollowUpStateMap,
  type FollowUpTriggerHandler,
  type VoiceFollowUpTriggerHandler,
} from '../utils/aiFollowup';
import {
  FollowUpDebounceGate,
  FollowUpInFlightTracker,
  VoicePollSessionRegistry,
} from '../utils/followUpOrchestration';
import { buildFollowUpNavigationSuspendPlan } from '../utils/followUpNavigationSafety';

export interface UseFollowUpOrchestrationOptions {
  token: string | undefined;
  survey: {
    ai_followup?: AiFollowupConfig | null;
    language?: string;
    survey_objective?: string;
  } | null;
  setAiInsights?: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}

export interface UseFollowUpOrchestrationResult {
  followUpStateMap: FollowUpStateMap;
  followUpStateMapRef: MutableRefObject<FollowUpStateMap>;
  handleFollowUpTrigger: FollowUpTriggerHandler;
  handleVoiceFollowUpTrigger: VoiceFollowUpTriggerHandler;
  handleFollowUpReplyChange: FollowUpReplyChangeHandler;
  handleFollowUpDismiss: (questionIds: string[]) => void;
  dismissFollowUpPanel: (questionId: string) => void;
  /** Dismiss in-flight / draft follow-up UI for questions leaving the current page (answers preserved). */
  suspendFollowUpsForLeavingScope: (scopeQuestionIds: string[]) => void;
  /**
   * Respondent-facing override (1-3) of how many follow-up rounds THIS
   * question should probe for, set via the in-survey rounds slider. Can only
   * lower the effective cap below the admin's configured max_rounds, never
   * raise it — the admin ceiling always wins.
   */
  setRespondentRoundCap: (questionId: string, cap: number) => void;
}

export function useFollowUpOrchestration({
  token,
  survey,
  setAiInsights,
}: UseFollowUpOrchestrationOptions): UseFollowUpOrchestrationResult {
  const [followUpStateMap, setFollowUpStateMap] = useState<FollowUpStateMap>({});
  const followUpStateMapRef = useRef(followUpStateMap);

  const inFlightTrackerRef = useRef(new FollowUpInFlightTracker());
  const debounceGateRef = useRef(new FollowUpDebounceGate());
  const voicePollRegistryRef = useRef(new VoicePollSessionRegistry());
  const respondentRoundCapsRef = useRef<Record<string, number>>({});

  const setRespondentRoundCap = useCallback((questionId: string, cap: number) => {
    respondentRoundCapsRef.current[questionId] = cap;
  }, []);

  useEffect(() => {
    followUpStateMapRef.current = followUpStateMap;
  }, [followUpStateMap]);

  useEffect(() => () => {
    voicePollRegistryRef.current.cancelAll();
    inFlightTrackerRef.current.reset();
  }, []);

  const surveyLanguage = survey?.language === 'ar' ? 'ar' : 'en';

  const dismissFollowUpPanel = useCallback((qId: string) => {
    setFollowUpStateMap((prev) => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });
  }, []);

  const handleFollowUpDismiss = useCallback((questionIds: string[]) => {
    if (questionIds.length === 0) return;
    setFollowUpStateMap((prev) => {
      const next = { ...prev };
      questionIds.forEach((qId) => {
        delete next[qId];
      });
      return next;
    });
  }, []);

  const suspendFollowUpsForLeavingScope = useCallback((scopeQuestionIds: string[]) => {
    if (scopeQuestionIds.length === 0) return;

    const { suspendKeys } = buildFollowUpNavigationSuspendPlan(
      scopeQuestionIds,
      followUpStateMapRef.current,
    );
    if (suspendKeys.length === 0) return;

    suspendKeys.forEach((key) => {
      voicePollRegistryRef.current.cancel(key);
      inFlightTrackerRef.current.release(key);
    });
    handleFollowUpDismiss(suspendKeys);
  }, [handleFollowUpDismiss]);

  const handleFollowUpReplyChange: FollowUpReplyChangeHandler = useCallback((questionId, replyValue) => {
    setFollowUpStateMap((prev) => updateFollowUpReplyValue(prev, questionId, replyValue));
  }, []);

  const runFollowUpRequest = useCallback(async (
    qId: string,
    answer: string,
    questionText: string,
    brand: string,
    source: FollowUpSource,
    eligibility?: FollowUpEligibilityInput,
  ): Promise<boolean> => {
    if (!survey?.ai_followup?.is_enabled) return false;
    if (eligibility && !isAiFollowUpEligible(eligibility, survey.ai_followup)) {
      dismissFollowUpPanel(qId);
      return false;
    }

    const requestRound = followUpStateMapRef.current[qId]?.round ?? 1;
    const questionCategory = classifyQuestionCategory(questionText);
    if (!isFollowUpCategoryEnabled(survey.ai_followup, questionCategory)) {
      dismissFollowUpPanel(qId);
      return false;
    }
    const adminMaxRounds = getMaxFollowUpRounds(survey.ai_followup, questionCategory);
    const respondentCap = respondentRoundCapsRef.current[qId];
    // Respondent's slider choice can only lower the effective cap below the
    // admin's configured ceiling, never raise it.
    const maxRounds = respondentCap ? Math.min(adminMaxRounds, respondentCap) : adminMaxRounds;
    if (!isFollowUpRoundAllowed(requestRound, maxRounds)) {
      dismissFollowUpPanel(qId);
      return false;
    }

    setFollowUpStateMap((prev) => ({
      ...prev,
      [qId]: { ...getOrCreateFollowUpState(prev, qId), loading: true, round: requestRound },
    }));

    const res = await publicApi.requestFollowUp(token!, {
      question_id: qId,
      question_text: questionText,
      answer_text: answer,
      current_round: requestRound,
      brand_name: brand,
      survey_objective: survey?.survey_objective,
      custom_instructions: survey?.ai_followup?.custom_instructions,
      source,
      question_category: questionCategory,
      respondent_surface: eligibility?.surface,
    });

    const outcome = resolveFollowUpTriggerOutcome(res, requestRound);

    if (outcome.kind === 'probe') {
      setFollowUpStateMap((prev) => ({
        ...prev,
        [qId]: {
          ...getOrCreateFollowUpState(prev, qId),
          round: outcome.nextRound,
          followUpText: outcome.followUpText,
          loading: false,
          quality: res.quality ?? null,
          replyValue: {},
        },
      }));
      if (outcome.keyInsights.length > 0 && setAiInsights) {
        setAiInsights((prev) => normalizeAiInsightsMap({
          ...prev,
          [qId]: [...(prev[qId] || []), ...outcome.keyInsights],
        }));
      }
      return true;
    }

    if (outcome.showInfraToast) {
      if (import.meta.env.DEV) {
        console.warn('[AI Follow-up] Infrastructure failure:', res.reasoning);
      }
      toast.info(FOLLOWUP_INFRA_FAILURE_MESSAGES[surveyLanguage]);
    }
    dismissFollowUpPanel(qId);
    return true;
  }, [
    survey,
    token,
    dismissFollowUpPanel,
    surveyLanguage,
    setAiInsights,
  ]);

  const handleFollowUpTrigger: FollowUpTriggerHandler = useCallback(async (
    qId,
    answer,
    questionText,
    brand,
    source = 'text',
    eligibility,
  ) => {
    const isInitialTextTrigger =
      source === 'text'
      && shouldTriggerInitialFollowUp(qId, followUpStateMapRef.current);

    if (isInitialTextTrigger) {
      const debounceMs = resolveDedupeWindowMs(survey?.ai_followup);
      if (!debounceGateRef.current.shouldAllow(qId, answer, debounceMs)) {
        return false;
      }
    }

    if (!inFlightTrackerRef.current.tryAcquire(qId)) {
      return false;
    }

    try {
      return await runFollowUpRequest(qId, answer, questionText, brand, source, eligibility);
    } catch (err) {
      console.error('AI Follow-up error:', err);
      toast.info(FOLLOWUP_INFRA_FAILURE_MESSAGES[surveyLanguage]);
      dismissFollowUpPanel(qId);
      return true;
    } finally {
      inFlightTrackerRef.current.release(qId);
    }
  }, [runFollowUpRequest, dismissFollowUpPanel, surveyLanguage]);

  const handleVoiceFollowUpTrigger: VoiceFollowUpTriggerHandler = useCallback(async (
    qId,
    feedbackId,
    questionText,
    brand,
    eligibility,
  ) => {
    if (!token || !survey?.ai_followup?.is_enabled || !survey?.ai_followup?.apply_to_voice) return;
    if (eligibility && !isAiFollowUpEligible(eligibility, survey?.ai_followup)) return;
    const state = followUpStateMapRef.current[qId];
    const isReplyRound = Boolean(state?.followUpText);
    if (!isReplyRound && !shouldTriggerInitialFollowUp(qId, followUpStateMapRef.current)) return;
    if (!inFlightTrackerRef.current.tryAcquire(qId)) return;

    const pollSignal = voicePollRegistryRef.current.start(qId);

    setFollowUpStateMap((prev) => ({
      ...prev,
      [qId]: { ...getOrCreateFollowUpState(prev, qId), loading: true },
    }));

    try {
      const pollOutcome = await pollVoiceTranscriptWithOutcome(
        (id) => publicApi.getVoiceStatus(token, id),
        feedbackId,
        {
          signal: pollSignal,
          minAnswerLength: resolveMinAnswerLength(survey?.ai_followup),
        },
      );

      if (pollOutcome.kind === 'ready') {
        const handled = await runFollowUpRequest(
          qId,
          pollOutcome.transcript,
          questionText,
          brand,
          'voice',
          eligibility,
        );
        if (!handled) {
          dismissFollowUpPanel(qId);
        }
        return;
      }

      if (pollOutcome.kind === 'aborted') {
        dismissFollowUpPanel(qId);
        return;
      }

      dismissFollowUpPanel(qId);
      if (pollOutcome.kind === 'failed') {
        if (import.meta.env.DEV) {
          console.warn('[AI Follow-up] Voice transcription failed:', pollOutcome.error);
        }
        toast.info(FOLLOWUP_INFRA_FAILURE_MESSAGES[surveyLanguage]);
        return;
      }
      toast.info(VOICE_FOLLOWUP_TIMEOUT_MESSAGES[surveyLanguage]);
    } catch (err) {
      console.error('Voice follow-up polling error:', err);
      dismissFollowUpPanel(qId);
      toast.info(FOLLOWUP_INFRA_FAILURE_MESSAGES[surveyLanguage]);
    } finally {
      voicePollRegistryRef.current.cancel(qId);
      inFlightTrackerRef.current.release(qId);
    }
  }, [
    token,
    survey,
    runFollowUpRequest,
    dismissFollowUpPanel,
    surveyLanguage,
  ]);

  return {
    followUpStateMap,
    followUpStateMapRef,
    handleFollowUpTrigger,
    handleVoiceFollowUpTrigger,
    handleFollowUpReplyChange,
    handleFollowUpDismiss,
    dismissFollowUpPanel,
    suspendFollowUpsForLeavingScope,
    setRespondentRoundCap,
  };
}
