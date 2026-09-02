import { describe, expect, it } from 'vitest';
import {
    DEFAULT_MIDDLE_AR,
    buildCenteredLabelsAr,
    buildCenteredLabelsEn,
    buildQuestionTextAr,
    defaultLowIntensifier,
    detectPoleStyle,
    generateCenteredAttribute,
    generateOverallAttribute,
} from './tasteAttributeFormula';

/**
 * Every centered attribute in the source document, with the poles an analyst
 * would type. These lock the formula against the real spec rather than against
 * invented examples — if the generator drifts, these fail.
 */
const SOURCE_ROWS: Array<{
    name: string;
    attributeAr: string;
    lowAr: string;
    highAr: string;
    middleAr: string;
    lowIntensifierAr?: string;
    expected: string[];
}> = [
    {
        name: 'Sweet',
        attributeAr: 'السكر',
        lowAr: 'مش مسكرة',
        highAr: 'مسكرة',
        middleAr: 'مناسب لى',
        expected: ['مش مسكرة خالص', 'مش مسكرة', 'مناسب لى', 'مسكرة', 'مسكرة جدا'],
    },
    {
        name: 'Acidity',
        attributeAr: 'الحموضة',
        lowAr: 'مش حامض',
        highAr: 'حامض',
        middleAr: 'مناسب ليا',
        expected: ['مش حامض خالص', 'مش حامض', 'مناسب ليا', 'حامض', 'حامض جدا'],
    },
    {
        name: 'Crispness',
        attributeAr: 'القرمشة',
        lowAr: 'مش مقرمش',
        highAr: 'مقرمش',
        middleAr: 'مناسب ليا',
        expected: ['مش مقرمش خالص', 'مش مقرمش', 'مناسب ليا', 'مقرمش', 'مقرمش جدا'],
    },
    {
        name: 'Aroma',
        attributeAr: 'الريحة',
        lowAr: 'ضعيفة',
        highAr: 'قوية',
        middleAr: 'مناسبة لي',
        expected: ['ضعيفة جدا', 'ضعيفة', 'مناسبة لي', 'قوية', 'قوية جدا'],
    },
    {
        name: 'Thickness',
        attributeAr: 'القوام',
        lowAr: 'خفيف',
        highAr: 'سميك',
        middleAr: 'مناسب لى',
        expected: ['خفيف جدا', 'خفيف', 'مناسب لى', 'سميك', 'سميك جدا'],
    },
    {
        name: 'Creaminess',
        attributeAr: 'القوام',
        lowAr: 'ناشف',
        highAr: 'كريمى',
        middleAr: 'مناسب لى',
        expected: ['ناشف جدا', 'ناشف', 'مناسب لى', 'كريمى', 'كريمى جدا'],
    },
    {
        name: 'Package Opening',
        attributeAr: 'فتح العبوة',
        lowAr: 'صعبة',
        highAr: 'سهلة',
        middleAr: 'مناسبة لي',
        expected: ['صعبة جدا', 'صعبة', 'مناسبة لي', 'سهلة', 'سهلة جدا'],
    },
    {
        name: 'After Taste — flavour strength',
        attributeAr: 'قوة النكهة',
        lowAr: 'خفيف',
        highAr: 'قوية',
        middleAr: 'مناسب لى',
        expected: ['خفيف جدا', 'خفيف', 'مناسب لى', 'قوية', 'قوية جدا'],
    },
    {
        name: 'After Taste — residual',
        attributeAr: 'الطعم المتبقي',
        lowAr: 'ضعيفة',
        highAr: 'قوى',
        middleAr: 'مناسب لى',
        expected: ['ضعيفة جدا', 'ضعيفة', 'مناسب لى', 'قوى', 'قوى جدا'],
    },
    // ── Documented exceptions: the source uses a different point-1 intensifier.
    //    Reproducible via lowIntensifierAr, which is why that override exists.
    {
        name: 'Salty (uses كفاية, not خالص)',
        attributeAr: 'الملح',
        lowAr: 'مش مملح',
        highAr: 'مملح',
        middleAr: 'مناسب لى',
        lowIntensifierAr: 'كفاية',
        expected: ['مش مملح كفاية', 'مش مملح', 'مناسب لى', 'مملح', 'مملح جدا'],
    },
    {
        name: 'Color (uses قوى, not جدا)',
        attributeAr: 'لون المنتج',
        lowAr: 'فاتح',
        highAr: 'غامق',
        middleAr: 'مناسب ليا',
        lowIntensifierAr: 'قوى',
        expected: ['فاتح قوى', 'فاتح', 'مناسب ليا', 'غامق', 'غامق جدا'],
    },
];

describe('detectPoleStyle', () => {
    it('treats a "مش X" pole as a negation', () => {
        expect(detectPoleStyle('مش مسكرة')).toBe('negation');
    });

    it('treats a bare adjective as bipolar', () => {
        expect(detectPoleStyle('فاتح')).toBe('bipolar');
        expect(detectPoleStyle('ضعيفة')).toBe('bipolar');
    });

    it('ignores surrounding whitespace', () => {
        expect(detectPoleStyle('  مش حامض  ')).toBe('negation');
    });
});

describe('defaultLowIntensifier', () => {
    it('uses خالص for negations and جدا for bipolar poles', () => {
        expect(defaultLowIntensifier('مش حامض')).toBe('خالص');
        expect(defaultLowIntensifier('خفيف')).toBe('جدا');
    });
});

describe('buildCenteredLabelsAr — reproduces the source document', () => {
    it.each(SOURCE_ROWS)('$name', (row) => {
        expect(
            buildCenteredLabelsAr({
                attributeAr: row.attributeAr,
                lowAr: row.lowAr,
                highAr: row.highAr,
                middleAr: row.middleAr,
                lowIntensifierAr: row.lowIntensifierAr,
            }),
        ).toEqual(row.expected);
    });

    it('covers every centered attribute in the document', () => {
        expect(SOURCE_ROWS).toHaveLength(11);
    });

    it('always puts the ideal in the middle', () => {
        for (const row of SOURCE_ROWS) {
            expect(row.expected[2]).toBe(row.middleAr);
        }
    });

    it('defaults the midpoint when none is supplied', () => {
        const labels = buildCenteredLabelsAr({
            attributeAr: 'الملوحة',
            lowAr: 'مش مالح',
            highAr: 'مالح',
        });
        expect(labels[2]).toBe(DEFAULT_MIDDLE_AR);
    });

    it('produces exactly five points', () => {
        expect(
            buildCenteredLabelsAr({ attributeAr: 'x', lowAr: 'خفيف', highAr: 'سميك' }),
        ).toHaveLength(5);
    });
});

describe('buildCenteredLabelsEn', () => {
    it('mirrors the Arabic shape in English', () => {
        expect(
            buildCenteredLabelsEn({
                attributeAr: 'السكر',
                lowAr: 'مش مسكرة',
                highAr: 'مسكرة',
                lowEn: 'sweet',
                highEn: 'sweet',
            }),
        ).toEqual(['Far too sweet', 'Too sweet', 'Just right for me', 'sweet', 'Far too sweet']);
    });

    it('falls back to the Arabic poles when no English is given', () => {
        const labels = buildCenteredLabelsEn({
            attributeAr: 'اللون',
            lowAr: 'فاتح',
            highAr: 'غامق',
        });
        expect(labels[1]).toContain('فاتح');
    });
});

describe('buildQuestionTextAr', () => {
    it('matches the document stem', () => {
        expect(buildQuestionTextAr('السكر')).toBe('ما مدى تقيمك على نسبه السكر؟');
        expect(buildQuestionTextAr('الملح')).toBe('ما مدى تقيمك على نسبه الملح؟');
        expect(buildQuestionTextAr('الحموضة')).toBe('ما مدى تقيمك على نسبه الحموضة؟');
    });
});

describe('generateCenteredAttribute', () => {
    it('returns a complete, editable draft', () => {
        const draft = generateCenteredAttribute({
            attributeAr: 'الحموضة',
            attributeEn: 'acidity',
            lowAr: 'مش حامض',
            highAr: 'حامض',
            middleAr: 'مناسب ليا',
        });

        expect(draft.scale_shape).toBe('centered');
        expect(draft.scale_min).toBe(1);
        expect(draft.scale_max).toBe(5);
        expect(draft.ideal_point).toBe(3);
        expect(draft.point_labels_ar).toHaveLength(5);
        expect(draft.point_labels_en).toHaveLength(5);
        expect(draft.ar_text).toBe('ما مدى تقيمك على نسبه الحموضة؟');
        expect(draft.instruction_ar).toContain('الأوسط');
    });
});

describe('generateOverallAttribute', () => {
    it('produces the 1-10 hedonic companion where the top is best', () => {
        const overall = generateOverallAttribute('طعم', 'taste');
        expect(overall.scale_shape).toBe('hedonic');
        expect(overall.scale_min).toBe(1);
        expect(overall.scale_max).toBe(10);
        expect(overall.ideal_point).toBe(10);
        expect(overall.ar_max_label).toBe('يعجبني جدا');
    });
});
