import { describe, expect, it } from 'vitest';
import {
    brandsFuzzyMatch,
    resolvePurchaseFunnelBrands,
    sanitizePfAnswersForQuestion,
    skipSoleBrandSteps,
    soleListedBrand,
    withSoleBrandAnswer,
} from './purchaseFunnelBrandLogic';
import { asBrandPipelineCarrier } from './moduleQuestionUtils';
import type { ModuleQuestion } from '../types/questionModules';

const masterBrands = ['Wonderville', 'Kimo Kono', 'Cadbury'];

const pfQ5: ModuleQuestion = {
    question_id: 'pf_q5',
    type: 'mcq',
    ar_text: '',
    en_text: '',
    order: 5,
    required: true,
    has_other: true,
    analytical_role: 'bought_12m',
    brand_pipeline: { mode: 'include_prior', sources: ['pf_q4'], strategy: 'cascade' },
};

const pfQ6: ModuleQuestion = {
    question_id: 'pf_q6',
    type: 'mcq',
    ar_text: '',
    en_text: '',
    order: 6,
    required: true,
    has_other: true,
    analytical_role: 'bought_3m',
    brand_pipeline: { mode: 'include_prior', sources: ['pf_q5'], strategy: 'cascade' },
};

describe('purchaseFunnelBrandLogic', () => {
    it('matches brands with minor spelling differences', () => {
        expect(brandsFuzzyMatch('Cadbury', 'cadbury')).toBe(true);
        expect(brandsFuzzyMatch('Kimo Kono', 'kimo kono')).toBe(true);
    });

    it('filters 12-month options to brands chosen at consideration (pf_q5)', () => {
        const answers = {
            pf_q4: ['Wonderville', 'Kimo Kono'],
        };

        expect(
            resolvePurchaseFunnelBrands(asBrandPipelineCarrier(pfQ5), masterBrands, answers)
        ).toEqual(['Wonderville', 'Kimo Kono']);
    });

    it('filters 3-month options to brands chosen at 12-month only (pf_q6)', () => {
        const answers = {
            pf_q4: ['Wonderville', 'Kimo Kono', 'Cadbury'],
            pf_q5: ['Wonderville', 'Kimo Kono'],
        };

        expect(
            resolvePurchaseFunnelBrands(asBrandPipelineCarrier(pfQ6), masterBrands, answers)
        ).toEqual(['Wonderville', 'Kimo Kono']);
    });

    it('uses pf_q4 as consideration source for pf_q5 cascade (not legacy pb_q1)', () => {
        const answers = { pf_q4: ['Wonderville'], pb_q1: ['Cadbury'] };
        expect(
            resolvePurchaseFunnelBrands(asBrandPipelineCarrier(pfQ5), masterBrands, answers)
        ).toEqual(['Wonderville']);
    });

    it('prunes stale 3-month selections after 12-month choices change', () => {
        const answers = {
            pf_q4: ['Wonderville', 'Kimo Kono', 'Cadbury'],
            pf_q5: ['Wonderville', 'Kimo Kono'],
            pf_q6: ['Wonderville', 'Kimo Kono', 'Cadbury'],
        };

        const sanitized = sanitizePfAnswersForQuestion(
            asBrandPipelineCarrier(pfQ6),
            masterBrands,
            answers
        );
        expect(sanitized.pf_q6).toEqual(['Wonderville', 'Kimo Kono']);
    });

    it('treats a 3-month question with one surviving brand as having no choice', () => {
        const answers = {
            pf_q5: ['Wonderville'],
        };

        expect(
            soleListedBrand(asBrandPipelineCarrier(pfQ6), masterBrands, answers)
        ).toBe('Wonderville');
        expect(
            soleListedBrand(
                asBrandPipelineCarrier(pfQ6),
                masterBrands,
                { pf_q5: ['Wonderville', 'Cadbury'] }
            )
        ).toBeNull();
    });

    it('records the sole brand without wiping an answer that already names it', () => {
        const recorded = withSoleBrandAnswer({}, 'pf_q6', 'mcq', 'Wonderville');
        expect(recorded.pf_q6).toEqual(['Wonderville']);

        const kept = withSoleBrandAnswer(
            { pf_q6: ['Wonderville', 'Local brand'] },
            'pf_q6',
            'mcq',
            'Wonderville'
        );
        expect(kept.pf_q6).toEqual(['Wonderville', 'Local brand']);
    });

    it('skips the 3-month question and the most-often question when only one brand remains', () => {
        const steps = [
            {
                id: 'pf_q6',
                type: 'mcq',
                brandChoice: true,
                carrier: asBrandPipelineCarrier(pfQ6),
            },
            {
                id: 'pf_q7',
                type: 'scq',
                brandChoice: true,
                carrier: asBrandPipelineCarrier({
                    ...pfQ6,
                    question_id: 'pf_q7',
                    type: 'scq',
                    has_other: false,
                    brand_pipeline: { mode: 'include_prior', sources: ['pf_q6'], strategy: 'cascade' },
                }),
            },
        ];

        const result = skipSoleBrandSteps(
            steps,
            0,
            { pf_q5: ['Wonderville'] },
            masterBrands,
            'forward',
        );

        expect(result.action).toBe('complete');
        expect(result.answers.pf_q6).toEqual(['Wonderville']);
        expect(result.answers.pf_q7).toBe('Wonderville');
    });

    it('hides the question when the only brand was stored under the legacy id', () => {
        expect(
            soleListedBrand(
                asBrandPipelineCarrier(pfQ6),
                masterBrands,
                { pb_q2: ['Cadbury'] },
            )
        ).toBe('Cadbury');
    });

    it('hides the question when the only brand was typed and is not on the master list', () => {
        expect(
            soleListedBrand(
                asBrandPipelineCarrier(pfQ6),
                masterBrands,
                { pf_q5: ['دارا'] },
            )
        ).toBe('دارا');
    });

    it('skips a fixed option question that has a single choice', () => {
        const result = skipSoleBrandSteps(
            [
                {
                    id: 'us_q9',
                    type: 'scq',
                    brandChoice: false,
                    carrier: { id: 'us_q9', type: 'scq' },
                    soleChoice: 'only_option',
                },
                {
                    id: 'us_q10',
                    type: 'scq',
                    brandChoice: false,
                    carrier: { id: 'us_q10', type: 'scq' },
                    soleChoice: null,
                },
            ],
            0,
            {},
            [],
            'forward',
        );

        expect(result.action).toBe('move');
        expect(result.index).toBe(1);
        expect(result.answers.us_q9).toBe('only_option');
    });
});
