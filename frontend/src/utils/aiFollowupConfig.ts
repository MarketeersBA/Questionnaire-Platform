/**
 * Resolved defaults and helpers for Smart Follow-up (AI/MI) survey configuration.
 * Create Survey writes these fields; respondent runtime reads them with legacy fallbacks.
 */

import { FOLLOWUP_TEXT_DEBOUNCE_MS } from './followUpOrchestration';
import type { FollowUpRespondentSurface } from './aiFollowup';

/** Smart Follow-up Engine config — mirrors backend AiFollowupConfig */
export interface AiFollowupConfig {
  is_enabled: boolean;
  max_rounds: number;
  apply_to_voice: boolean;
  apply_to_text: boolean;
  custom_instructions?: string;
  category_config?: {
    likes?: { max_rounds?: number; enabled?: boolean };
    dislikes?: { max_rounds?: number; enabled?: boolean };
    suggestions?: { max_rounds?: number; enabled?: boolean };
    overall?: { max_rounds?: number; enabled?: boolean };
  };
  eligible_surfaces?: string[];
  min_answer_length?: number;
  dedupe_window_ms?: number;
}

export const DEFAULT_AI_FOLLOWUP: AiFollowupConfig = {
  is_enabled: false,
  max_rounds: 2,
  apply_to_voice: true,
  apply_to_text: true,
  eligible_surfaces: ['taste_l2_open_end', 'product_test_open_end'],
  min_answer_length: 5,
  dedupe_window_ms: 1000,
};

/** Minimum answer length when config omits the field (mirrors backend default). */
export const DEFAULT_AI_FOLLOWUP_MIN_ANSWER_LENGTH = 5;

/** Text blur debounce when config omits the field (ms). */
export const DEFAULT_AI_FOLLOWUP_DEDUPE_WINDOW_MS = FOLLOWUP_TEXT_DEBOUNCE_MS;

/** Default surfaces for newly created surveys (taste + product open ends). */
export const DEFAULT_AI_FOLLOWUP_ELIGIBLE_SURFACES: readonly FollowUpRespondentSurface[] = [
  'taste_l2_open_end',
  'product_test_open_end',
];

/** Every surface that can be toggled in Create Survey advanced controls. */
export const AI_FOLLOWUP_SURFACE_OPTIONS: ReadonlyArray<{
  id: FollowUpRespondentSurface;
  label: string;
  description: string;
}> = [
  {
    id: 'taste_l2_open_end',
    label: 'Taste test — open-ended (L2)',
    description: 'Like / dislike / recommend open ends after tasting',
  },
  {
    id: 'product_test_open_end',
    label: 'Product test — open-ended',
    description: 'Like / dislike / recommend open ends in product test phases',
  },
  {
    id: 'product_test_heatmap_comment',
    label: 'Product test — heatmap overall comment',
    description: 'Overall packaging heatmap comment field',
  },
  {
    id: 'product_test_heatmap_point_comment',
    label: 'Product test — heatmap pin comment',
    description: 'Per-pin voice/text notes on packaging heatmap',
  },
];

const ALL_CONFIGURED_SURFACES = AI_FOLLOWUP_SURFACE_OPTIONS.map((o) => o.id);

/**
 * Legacy surveys without eligible_surfaces keep all surfaces enabled.
 * New surveys persist an explicit list (default: taste + product open ends).
 */
export function resolveEligibleSurfaces(
  config?: AiFollowupConfig | null,
): readonly FollowUpRespondentSurface[] {
  const surfaces = config?.eligible_surfaces;
  if (surfaces && surfaces.length > 0) {
    return surfaces.filter((s): s is FollowUpRespondentSurface =>
      (ALL_CONFIGURED_SURFACES as readonly string[]).includes(s),
    );
  }
  return ALL_CONFIGURED_SURFACES;
}

export function resolveMinAnswerLength(config?: AiFollowupConfig | null): number {
  const n = config?.min_answer_length;
  if (typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 100) {
    return Math.floor(n);
  }
  return DEFAULT_AI_FOLLOWUP_MIN_ANSWER_LENGTH;
}

export function resolveDedupeWindowMs(config?: AiFollowupConfig | null): number {
  const n = config?.dedupe_window_ms;
  if (typeof n === 'number' && Number.isFinite(n) && n >= 200 && n <= 5000) {
    return Math.floor(n);
  }
  return DEFAULT_AI_FOLLOWUP_DEDUPE_WINDOW_MS;
}

export function isSurfaceEnabledForFollowUp(
  surface: FollowUpRespondentSurface,
  config?: AiFollowupConfig | null,
): boolean {
  return resolveEligibleSurfaces(config).includes(surface);
}

/** Normalize respondent GET ai_followup with stable advanced defaults. */
export function normalizePublicSurveyAiFollowup(
  raw?: Partial<AiFollowupConfig> | null,
): AiFollowupConfig {
  if (!raw) {
    return { ...DEFAULT_AI_FOLLOWUP };
  }
  return {
    ...DEFAULT_AI_FOLLOWUP,
    ...raw,
    is_enabled: Boolean(raw.is_enabled),
    max_rounds: raw.max_rounds ?? DEFAULT_AI_FOLLOWUP.max_rounds,
    apply_to_text: raw.apply_to_text ?? DEFAULT_AI_FOLLOWUP.apply_to_text,
    apply_to_voice: raw.apply_to_voice ?? DEFAULT_AI_FOLLOWUP.apply_to_voice,
    min_answer_length: resolveMinAnswerLength(raw),
    dedupe_window_ms: resolveDedupeWindowMs(raw),
    // Preserve null/undefined so resolveEligibleSurfaces keeps legacy all-surfaces behavior.
    eligible_surfaces: raw.eligible_surfaces,
  };
}

/** Normalize form state — ensures advanced fields have sensible values when AI/MI is enabled. */
export function withAiFollowupDefaults(config: AiFollowupConfig): AiFollowupConfig {
  return {
    ...config,
    eligible_surfaces: config.eligible_surfaces?.length
      ? config.eligible_surfaces
      : [...DEFAULT_AI_FOLLOWUP_ELIGIBLE_SURFACES],
    min_answer_length: resolveMinAnswerLength(config),
    dedupe_window_ms: resolveDedupeWindowMs(config),
  };
}
