import { describe, expect, it } from 'vitest';
import type { ProductTestQuestion } from '../types/productTest';
import type { ProductTestRespondentQuestion } from '../types/productTestRespondent';
import {
    applyRecommendVisibilityConditions,
    isRecommendScaleRespondentQuestion,
    isWhyRecommendOpenEndRespondentQuestion,
    RECOMMEND_OPEN_END_VISIBLE_MAX,
    RECOMMEND_OPEN_END_VISIBLE_MIN,
} from './productTestRecommendVisibility';

const recommendScaleBank: ProductTestQuestion = {
    question_id: 'pt_q30',
    attribute: 'Recommendation',
    attribute_type: 'sub',
    parent_attribute: 'Overall Evaluation',
    diagnostic_tag: 'EM',
    question_type: 'scale 1-10',
    en_text: 'How likely are you to recommend this product to family or friends?',
    ar_text: 'ما مدى احتمال أن توصي بهذا المنتج لعائلتك أو أصدقائك؟',
    en_options: '1 = Not at all likely, 10 = Extremely likely',
    ar_options: null,
    timing: 'After Use',
    question_status: 'optional',
};

const whyRecommendBank: ProductTestQuestion = {
    question_id: 'pt_q31',
    attribute: 'Why Recommend',
    attribute_type: 'sub',
    parent_attribute: 'Overall Evaluation',
    diagnostic_tag: 'EM',
    question_type: 'Open-End',
    en_text: 'Why would you recommend this product to your family?',
    ar_text: 'لماذا توصي بهذا المنتج لعائلتك؟',
    en_options: 'open-end',
    ar_options: null,
    timing: 'After Use',
    question_status: 'optional',
};

function mapPair(language: 'en' | 'ar' = 'en') {
    const scale: ProductTestRespondentQuestion = {
        id: 'BrandA_pt_q30',
        canonicalQuestionId: 'pt_q30',
        text: recommendScaleBank.en_text,
        type: 'scale',
        options: [],
        required: true,
        timing: 'after_use',
        diagnostic_tag: 'EM',
        questionMeta: { scaleMax: 10 },
        brand: 'BrandA',
    };
    const whyOpen: ProductTestRespondentQuestion = {
        id: 'BrandA_pt_q31',
        canonicalQuestionId: 'pt_q31',
        text: whyRecommendBank.en_text,
        type: 'open-ended',
        options: [],
        required: true,
        timing: 'after_use',
        diagnostic_tag: 'EM',
        questionMeta: {},
        brand: 'BrandA',
    };

    return applyRecommendVisibilityConditions(
        [scale, whyOpen],
        [
            { bankId: 'pt_q30', bankQuestion: recommendScaleBank, language },
            { bankId: 'pt_q31', bankQuestion: whyRecommendBank, language },
        ],
    );
}

describe('productTestRecommendVisibility', () => {
    it('detects recommendation scale and why-recommend open-end bank questions', () => {
        const scale = {
            id: 'pt_q30',
            text: recommendScaleBank.en_text,
            type: 'scale',
            options: [],
            required: true,
            timing: 'after_use' as const,
            diagnostic_tag: 'EM' as const,
            questionMeta: {},
        };
        const whyOpen = {
            id: 'pt_q31',
            text: whyRecommendBank.en_text,
            type: 'open-ended',
            options: [],
            required: true,
            timing: 'after_use' as const,
            diagnostic_tag: 'EM' as const,
            questionMeta: {},
        };

        expect(isRecommendScaleRespondentQuestion(scale)).toBe(true);
        expect(isWhyRecommendOpenEndRespondentQuestion(whyOpen)).toBe(true);
    });

    it('pairs why-recommend open-end with preceding recommendation scale', () => {
        const [scale, whyOpen] = mapPair();
        expect(scale.visibilityCondition).toBeUndefined();
        expect(whyOpen.visibilityCondition).toEqual({
            dependsOnQuestionId: 'BrandA_pt_q30',
            min: RECOMMEND_OPEN_END_VISIBLE_MIN,
            max: RECOMMEND_OPEN_END_VISIBLE_MAX,
        });
    });

    it('does not pair unrelated open-ends', () => {
        const genericOpen: ProductTestRespondentQuestion = {
            id: 'BrandA_pt_q32',
            text: 'Tell us anything else about the product',
            type: 'open-ended',
            options: [],
            required: true,
            timing: 'after_use',
            diagnostic_tag: null,
            questionMeta: {},
        };
        const [scale] = mapPair();
        const result = applyRecommendVisibilityConditions([scale, genericOpen]);
        expect(result[1].visibilityCondition).toBeUndefined();
    });
});
