import { describe, expect, it } from 'vitest';
import {
  AI_FOLLOWUP_SURFACE_OPTIONS,
  DEFAULT_AI_FOLLOWUP,
  DEFAULT_AI_FOLLOWUP_ELIGIBLE_SURFACES,
  isSurfaceEnabledForFollowUp,
  resolveDedupeWindowMs,
  resolveEligibleSurfaces,
  resolveMinAnswerLength,
  normalizePublicSurveyAiFollowup,
  withAiFollowupDefaults,
} from './aiFollowupConfig';

describe('aiFollowupConfig', () => {
  it('DEFAULT_AI_FOLLOWUP seeds taste and product open-end surfaces', () => {
    expect(DEFAULT_AI_FOLLOWUP.eligible_surfaces).toEqual([
      'taste_l2_open_end',
      'product_test_open_end',
    ]);
    expect(DEFAULT_AI_FOLLOWUP.min_answer_length).toBe(5);
    expect(DEFAULT_AI_FOLLOWUP.dedupe_window_ms).toBe(1000);
  });

  it('resolveEligibleSurfaces uses explicit config when set', () => {
    expect(resolveEligibleSurfaces({
      ...DEFAULT_AI_FOLLOWUP,
      eligible_surfaces: ['taste_l2_open_end'],
    })).toEqual(['taste_l2_open_end']);
  });

  it('resolveEligibleSurfaces keeps legacy all-surfaces behavior when unset', () => {
    const legacy = { ...DEFAULT_AI_FOLLOWUP, eligible_surfaces: undefined };
    expect(resolveEligibleSurfaces(legacy)).toEqual(AI_FOLLOWUP_SURFACE_OPTIONS.map((o) => o.id));
  });

  it('resolveMinAnswerLength and resolveDedupeWindowMs clamp invalid values', () => {
    expect(resolveMinAnswerLength({ ...DEFAULT_AI_FOLLOWUP, min_answer_length: 0 })).toBe(5);
    expect(resolveMinAnswerLength({ ...DEFAULT_AI_FOLLOWUP, min_answer_length: 8 })).toBe(8);
    expect(resolveDedupeWindowMs({ ...DEFAULT_AI_FOLLOWUP, dedupe_window_ms: 100 })).toBe(1000);
    expect(resolveDedupeWindowMs({ ...DEFAULT_AI_FOLLOWUP, dedupe_window_ms: 1200 })).toBe(1200);
  });

  it('isSurfaceEnabledForFollowUp respects eligible_surfaces', () => {
    const config = {
      ...DEFAULT_AI_FOLLOWUP,
      eligible_surfaces: [...DEFAULT_AI_FOLLOWUP_ELIGIBLE_SURFACES],
    };
    expect(isSurfaceEnabledForFollowUp('taste_l2_open_end', config)).toBe(true);
    expect(isSurfaceEnabledForFollowUp('product_test_heatmap_comment', config)).toBe(false);
  });

  it('withAiFollowupDefaults fills advanced fields for new surveys', () => {
    const normalized = withAiFollowupDefaults({
      is_enabled: true,
      max_rounds: 2,
      apply_to_voice: true,
      apply_to_text: true,
    });
    expect(normalized.eligible_surfaces).toEqual([
      'taste_l2_open_end',
      'product_test_open_end',
    ]);
    expect(normalized.min_answer_length).toBe(5);
    expect(normalized.dedupe_window_ms).toBe(1000);
  });

  it('normalizePublicSurveyAiFollowup merges legacy enabled-only payloads', () => {
    const normalized = normalizePublicSurveyAiFollowup({ is_enabled: true });
    expect(normalized.is_enabled).toBe(true);
    expect(normalized.min_answer_length).toBe(5);
    expect(normalized.dedupe_window_ms).toBe(1000);
    expect(normalized.apply_to_text).toBe(true);
    expect(isSurfaceEnabledForFollowUp('taste_l2_open_end', normalized)).toBe(true);
  });

  it('normalizePublicSurveyAiFollowup preserves explicit eligible_surfaces', () => {
    const normalized = normalizePublicSurveyAiFollowup({
      is_enabled: true,
      eligible_surfaces: ['product_test_open_end'],
    });
    expect(normalized.eligible_surfaces).toEqual(['product_test_open_end']);
    expect(isSurfaceEnabledForFollowUp('taste_l2_open_end', normalized)).toBe(false);
  });
});
