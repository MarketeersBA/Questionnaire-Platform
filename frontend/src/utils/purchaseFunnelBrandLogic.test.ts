import { describe, expect, it } from 'vitest';
import {
    brandsFuzzyMatch,
    resolvePurchaseFunnelBrands,
    sanitizePfAnswersForQuestion,
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
});
