import { describe, it, expect } from 'vitest';
import { generateTasteTestModuleSchema } from './tasteTestGenerator';
import { localizeTasteTestAttribute } from './tasteTestAttributeLabels';

/**
 * `masterData[attribute]` holds only that attribute's *optional* questions.
 * Anything `fixed` is grouped under `masterData.fixed` and asked once per brand
 * in the General Evaluation block, so Overall's bucket is always empty — which
 * is not the same as the bank having nothing to ask.
 *
 * Read as "no questions", it invented "ما رأيك في (Overall) الخاصة بـ Obour؟"
 * per brand, on a scale nobody chose, a few screens before the real Overall
 * questions that were asked anyway.
 */
const masterData = {
    fixed: [
        {
            question_id: 'tt_overall_liking',
            main_att: 'Overall',
            ar_text: 'ما هو تقيمك العام للمنتج ككل ؟',
            en_text: 'Overall, how would you rate product?',
            question_type: 'scale 1-10',
            timing: 'After Taste',
            question_status: 'fixed',
        },
    ],
    Aroma: [
        {
            question_id: 'tt_aroma',
            main_att: 'Aroma',
            ar_text: 'الى اي مدى تقم الريحة ؟',
            en_text: 'How do you rate the aroma?',
            question_type: 'scale 1-5',
            timing: 'After Taste',
            question_status: 'optional',
        },
    ],
};

function build(attributes: Record<string, string[]>) {
    const config: any = {
        category: 'cheese',
        language: 'ar',
        internal_brands_data: [],
        competitor_brands_data: [{ name: 'Obour' }],
        attributes,
        attribute_sequence: Object.keys(attributes).map((a) => ({
            main_attribute: a,
            sub_attributes: attributes[a],
            source: 'library' as const,
        })),
    };
    const schema: any = generateTasteTestModuleSchema(config, masterData as any);
    return (schema.layer2_structure?.sections || []) as any[];
}

describe('the Overall attribute', () => {
    it('never invents a stand-in question', () => {
        const sections = build({ Overall: ['Likes'], Aroma: ['Aroma'] });
        const invented = sections
            .flatMap((s) => s.questions || [])
            .filter((q: any) => String(q.id).includes('_fallback_'));

        expect(invented).toEqual([]);
    });

    it('renders no empty Overall section of its own', () => {
        const sections = build({ Overall: ['Likes'], Aroma: ['Aroma'] });
        expect(sections.find((s) => s.attribute === 'Overall')).toBeUndefined();
    });

    it('still asks the real Overall questions in the general block', () => {
        const texts = build({ Overall: ['Likes'], Aroma: ['Aroma'] })
            .flatMap((s) => s.questions || [])
            .map((q: any) => q.id);
        expect(texts).toContain('tt_overall_liking');
    });

    it('keeps the fallback for an attribute the bank genuinely cannot cover', () => {
        // The fallback has a real purpose: without it such an attribute would
        // render as a heading with nothing under it.
        const sections = build({ Texture: ['Creaminess'] });
        const invented = sections
            .flatMap((s) => s.questions || [])
            .filter((q: any) => String(q.id).includes('_fallback_'));

        expect(invented).toHaveLength(1);
    });
});

describe('Arabic attribute labels', () => {
    it.each([
        ['Overall', 'التقييم العام'],
        ['Taste', 'الطعم'],
        ['Aroma', 'الرائحة'],
        ['After Taste', 'بعد التذوق'],
    ])('localises %s', (english, arabic) => {
        expect(localizeTasteTestAttribute(english, 'ar')).toBe(arabic);
    });

    it('leaves English surveys alone', () => {
        expect(localizeTasteTestAttribute('Overall', 'en')).toBe('Overall');
    });
});
