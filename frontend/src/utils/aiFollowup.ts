/**
 * Shared constants and helpers for the Smart Follow-up Engine (live AI probing).
 * Mirrors backend/smart_followup.py minimum answer length (5 chars).
 */

import type { AiFollowupConfig } from './aiFollowupConfig';
import { isSurfaceEnabledForFollowUp } from './aiFollowupConfig';

export const MIN_FOLLOWUP_ANSWER_LENGTH = 5;

export const VOICE_TRANSCRIPT_POLL_INTERVAL_MS = 1500;
export const VOICE_TRANSCRIPT_POLL_MAX_MS = 30_000;

export type FollowUpSource = 'text' | 'voice';

/** Whether an answer is long enough to trigger AI follow-up (frontend + backend aligned). */
export function isFollowUpAnswerEligible(
  text: string,
  minLength: number = MIN_FOLLOWUP_ANSWER_LENGTH,
): boolean {
  return text.trim().length >= minLength;
}

export type FollowUpTriggerHandler = (
  questionId: string,
  answer: string,
  questionText: string,
  brandName: string,
  source?: FollowUpSource,
  eligibility?: FollowUpEligibilityInput,
) => void | boolean | Promise<void | boolean>;

export type VoiceFollowUpTriggerHandler = (
  questionId: string,
  feedbackId: string,
  questionText: string,
  brandName: string,
  eligibility?: FollowUpEligibilityInput,
) => void | Promise<void>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface VoiceStatusResult {
  status: string;
  transcript: string | null;
  error: string | null;
  is_terminal: boolean;
}

export type QuestionCategory = 'likes' | 'dislikes' | 'suggestions' | 'overall' | 'general';

/** Terminal voice statuses — polling should stop when reached. */
const TERMINAL_VOICE_STATUSES = new Set(['completed', 'failed', 'stored']);

export function isVoiceStatusTerminal(status: string): boolean {
  return TERMINAL_VOICE_STATUSES.has(status);
}

export function isVoiceTranscriptReady(
  result: VoiceStatusResult,
  minLength: number = MIN_FOLLOWUP_ANSWER_LENGTH,
): boolean {
  return Boolean(
    result.transcript && isFollowUpAnswerEligible(result.transcript, minLength),
  );
}

/**
 * Poll public voice-status until transcript is ready, processing fails, or timeout.
 * Returns trimmed transcript or null.
 */
export async function pollVoiceTranscript(
  fetchStatus: (feedbackId: string) => Promise<VoiceStatusResult>,
  feedbackId: string,
  options?: {
    signal?: AbortSignal;
    onPolling?: () => void;
    intervalMs?: number;
    maxMs?: number;
    minAnswerLength?: number;
  },
): Promise<string | null> {
  const intervalMs = options?.intervalMs ?? VOICE_TRANSCRIPT_POLL_INTERVAL_MS;
  const maxMs = options?.maxMs ?? VOICE_TRANSCRIPT_POLL_MAX_MS;
  const minLength = options?.minAnswerLength ?? MIN_FOLLOWUP_ANSWER_LENGTH;
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxMs) {
    if (options?.signal?.aborted) return null;

    const result = await fetchStatus(feedbackId);

    if (isVoiceTranscriptReady(result, minLength)) {
      return result.transcript!.trim();
    }

    if (result.is_terminal || isVoiceStatusTerminal(result.status)) {
      return null;
    }

    options?.onPolling?.();
    await sleep(intervalMs);
  }

  return null;
}

export type VoiceTranscriptPollOutcome =
  | { kind: 'ready'; transcript: string }
  | { kind: 'aborted' }
  | { kind: 'timeout' }
  | { kind: 'failed'; error: string | null }
  | { kind: 'unavailable' };

/**
 * Abort-safe voice polling with explicit terminal outcomes for fast failure paths.
 */
export async function pollVoiceTranscriptWithOutcome(
  fetchStatus: (feedbackId: string) => Promise<VoiceStatusResult>,
  feedbackId: string,
  options?: {
    signal?: AbortSignal;
    onPolling?: () => void;
    intervalMs?: number;
    maxMs?: number;
    minAnswerLength?: number;
  },
): Promise<VoiceTranscriptPollOutcome> {
  const intervalMs = options?.intervalMs ?? VOICE_TRANSCRIPT_POLL_INTERVAL_MS;
  const maxMs = options?.maxMs ?? VOICE_TRANSCRIPT_POLL_MAX_MS;
  const minLength = options?.minAnswerLength ?? MIN_FOLLOWUP_ANSWER_LENGTH;
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxMs) {
    if (options?.signal?.aborted) {
      return { kind: 'aborted' };
    }

    const result = await fetchStatus(feedbackId);

    if (isVoiceTranscriptReady(result, minLength)) {
      return { kind: 'ready', transcript: result.transcript!.trim() };
    }

    if (result.is_terminal || isVoiceStatusTerminal(result.status)) {
      if (result.status === 'failed') {
        return { kind: 'failed', error: result.error };
      }
      return { kind: 'unavailable' };
    }

    options?.onPolling?.();
    await sleep(intervalMs);
  }

  return { kind: 'timeout' };
}

export const VOICE_FOLLOWUP_TIMEOUT_MESSAGES = {
  en: 'Voice saved; AI follow-up unavailable for this answer',
  ar: 'تم حفظ التسجيل؛ المتابعة الذكية غير متاحة لهذه الإجابة',
} as const;

export const FOLLOWUP_INFRA_FAILURE_MESSAGES = {
  en: 'AI moderation temporarily unavailable — your answer was saved',
  ar: 'المتابعة الذكية غير متاحة مؤقتاً — تم حفظ إجابتك',
} as const;

/** Shared follow-up UI state across respondent paths */
export interface FollowUpPanelState {
  questionId: string | null;
  round: number;
  followUpText: string | null;
  loading: boolean;
  quality?: string | null;
  replyValue?: unknown;
}

export type FollowUpStateMap = Record<string, FollowUpPanelState>;

export type FollowUpReplyChangeHandler = (
  questionId: string,
  replyValue: unknown,
) => void;

export function getOrCreateFollowUpState(
  map: FollowUpStateMap,
  questionId: string,
): FollowUpPanelState {
  return map[questionId] || {
    questionId,
    round: 1,
    followUpText: null,
    loading: false,
    quality: null,
  };
}

export function updateFollowUpReplyValue(
  map: FollowUpStateMap,
  questionId: string,
  replyValue: unknown,
): FollowUpStateMap {
  return {
    ...map,
    [questionId]: {
      ...getOrCreateFollowUpState(map, questionId),
      replyValue,
    },
  };
}

export function isFollowUpResponsePending(
  state?: FollowUpPanelState | null,
): boolean {
  return Boolean(state?.loading || state?.followUpText);
}

export function findPendingFollowUpQuestionId(
  map: FollowUpStateMap | undefined,
  questionIds: string[],
): string | null {
  if (!map) return null;
  return questionIds.find((questionId) => {
    if (isFollowUpResponsePending(map[questionId])) return true;
    const scopedPrefix = `${questionId}__pin_`;
    return Object.entries(map).some(([key, state]) =>
      key.startsWith(scopedPrefix) && isFollowUpResponsePending(state),
    );
  }) ?? null;
}

/** Detect backend infra failures (not quality-based completion) */
export function isFollowUpInfraFailure(reasoning?: string | null): boolean {
  if (!reasoning) return false;
  const lower = reasoning.toLowerCase();
  return lower.includes('exception') || lower.includes('quota');
}

/** Extract displayable text from module open answers (string or OpenEndAnswer) */
export function moduleOpenAnswerToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string').join(', ');
  if (value && typeof value === 'object' && 'text' in value) {
    return String((value as { text?: string }).text || '');
  }
  return '';
}

/** Default max probing rounds — mirrors backend AiFollowupConfig */
export const DEFAULT_MAX_FOLLOWUP_ROUNDS = 2;

export interface FollowUpCategoryConfig {
  max_rounds?: number;
  enabled?: boolean;
}

export interface FollowUpRoundConfig {
  max_rounds?: number;
  category_config?: Partial<Record<QuestionCategory, FollowUpCategoryConfig>>;
}

function normalizeFollowUpRounds(n: unknown): number | null {
  return typeof n === 'number' && n >= 1 ? n : null;
}

export function isFollowUpCategoryEnabled(
  aiFollowup?: FollowUpRoundConfig | null,
  category?: QuestionCategory,
): boolean {
  if (!category) return true;
  return aiFollowup?.category_config?.[category]?.enabled !== false;
}

export function getMaxFollowUpRounds(
  aiFollowup?: FollowUpRoundConfig | null,
  category?: QuestionCategory,
): number {
  const categoryRounds = category && isFollowUpCategoryEnabled(aiFollowup, category)
    ? normalizeFollowUpRounds(aiFollowup?.category_config?.[category]?.max_rounds)
    : null;
  const globalRounds = normalizeFollowUpRounds(aiFollowup?.max_rounds);
  return categoryRounds ?? globalRounds ?? DEFAULT_MAX_FOLLOWUP_ROUNDS;
}

/** Whether another follow-up API call is allowed for this round index */
export function isFollowUpRoundAllowed(requestRound: number, maxRounds: number): boolean {
  return requestRound >= 1 && requestRound <= maxRounds;
}

/** Whether the respondent has finished all configured probing rounds */
export function isFollowUpExhausted(activeRound: number, maxRounds: number): boolean {
  return activeRound > maxRounds;
}

/** Whether the panel should accept a reply that triggers another probe */
export function canSubmitFollowUpReply(state: FollowUpPanelState): boolean {
  return !state.loading && Boolean(state.followUpText);
}

/** Whether the primary open-end input should trigger a new follow-up session */
export function shouldTriggerInitialFollowUp(
  questionId: string,
  map: FollowUpStateMap,
): boolean {
  const state = map[questionId];
  if (!state) return true;
  if (state.loading) return false;
  if (state.questionId === questionId) return false;
  return true;
}

export function classifyQuestionCategory(questionText: string): QuestionCategory {
  const qLower = questionText.toLowerCase();

  // Dislikes before likes — Egyptian negatives like ماعجبتكش contain عجب roots.
  if (/(dislike|hate|negative|didn't like|did not like|كرهت|لم يعجبك|لم تعجبك|ماعجبتكش|ما عجبتكش|ماعجبكش|ما عجبكش|ماعجبنيش|لم يعجب)/i.test(qLower)) {
    return 'dislikes';
  }
  if (/(like|enjoy|appreciate|positive|تحب|اعجبك|يعجبك|عجبتك|عجبك|أكتر حاجة عجبتك)/i.test(qLower)) {
    return 'likes';
  }
  if (/(suggest|improve|recommend|change|اقترح|اقتراح|مقترح|مقترحات|تحسين|نحسن|توصية)/i.test(qLower)) {
    return 'suggestions';
  }
  if (/(overall|general|think|feel|عام|رأيك|شعورك)/i.test(qLower)) {
    return 'overall';
  }
  return 'general';
}

/** Semantic categories that may receive live AI/MI probing */
export const FOLLOW_UP_PROBE_CATEGORIES = ['likes', 'dislikes', 'suggestions'] as const;
export type FollowUpProbeCategory = (typeof FOLLOW_UP_PROBE_CATEGORIES)[number];

export function isFollowUpProbeCategory(
  category: QuestionCategory,
): category is FollowUpProbeCategory {
  return (FOLLOW_UP_PROBE_CATEGORIES as readonly QuestionCategory[]).includes(category);
}

/** Respondent surfaces allowed to invoke live AI/MI follow-up */
export type FollowUpRespondentSurface =
  | 'taste_l2_open_end'
  | 'product_test_open_end'
  | 'product_test_heatmap_comment'
  | 'product_test_heatmap_point_comment';

/** Open-end surfaces that share the same probe eligibility rules (likes / dislikes / suggestions). */
export const OPEN_END_PROBE_SURFACES = [
  'taste_l2_open_end',
  'product_test_open_end',
] as const satisfies readonly FollowUpRespondentSurface[];

export type OpenEndProbeSurface = (typeof OPEN_END_PROBE_SURFACES)[number];

export interface FollowUpEligibilityInput {
  surface: FollowUpRespondentSurface;
  questionText: string;
  effectiveType?: string;
  /** Retained for analytics / backend context; no longer gates eligibility on taste test. */
  timing?: string;
  /** Retained for analytics / backend context; no longer gates eligibility on taste test. */
  sectionTitle?: string;
}

export function isOpenEndEffectiveType(effectiveType?: string): boolean {
  return effectiveType === 'open-ended' || effectiveType === 'text';
}

/**
 * Shared probe eligibility for taste-test and product-test open-ended questions.
 * Requires open-end type and a semantic category of likes, dislikes, or suggestions.
 * Excludes overall and general categories by design.
 */
export function isProbeOpenEndEligible(input: FollowUpEligibilityInput): boolean {
  if (!isOpenEndEffectiveType(input.effectiveType)) return false;
  return isFollowUpProbeCategory(classifyQuestionCategory(input.questionText));
}

export function isOpenEndProbeSurface(
  surface: FollowUpRespondentSurface,
): surface is OpenEndProbeSurface {
  return (OPEN_END_PROBE_SURFACES as readonly FollowUpRespondentSurface[]).includes(surface);
}

/**
 * Single eligibility gate for live AI/MI follow-up.
 * Taste/product-test open-ends: like, dislike, recommend only (unified rules).
 * Heatmap: per-pin comment / voice note feedback.
 * Configurable modules, specify inputs, and generic open-ends: excluded.
 */
export function isAiFollowUpEligible(
  input: FollowUpEligibilityInput,
  config?: AiFollowupConfig | null,
): boolean {
  if (!isSurfaceEnabledForFollowUp(input.surface, config)) {
    return false;
  }

  switch (input.surface) {
    case 'taste_l2_open_end':
    case 'product_test_open_end':
      return isProbeOpenEndEligible(input);
    case 'product_test_heatmap_point_comment':
    case 'product_test_heatmap_comment':
      return true;
    default:
      return false;
  }
}


export type FollowUpPanelPhase = 'hidden' | 'loading' | 'reply' | 'empty';

export function resolveFollowUpPanelPhase(
  visible: boolean,
  state: FollowUpPanelState,
): FollowUpPanelPhase {
  if (!visible) return 'hidden';
  if (state.loading) return 'loading';
  if (state.followUpText) return 'reply';
  return 'empty';
}

/** Parsed API response shape for follow-up trigger resolution */
export interface ParsedFollowUpResponse {
  action: 'probe' | 'complete';
  followUpText: string | null;
  keyInsights: string[];
  reasoning?: string;
}

export type FollowUpTriggerOutcomeKind = 'probe' | 'complete' | 'infra_failure';

export interface FollowUpTriggerOutcome {
  kind: FollowUpTriggerOutcomeKind;
  followUpText: string | null;
  nextRound: number;
  keyInsights: string[];
  showInfraToast: boolean;
}

/** Normalize follow-up API response — primary field followup_text with legacy fallback */
export function parseFollowUpResponse(res: {
  action: 'probe' | 'complete';
  followup_text?: string | null;
  follow_up_question?: string | null;
  key_insights?: string[];
  reasoning?: string;
}): ParsedFollowUpResponse {
  const followUpText = res.followup_text ?? res.follow_up_question ?? null;
  return {
    action: res.action,
    followUpText,
    keyInsights: res.key_insights ?? [],
    reasoning: res.reasoning,
  };
}

/** Pure state-machine outcome for handleFollowUpTrigger (testable without React) */
export function resolveFollowUpTriggerOutcome(
  res: Parameters<typeof parseFollowUpResponse>[0],
  requestRound: number,
): FollowUpTriggerOutcome {
  const parsed = parseFollowUpResponse(res);
  if (parsed.action === 'probe' && parsed.followUpText) {
    return {
      kind: 'probe',
      followUpText: parsed.followUpText,
      nextRound: requestRound + 1,
      keyInsights: parsed.keyInsights,
      showInfraToast: false,
    };
  }
  const infra = isFollowUpInfraFailure(parsed.reasoning);
  return {
    kind: infra ? 'infra_failure' : 'complete',
    followUpText: null,
    nextRound: 1,
    keyInsights: [],
    showInfraToast: infra,
  };
}
