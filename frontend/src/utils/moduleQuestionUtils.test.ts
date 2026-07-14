import { describe, expect, it } from 'vitest';
import type { ModuleQuestion, ModuleSection } from '../types/questionModules';
import {
    flattenModuleQuestions,
    formatModuleQuestionText,
    findMissingSpecifyOption,
    isAnswerComplete,
    isMcqItemSelected,
    isSpecifyAnswer,
    normalizeSpecifyAnswer,
    selectScqOption,
    toggleMcqOption,
    updateSpecifyOtherText,
    validateCurrentStep,
} from './moduleQuestionUtils';

const mockUsageQuestion: ModuleQuestion = {
    question_id: 'us_q3',
    label: 'Usage Timing',
    type: 'mcq',
    ar_text: 'وقت الاستخدام',
    en_text: 'When do you use [product]?',
    order: 1,
    required: true,
    options: [
        { value: 'morning', ar_label: 'صبح', en_label: 'Morning', order: 0 },
        { value: 'as_needed', ar_label: 'حسب الحاجة', en_label: 'As needed (Specify)', allows_specify: true, order: 1 },
    ],
};

const mockSections: ModuleSection[] = [
    {
        section_id: 'usage',
        title_en: 'Usage',
        title_ar: 'استخدام',
        order: 1,
        questions: [
            { ...mockUsageQuestion, question_id: 'us_q1', type: 'scq', order: 0, options: [{ value: 'today', ar_label: 'a', en_label: 'Today', order: 0 }] },
            mockUsageQuestion,
        ],
    },
];

describe('formatModuleQuestionText', () => {
    it('replaces product and category placeholders', () => {
        expect(
            formatModuleQuestionText('Use [product] in [Category]', { product: 'Protein Bar' })
        ).toBe('Use Protein Bar in Protein Bar');
        expect(
            formatModuleQuestionText('تستخدم (المنتج)', { product: 'شوكولاتة' })
        ).toBe('تستخدم شوكولاتة');
    });
});

describe('normalizeSpecifyAnswer', () => {
    it('stores value and trimmed otherText', () => {
        const result = normalizeSpecifyAnswer('online_other', '  Instagram pages  ');
        expect(result).toEqual({ value: 'online_other', otherText: 'Instagram pages' });
        expect(isSpecifyAnswer(result)).toBe(true);
    });
});

describe('toggleMcqOption with specify', () => {
    it('adds specify object when allows_specify option selected', () => {
        const option = mockUsageQuestion.options![1];
        const next = toggleMcqOption([], option);
        expect(next).toHaveLength(1);
        expect(isSpecifyAnswer(next[0])).toBe(true);
        if (isSpecifyAnswer(next[0])) {
            expect(next[0].value).toBe('as_needed');
            expect(next[0].otherText).toBe('');
        }
    });

    it('updates otherText on specify item', () => {
        const updated = updateSpecifyOtherText(
            [{ value: 'as_needed', otherText: '' }],
            'as_needed',
            'after gym',
            true
        );
        expect(Array.isArray(updated)).toBe(true);
        const item = (updated as Array<{ value: string; otherText: string }>)[0];
        expect(item.otherText).toBe('after gym');
    });

    it('tracks selection state', () => {
        const answer = ['morning', { value: 'as_needed', otherText: 'late' }];
        expect(isMcqItemSelected(answer, 'morning')).toBe(true);
        expect(isMcqItemSelected(answer, 'as_needed')).toBe(true);
        expect(isMcqItemSelected(answer, 'night')).toBe(false);
    });
});

describe('selectScqOption', () => {
    it('returns specify object for allows_specify', () => {
        const opt = { value: 'online_other', ar_label: '', en_label: 'Online (Specify)', allows_specify: true, order: 0 };
        expect(selectScqOption(opt)).toEqual({ value: 'online_other', otherText: '' });
    });

    it('returns plain string otherwise', () => {
        const opt = { value: 'today', ar_label: '', en_label: 'Today', order: 0 };
        expect(selectScqOption(opt)).toBe('today');
    });
});

describe('isAnswerComplete', () => {
    it('requires otherText for specify scq', () => {
        const q: ModuleQuestion = {
            question_id: 'cb_q3',
            type: 'scq',
            ar_text: '',
            en_text: '',
            order: 0,
            required: true,
            options: [{ value: 'online_other', ar_label: '', en_label: 'Online', allows_specify: true, order: 0 }],
        };
        expect(isAnswerComplete(q, { value: 'online_other', otherText: '' })).toBe(false);
        expect(isAnswerComplete(q, { value: 'online_other', otherText: 'Amazon' })).toBe(true);
    });

    it('validates mcq with specify entries', () => {
        expect(
            isAnswerComplete(mockUsageQuestion, [
                'morning',
                { value: 'as_needed', otherText: 'weekends' },
            ])
        ).toBe(true);
        expect(
            isAnswerComplete(mockUsageQuestion, [
                { value: 'as_needed', otherText: '' },
            ])
        ).toBe(false);
    });

    it('reports the specify option that still needs text', () => {
        const missing = findMissingSpecifyOption(mockUsageQuestion, [
            'morning',
            { value: 'as_needed', otherText: '' },
        ]);
        expect(missing?.value).toBe('as_needed');

        const complete = findMissingSpecifyOption(mockUsageQuestion, [
            { value: 'as_needed', otherText: 'after workout' },
        ]);
        expect(complete).toBeNull();
    });

    it('validates open_loop with at least one filled row', () => {
        const q: ModuleQuestion = {
            question_id: 'pf_q2',
            type: 'open_loop',
            ar_text: '',
            en_text: '',
            order: 0,
            required: true,
        };
        expect(isAnswerComplete(q, ['', ''])).toBe(false);
        expect(isAnswerComplete(q, ['Nike', ''])).toBe(true);
    });
});

describe('flattenModuleQuestions', () => {
    it('orders by section then question order', () => {
        const flat = flattenModuleQuestions(mockSections);
        expect(flat.map((q) => q.question_id)).toEqual(['us_q1', 'us_q3']);
    });
});

describe('validateCurrentStep', () => {
    it('delegates to isAnswerComplete for current question', () => {
        expect(validateCurrentStep(mockUsageQuestion, { us_q3: ['morning'] })).toBe(true);
        expect(validateCurrentStep(mockUsageQuestion, {})).toBe(false);
    });
});
