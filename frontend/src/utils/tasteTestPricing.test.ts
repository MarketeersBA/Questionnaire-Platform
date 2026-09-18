import { describe, it, expect } from 'vitest';
import {
    buildPricingQuestionText,
    formatPricingUnit,
    isPricingQuestion,
    generateTasteTestModuleSchema,
} from './tasteTestGenerator';

/**
 * The pricing rewrite existed only in the Python composer, but the survey
 * schema is built in the browser — so it never reached a real survey and
 * respondents kept seeing the bare "بسعره ايه؟" wording with no quantity.
 * These lock the browser-side behaviour to the Python constants.
 */
describe('formatPricingUnit', () => {
    it.each([
        [{ pricing_unit: '200 ml' }, '200 ml'],
        [{ pricing_unit: '  500 g  ' }, '500 g'],
        [{ pricing_unit_amount: '200', pricing_unit_label: 'ml' }, '200 ml'],
        [{ pricing_unit_amount: ' 1 ', pricing_unit_label: ' L ' }, '1 L'],
        [{ pricing_unit_amount: '200', pricing_unit_label: 'مل' }, '200 مل'],
    ])('renders %o as %s', (config, expected) => {
        expect(formatPricingUnit(config)).toBe(expected);
    });

    it.each([{}, null, undefined, { pricing_unit: '   ' }, 'junk'])(
        'is empty for %o',
        (config) => expect(formatPricingUnit(config as any)).toBe(''),
    );

    it('strips braces so the size cannot inject a second placeholder', () => {
        const out = buildPricingQuestionText({ pricing_unit: '{product} 200ml' }, false);
        expect(out.match(/\{product\}/g) ?? []).toHaveLength(1);
    });
});

describe('isPricingQuestion', () => {
    it('matches by id and by attribute', () => {
        expect(isPricingQuestion({ question_id: 'tt_q16' })).toBe(true);
        expect(isPricingQuestion({ question_id: 'pt_q38' })).toBe(true);
        expect(isPricingQuestion({ main_att: 'Purchase Price' })).toBe(true);
        expect(isPricingQuestion({ question_id: 'tt_purchase_intent' })).toBe(false);
    });
});

describe('the generated survey', () => {
    const masterData = {
        fixed: [
            {
                question_id: 'tt_q16',
                main_att: 'Purchase Price',
                ar_text: 'ممكن تشتري المنتج بسعره ايه؟',
                en_text: 'At what price would you buy product?',
                question_type: 'Numeric',
                timing: 'After Taste',
                question_status: 'fixed',
            },
        ],
    };
    const config: any = {
        category: 'coffee',
        language: 'ar',
        internal_brands_data: [],
        competitor_brands_data: [{ name: 'دايرة' }],
        attributes: {},
    };

    function priceText(cfg: any): string {
        const schema: any = generateTasteTestModuleSchema(cfg, masterData as any);
        for (const sec of schema.layer2_structure?.sections || []) {
            for (const q of sec.questions || []) if (q.id === 'tt_q16') return q.text;
        }
        return '';
    }

    it('names the declared size, so every respondent prices the same quantity', () => {
        const text = priceText({ ...config, pricing_unit_amount: '200', pricing_unit_label: 'مل' });
        expect(text).toBe('ممكن تشتري دايرة بسعر ايه لو حجمه 200 مل؟');
    });

    it('anchors on the sample in front of the respondent when no size is declared', () => {
        expect(priceText(config)).toBe('ممكن تشتري دايرة بسعر ايه لو بالحجم اللي قدامك ده؟');
    });

    it('never leaves a placeholder in the respondent-facing text', () => {
        for (const cfg of [config, { ...config, language: 'en', pricing_unit: '250 g' }]) {
            const text = priceText(cfg);
            for (const leftover of ['{', '}', '[', ']', 'المنتج']) {
                expect(text).not.toContain(leftover);
            }
        }
    });
});
