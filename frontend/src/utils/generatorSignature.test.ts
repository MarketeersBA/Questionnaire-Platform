import { describe, it, expect } from 'vitest';
import { computeGeneratorSignature } from './generatorSignature';

/**
 * Section titles read the live config directly. The question text baked into
 * `schema.layer2_structure` only reflects the config that was in force the
 * last time the generator actually ran. This signature is how the app tells
 * whether those two have drifted apart — e.g. a brand renamed on Parameters
 * after the Blueprint step already generated questions for the old name.
 */
describe('computeGeneratorSignature', () => {
    const base = (overrides: any = {}) => ({
        config: {
            internal_brands_data: [{ name: 'Obour' }],
            competitor_brands_data: [{ name: 'Maraay' }],
            attributes: { Appearance: [], Aroma: [] },
            custom_research_attributes: [],
            language: 'ar',
            category: 'Cheese',
            ...overrides.config,
        },
        product_test_config: overrides.product_test_config,
    });

    it('changes when a brand is renamed', () => {
        const before = computeGeneratorSignature(base());
        const after = computeGeneratorSignature(
            base({ config: { internal_brands_data: [{ name: 'دايرة' }] } }),
        );
        expect(before).not.toBe(after);
    });

    it('is unaffected by reordering the same brands', () => {
        const a = computeGeneratorSignature(
            base({ config: { internal_brands_data: [{ name: 'Obour' }, { name: 'Kiri' }] } }),
        );
        const b = computeGeneratorSignature(
            base({ config: { internal_brands_data: [{ name: 'Kiri' }, { name: 'Obour' }] } }),
        );
        expect(a).toBe(b);
    });

    it('is unaffected by case or stray whitespace', () => {
        const a = computeGeneratorSignature(base({ config: { internal_brands_data: [{ name: 'Obour' }] } }));
        const b = computeGeneratorSignature(base({ config: { internal_brands_data: [{ name: '  obour  ' }] } }));
        expect(a).toBe(b);
    });

    it('changes when an attribute is added or removed', () => {
        const before = computeGeneratorSignature(base());
        const after = computeGeneratorSignature(base({ config: { attributes: { Appearance: [] } } }));
        expect(before).not.toBe(after);
    });

    it('changes when a custom attribute sub-label changes', () => {
        const before = computeGeneratorSignature(
            base({ config: { custom_research_attributes: [{ main_attribute: 'Texture', sub_attributes: [{ label: 'Creaminess' }] }] } }),
        );
        const after = computeGeneratorSignature(
            base({ config: { custom_research_attributes: [{ main_attribute: 'Texture', sub_attributes: [{ label: 'Thickness' }] }] } }),
        );
        expect(before).not.toBe(after);
    });

    it('changes when the language changes', () => {
        const before = computeGeneratorSignature(base());
        const after = computeGeneratorSignature(base({ config: { language: 'en' } }));
        expect(before).not.toBe(after);
    });

    it('changes when the category changes', () => {
        const before = computeGeneratorSignature(base());
        const after = computeGeneratorSignature(base({ config: { category: 'Yogurt' } }));
        expect(before).not.toBe(after);
    });

    it('tracks product-test attributes and language too', () => {
        const before = computeGeneratorSignature(base({ product_test_config: { selected_attributes: ['taste'], language: 'ar' } }));
        const after = computeGeneratorSignature(base({ product_test_config: { selected_attributes: ['aroma'], language: 'ar' } }));
        expect(before).not.toBe(after);
    });

    it('is stable across repeated calls with the same data', () => {
        const config = base();
        expect(computeGeneratorSignature(config)).toBe(computeGeneratorSignature(config));
    });

    it('does not throw on a null or empty config', () => {
        expect(() => computeGeneratorSignature({ config: null, product_test_config: undefined })).not.toThrow();
        expect(() => computeGeneratorSignature({ config: {} as any, product_test_config: undefined })).not.toThrow();
    });

    it('treats string brand entries the same as {name} objects', () => {
        const a = computeGeneratorSignature(base({ config: { internal_brands_data: ['Obour'] } }));
        const b = computeGeneratorSignature(base({ config: { internal_brands_data: [{ name: 'Obour' }] } }));
        expect(a).toBe(b);
    });
});
