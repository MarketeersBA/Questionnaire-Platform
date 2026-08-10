import { describe, expect, it, vi } from 'vitest';
import {
  isFollowUpAnswerEligible,
  findPendingFollowUpQuestionId,
  isVoiceTranscriptReady,
  isFollowUpResponsePending,
  pollVoiceTranscript,
  pollVoiceTranscriptWithOutcome,
  MIN_FOLLOWUP_ANSWER_LENGTH,
  getMaxFollowUpRounds,
  isFollowUpCategoryEnabled,
  isFollowUpInfraFailure,
  moduleOpenAnswerToText,
  parseFollowUpResponse,
  resolveFollowUpPanelPhase,
  shouldTriggerInitialFollowUp,
  isFollowUpRoundAllowed,
  updateFollowUpReplyValue,
  isAiFollowUpEligible,
  isProbeOpenEndEligible,
  isOpenEndProbeSurface,
  OPEN_END_PROBE_SURFACES,
  classifyQuestionCategory,
} from './aiFollowup';

describe('aiFollowup', () => {
  it('requires at least MIN_FOLLOWUP_ANSWER_LENGTH characters', () => {
    expect(MIN_FOLLOWUP_ANSWER_LENGTH).toBe(5);
    expect(isFollowUpAnswerEligible('abcd')).toBe(false);
    expect(isFollowUpAnswerEligible('abcde')).toBe(true);
    expect(isFollowUpAnswerEligible('  hello  ')).toBe(true);
  });

  it('detects when voice transcript is ready', () => {
    expect(isVoiceTranscriptReady({ status: 'completed', transcript: 'hi', error: null, is_terminal: true })).toBe(false);
    expect(isVoiceTranscriptReady({ status: 'completed', transcript: 'hello world', error: null, is_terminal: true })).toBe(true);
  });

  it('pollVoiceTranscript returns transcript when ready', async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: 'pending', transcript: null, error: null, is_terminal: false })
      .mockResolvedValueOnce({ status: 'completed', transcript: 'great taste', error: null, is_terminal: true });

    const result = await pollVoiceTranscript(fetchStatus, 'fb-1', {
      intervalMs: 1,
      maxMs: 500,
    });

    expect(result).toBe('great taste');
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it('pollVoiceTranscriptWithOutcome fails fast on terminal failed status', async () => {
    const fetchStatus = vi.fn().mockResolvedValue({
      status: 'failed',
      transcript: null,
      error: 'STT error',
      is_terminal: true,
    });

    const outcome = await pollVoiceTranscriptWithOutcome(fetchStatus, 'fb-1', {
      intervalMs: 1,
      maxMs: 500,
    });

    expect(outcome).toEqual({ kind: 'failed', error: 'STT error' });
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('pollVoiceTranscriptWithOutcome returns aborted when signal fires', async () => {
    const controller = new AbortController();
    const fetchStatus = vi.fn().mockImplementation(async () => {
      controller.abort();
      return { status: 'pending', transcript: null, error: null, is_terminal: false };
    });

    const outcome = await pollVoiceTranscriptWithOutcome(fetchStatus, 'fb-1', {
      signal: controller.signal,
      intervalMs: 1,
      maxMs: 500,
    });

    expect(outcome).toEqual({ kind: 'aborted' });
  });

  it('detects infra failure from reasoning', () => {
    expect(isFollowUpInfraFailure('Backend exception: timeout')).toBe(true);
    expect(isFollowUpInfraFailure('AIGuard quota exhausted')).toBe(true);
    expect(isFollowUpInfraFailure('Answer is detailed enough')).toBe(false);
    expect(isFollowUpInfraFailure(undefined)).toBe(false);
  });

  it('extracts module open answer text', () => {
    expect(moduleOpenAnswerToText('hello')).toBe('hello');
    expect(moduleOpenAnswerToText({ text: 'world', input_modes_used: ['text'] })).toBe('world');
    expect(moduleOpenAnswerToText(['a', 'b'])).toBe('a, b');
  });

  it('parseFollowUpResponse prefers canonical field', () => {
    expect(parseFollowUpResponse({ action: 'probe', followup_text: 'A' }).followUpText).toBe('A');
    expect(parseFollowUpResponse({ action: 'probe', follow_up_question: 'B' }).followUpText).toBe('B');
  });

  it('resolveFollowUpPanelPhase covers visible states', () => {
    const state = { questionId: 'q', round: 1, followUpText: null, loading: false };
    expect(resolveFollowUpPanelPhase(false, state)).toBe('hidden');
    expect(resolveFollowUpPanelPhase(true, { ...state, loading: true })).toBe('loading');
    expect(resolveFollowUpPanelPhase(true, { ...state, followUpText: 'Hi?' })).toBe('reply');
  });

  it('shouldTriggerInitialFollowUp blocks re-entry during active session', () => {
    const active = { questionId: 'q1', round: 2, followUpText: 'Hi?', loading: false };
    expect(shouldTriggerInitialFollowUp('q1', { q1: active })).toBe(false);
    expect(shouldTriggerInitialFollowUp('q1', { q1: { ...active, loading: true } })).toBe(false);
    expect(shouldTriggerInitialFollowUp('q2', { q1: active })).toBe(true);
  });

  it('isFollowUpRoundAllowed respects max_rounds config', () => {
    expect(isFollowUpRoundAllowed(1, 2)).toBe(true);
    expect(isFollowUpRoundAllowed(2, 2)).toBe(true);
    expect(isFollowUpRoundAllowed(3, 2)).toBe(false);
  });

  it('uses category-specific round overrides when configured', () => {
    const config = {
      max_rounds: 2,
      category_config: {
        likes: { max_rounds: 1, enabled: true },
        dislikes: { max_rounds: 3, enabled: true },
        suggestions: { max_rounds: 2, enabled: false },
      },
    };

    expect(getMaxFollowUpRounds(config, 'likes')).toBe(1);
    expect(getMaxFollowUpRounds(config, 'dislikes')).toBe(3);
    expect(getMaxFollowUpRounds(config, 'overall')).toBe(2);
    expect(isFollowUpCategoryEnabled(config, 'suggestions')).toBe(false);
  });

  it('treats loading or visible follow-up text as pending respondent work', () => {
    expect(isFollowUpResponsePending({ questionId: 'q1', round: 1, followUpText: null, loading: true })).toBe(true);
    expect(isFollowUpResponsePending({ questionId: 'q1', round: 2, followUpText: 'Please explain more', loading: false })).toBe(true);
    expect(isFollowUpResponsePending({ questionId: 'q1', round: 2, followUpText: null, loading: false })).toBe(false);
  });

  it('finds the first pending follow-up within the visible question scope', () => {
    const map = {
      q1: { questionId: 'q1', round: 2, followUpText: null, loading: false },
      q2: { questionId: 'q2', round: 2, followUpText: 'Why?', loading: false },
      q3: { questionId: 'q3', round: 1, followUpText: null, loading: true },
    };

    expect(findPendingFollowUpQuestionId(map, ['q1', 'q2', 'q3'])).toBe('q2');
    expect(findPendingFollowUpQuestionId(map, ['q1'])).toBeNull();
    expect(findPendingFollowUpQuestionId(map, ['q3'])).toBe('q3');
  });

  it('treats pin-scoped heatmap follow-ups as pending work for the base question', () => {
    const map = {
      heatmap_q1__pin_1: { questionId: 'heatmap_q1__pin_1', round: 2, followUpText: 'Why there?', loading: false },
    };

    expect(findPendingFollowUpQuestionId(map, ['heatmap_q1'])).toBe('heatmap_q1');
    expect(findPendingFollowUpQuestionId(map, ['other_q'])).toBeNull();
  });

  it('updates reply value for only the targeted follow-up question', () => {
    const state = {
      q1: { questionId: 'q1', round: 2, followUpText: 'Why?', loading: false, replyValue: { text: 'old' } },
      q2: { questionId: 'q2', round: 1, followUpText: 'How?', loading: false, replyValue: { text: 'keep' } },
    };

    const next = updateFollowUpReplyValue(state, 'q1', { text: 'new answer' });

    expect(next.q1.replyValue).toEqual({ text: 'new answer' });
    expect(next.q1.round).toBe(2);
    expect(next.q1.followUpText).toBe('Why?');
    expect(next.q2).toBe(state.q2);
  });

  it('does not recreate a dismissed empty panel when clearing a draft reply', () => {
    expect(updateFollowUpReplyValue({}, 'q-new', { text: 'draft answer' })).toEqual({});
    expect(
      updateFollowUpReplyValue(
        {
          'q-done': {
            questionId: 'q-done',
            round: 2,
            followUpText: null,
            loading: false,
          },
        },
        'q-done',
        {},
      ),
    ).toEqual({
      'q-done': {
        questionId: 'q-done',
        round: 2,
        followUpText: null,
        loading: false,
      },
    });
  });

  describe('isProbeOpenEndEligible', () => {
    it('unifies taste and product open-end probe rules', () => {
      const likeInput = {
        questionText: 'What did you like about the taste?',
        effectiveType: 'open-ended' as const,
      };
      expect(isProbeOpenEndEligible({ surface: 'taste_l2_open_end', ...likeInput })).toBe(true);
      expect(isProbeOpenEndEligible({ surface: 'product_test_open_end', ...likeInput })).toBe(true);
    });

    it('exposes open-end probe surfaces for routing', () => {
      expect(OPEN_END_PROBE_SURFACES).toEqual(['taste_l2_open_end', 'product_test_open_end']);
      expect(isOpenEndProbeSurface('taste_l2_open_end')).toBe(true);
      expect(isOpenEndProbeSurface('product_test_open_end')).toBe(true);
      expect(isOpenEndProbeSurface('product_test_heatmap_comment')).toBe(false);
    });
  });

  describe('isAiFollowUpEligible', () => {
    it('allows taste L2 like/dislike/recommend open-ends without timing or section gate', () => {
      const base = {
        surface: 'taste_l2_open_end' as const,
        effectiveType: 'open-ended',
      };
      expect(isAiFollowUpEligible({ ...base, questionText: 'What did you like about the taste?' })).toBe(true);
      expect(isAiFollowUpEligible({ ...base, questionText: 'What did you dislike?' })).toBe(true);
      expect(isAiFollowUpEligible({ ...base, questionText: 'Would you recommend this to family?' })).toBe(true);
      expect(
        isAiFollowUpEligible({
          ...base,
          questionText: 'What did you like?',
          timing: 'Before Taste',
          sectionTitle: 'Screening',
        }),
      ).toBe(true);
    });

    it('rejects taste L2 generic overall open-ends and scale questions', () => {
      expect(
        isAiFollowUpEligible({
          surface: 'taste_l2_open_end',
          questionText: 'What did you think overall?',
          effectiveType: 'open-ended',
        }),
      ).toBe(false);
      expect(
        isAiFollowUpEligible({
          surface: 'taste_l2_open_end',
          questionText: 'What did you like?',
          effectiveType: 'scale',
        }),
      ).toBe(false);
    });

    it('classifies Arabic probe keywords for taste L2 open-ends', () => {
      const base = {
        surface: 'taste_l2_open_end' as const,
        effectiveType: 'open-ended' as const,
      };
      expect(isAiFollowUpEligible({ ...base, questionText: 'ما الذي يعجبك في الطعم؟' })).toBe(true);
      expect(isAiFollowUpEligible({ ...base, questionText: 'ما الذي لم يعجبك؟' })).toBe(true);
      expect(isAiFollowUpEligible({ ...base, questionText: 'هل توصية هذا المنتج لعائلتك؟' })).toBe(true);
      expect(isAiFollowUpEligible({ ...base, questionText: 'إيه أكتر حاجة عجبتك في الطعم؟' })).toBe(true);
      expect(isAiFollowUpEligible({ ...base, questionText: 'إيه أكتر حاجة ماعجبتكش في الطعم؟' })).toBe(true);
      expect(isAiFollowUpEligible({ ...base, questionText: 'إيه مقترحاتك عشان نحسن طعم abu auf؟' })).toBe(true);
    });

    it('allows product-test probe open-ends and heatmap point comments', () => {
      expect(
        isAiFollowUpEligible({
          surface: 'product_test_open_end',
          questionText: 'What would you improve?',
          effectiveType: 'open-ended',
        }),
      ).toBe(true);
      expect(
        isAiFollowUpEligible({
          surface: 'product_test_open_end',
          questionText: 'Tell us anything else',
          effectiveType: 'open-ended',
        }),
      ).toBe(false);
      expect(
        isAiFollowUpEligible({
          surface: 'product_test_heatmap_point_comment',
          questionText: 'What did you like about packaging point 1?',
        }),
      ).toBe(true);
    });

    it('classifies probe semantic categories', () => {
      expect(classifyQuestionCategory('What did you like?')).toBe('likes');
      expect(classifyQuestionCategory('What did you dislike?')).toBe('dislikes');
      expect(classifyQuestionCategory('Would you recommend this?')).toBe('suggestions');
    });

    describe('AI/MI eligibility matrix (Phase 4)', () => {
      const tasteBase = {
        surface: 'taste_l2_open_end' as const,
        effectiveType: 'open-ended',
      };

      const productOpenBase = {
        surface: 'product_test_open_end' as const,
        effectiveType: 'open-ended',
      };

      it.each([
        ['taste L2 — like', { ...tasteBase, questionText: 'What did you like about the taste?' }, true],
        ['taste L2 — dislike', { ...tasteBase, questionText: 'What did you dislike about it?' }, true],
        ['taste L2 — recommend', { ...tasteBase, questionText: 'Would you recommend this to family?' }, true],
        ['taste L2 — generic overall', { ...tasteBase, questionText: 'What did you think overall?' }, false],
        ['taste L2 — like in screening section (no structural gate)', {
          surface: 'taste_l2_open_end' as const,
          questionText: 'What did you like?',
          effectiveType: 'open-ended',
          timing: 'Before Taste',
          sectionTitle: 'Screening',
        }, true],
        ['taste L2 — scale type excluded', {
          surface: 'taste_l2_open_end' as const,
          questionText: 'What did you like?',
          effectiveType: 'scale',
        }, false],
        ['product test — recommend open-end', {
          ...productOpenBase,
          questionText: 'Why would you recommend this product to your family?',
        }, true],
        ['product test — dislike open-end', {
          ...productOpenBase,
          questionText: 'What did you dislike about the product?',
        }, true],
        ['product test — generic open-end', {
          ...productOpenBase,
          questionText: 'Tell us anything else about your experience',
        }, false],
        ['product test — module-style usage open-end', {
          ...productOpenBase,
          questionText: 'How do you typically use this product at home?',
        }, false],
        ['product test — specify-style prompt', {
          ...productOpenBase,
          questionText: 'Please specify your answer in more detail',
        }, false],
        ['heatmap — overall comment', {
          surface: 'product_test_heatmap_comment' as const,
          questionText: 'Overall comment on the packaging',
        }, true],
        ['product test open-end — scale type excluded', {
          surface: 'product_test_open_end' as const,
          questionText: 'Would you recommend this?',
          effectiveType: 'scale',
        }, false],
      ] as const)('%s', (_label, input, expected) => {
        expect(isAiFollowUpEligible(input)).toBe(expected);
      });

      it('rejects unsupported respondent surfaces (configurable modules have no surface)', () => {
        const moduleLike = {
          surface: 'configurable_module_open_end' as 'taste_l2_open_end',
          questionText: 'What did you like about the brand?',
          effectiveType: 'open-ended',
        };
        expect(isAiFollowUpEligible(moduleLike)).toBe(false);
      });

      it('respects eligible_surfaces advanced config', () => {
        const input = {
          surface: 'product_test_heatmap_comment' as const,
          questionText: 'Overall packaging comment',
        };
        const tasteProductOnly = {
          is_enabled: true,
          max_rounds: 2,
          apply_to_voice: true,
          apply_to_text: true,
          eligible_surfaces: ['taste_l2_open_end', 'product_test_open_end'],
        };
        expect(isAiFollowUpEligible(input, tasteProductOnly)).toBe(false);
        expect(isAiFollowUpEligible(input)).toBe(true);
      });
    });

    describe('taste/product parity (Phase 8)', () => {
      const probeCases = [
        ['like', 'What did you like about the taste?'],
        ['dislike', 'What did you dislike about it?'],
        ['recommend', 'Would you recommend this to your family?'],
        ['generic overall', 'What did you think overall about the product?'],
      ] as const;

      it.each(probeCases)('taste and product open-end agree on %s prompts', (_label, questionText) => {
        const taste = {
          surface: 'taste_l2_open_end' as const,
          questionText,
          effectiveType: 'open-ended',
        };
        const product = {
          surface: 'product_test_open_end' as const,
          questionText,
          effectiveType: 'open-ended',
        };
        expect(isAiFollowUpEligible(taste)).toBe(isAiFollowUpEligible(product));
      });

      it('rejects scale type on both taste and product surfaces', () => {
        const questionText = 'What did you like?';
        expect(
          isAiFollowUpEligible({
            surface: 'taste_l2_open_end',
            questionText,
            effectiveType: 'scale',
          }),
        ).toBe(false);
        expect(
          isAiFollowUpEligible({
            surface: 'product_test_open_end',
            questionText,
            effectiveType: 'scale',
          }),
        ).toBe(false);
      });

      it('isFollowUpCategoryEnabled gates likes independently of surface', () => {
        const config = {
          is_enabled: true,
          max_rounds: 2,
          apply_to_voice: true,
          apply_to_text: true,
          category_config: { likes: { enabled: false } },
        };
        expect(isFollowUpCategoryEnabled(config, 'likes')).toBe(false);
        expect(isFollowUpCategoryEnabled(config, 'dislikes')).toBe(true);
      });
    });
  });
});
