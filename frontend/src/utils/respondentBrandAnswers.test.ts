import { describe, expect, it } from 'vitest';
import {
    applyCustomBrandToAnswer,
    collectBrandNamesFromAnswer,
    isBrandSelectedInAnswer,
    mergeRespondentBrandChoices,
} from './respondentBrandAnswers';
import {
    resolvePurchaseFunnelBrands,
    sanitizePfAnswersForQuestion,
} from './purchaseFunnelBrandLogic';
import { asBrandPipelineCarrier } from './moduleQuestionUtils';
import type { ModuleQuestion } from '../types/questionModules';

describe('respondentBrandAnswers', () => {
    it('ignores specify objects when collecting brand names', () => {
        expect(
            collectBrandNamesFromAnswer([
                'Nike',
                { value: 'as_needed', otherText: 'after gym' },
            ])
        ).toEqual(['Nike']);
    });

    it('applies custom brand to mcq and scq answers', () => {
        expect(applyCustomBrandToAnswer(['Nike'], 'Local Shop', true)).toEqual([
            'Nike',
            'Local Shop',
        ]);
        expect(applyCustomBrandToAnswer('Nike', 'Local Shop', false)).toBe('Local Shop');
    });

    it('tracks fuzzy brand selection', () => {
        expect(isBrandSelectedInAnswer(['nike'], 'Nike', true)).toBe(true);
        expect(isBrandSelectedInAnswer('nike', 'Nike', false)).toBe(true);
    });

    it('merges respondent-added brands into display list', () => {
        expect(mergeRespondentBrandChoices(['Nike'], ['Nike', 'Local Shop'])).toEqual([
            'Nike',
            'Local Shop',
        ]);
    });
});

describe('purchase funnel custom brand retention', () => {
    const pfQ5: ModuleQuestion = {
        question_id: 'pf_q5',
        type: 'mcq',
        ar_text: '',
        en_text: '',
        order: 5,
        required: true,
        has_other: true,
        brand_pipeline: { mode: 'include_prior', sources: ['pf_q4'], strategy: 'cascade' },
    };

    const masterBrands = ['Wonderville', 'Kimo Kono', 'Cadbury'];

    it('keeps respondent-added brand on pipelined has_other question', () => {
        const answers = {
            pf_q4: ['Wonderville', 'Kimo Kono'],
            pf_q5: ['Wonderville', 'Local Shop'],
        };

        const visible = resolvePurchaseFunnelBrands(
            asBrandPipelineCarrier(pfQ5),
            masterBrands,
            answers,
            { currentAnswer: answers.pf_q5, customBrands: ['Local Shop'] }
        );
        expect(visible).toEqual(['Wonderville', 'Kimo Kono', 'Local Shop']);

        const sanitized = sanitizePfAnswersForQuestion(
            asBrandPipelineCarrier(pfQ5),
            masterBrands,
            answers,
            ['Local Shop']
        );
        expect(sanitized.pf_q5).toEqual(['Wonderville', 'Local Shop']);
    });
});
