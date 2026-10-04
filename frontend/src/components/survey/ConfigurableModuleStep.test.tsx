import { describe, expect, it } from 'vitest';
import { asBrandPipelineCarrier } from '../../utils/moduleQuestionUtils';
import { skipSoleBrandSteps } from '../../utils/purchaseFunnelBrandLogic';
import type { ModuleQuestion } from '../../types/questionModules';

/**
 * The 3-month brand question is hidden by ConfigurableModuleStep when the
 * funnel leaves a single brand. This locks that decision: one listed brand is
 * recorded and the screen is not a stop.
 */
const threeMonth: ModuleQuestion = {
    question_id: 'pf_q6',
    type: 'mcq',
    ar_text: '',
    en_text: 'Which brands have you used in the past three months?',
    order: 6,
    required: true,
    has_other: true,
    brand_pipeline: { mode: 'include_prior', sources: ['pf_q5'], strategy: 'cascade' },
};

describe('purchase funnel hides a one-choice brand question', () => {
    it('moves past the 3-month question and keeps the only brand', () => {
        const result = skipSoleBrandSteps(
            [
                {
                    id: threeMonth.question_id,
                    type: threeMonth.type,
                    brandChoice: true,
                    carrier: asBrandPipelineCarrier(threeMonth),
                },
                {
                    id: 'pf_q8',
                    type: 'mcq',
                    brandChoice: false,
                    carrier: asBrandPipelineCarrier({
                        ...threeMonth,
                        question_id: 'pf_q8',
                        brand_pipeline: undefined,
                        has_other: false,
                    }),
                },
            ],
            0,
            { pf_q5: ['دارا'] },
            ['دارا', 'Other'],
            'forward',
        );

        expect(result.action).toBe('move');
        expect(result.index).toBe(1);
        expect(result.answers.pf_q6).toEqual(['دارا']);
    });

    it('stays on the question when two brands are listed', () => {
        const result = skipSoleBrandSteps(
            [
                {
                    id: threeMonth.question_id,
                    type: threeMonth.type,
                    brandChoice: true,
                    carrier: asBrandPipelineCarrier(threeMonth),
                },
            ],
            0,
            { pf_q5: ['دارا', 'Other'] },
            ['دارا', 'Other'],
            'forward',
        );

        expect(result.action).toBe('stay');
    });
});