import { describe, expect, it } from 'vitest';
import {
    applyRuntimeBrandFallbackToSnapshot,
    resolveRuntimeSingleBrandContext,
    snapshotNeedsBrandRecompose,
} from './productTestSnapshotMigration';
import type { ProductTestSnapshot } from '../types/productTestRespondent';

const LEGACY_SNAPSHOT: ProductTestSnapshot = {
    version: 1,
    language: 'en',
    phases: [
        {
            timing: 'before_use',
            label: 'Before Use',
            sections: [
                {
                    id: 'before_use_appearance',
                    title: 'Product Appearance',
                    module: 'product_test',
                    timing: 'before_use',
                    questions: [
                        {
                            id: 'pt_q01',
                            text: 'Product Look',
                            type: 'scale',
                            options: [],
                            required: true,
                            timing: 'before_use',
                            questionMeta: {},
                        },
                    ],
                },
            ],
        },
    ],
    meta: {
        totalQuestions: 1,
        sectionCount: 1,
        phaseCount: 1,
        generatedAt: '2026-01-01',
    },
};

describe('productTestSnapshotMigration', () => {
    it('detects when legacy snapshot needs brand recompose', () => {
        expect(
            snapshotNeedsBrandRecompose(LEGACY_SNAPSHOT, {
                own_brand: 'BrandA',
                internal_brands_data: [{ name: 'BrandA' }, { name: 'BrandB' }],
            }),
        ).toBe(true);
        expect(snapshotNeedsBrandRecompose(LEGACY_SNAPSHOT, {})).toBe(false);
    });

    it('synthesizes runtime single-brand context from own_brand', () => {
        const ctx = resolveRuntimeSingleBrandContext({
            own_brand: 'BrandA',
            category: 'Foam',
            testing_protocol: 'blind',
            blind_codes: { BrandA: 'SAMPLE-A' },
        });
        expect(ctx?.brands).toEqual(['BrandA']);
        expect(ctx?.testing_protocol).toBe('blind');
    });

    it('falls back to category when no brands configured', () => {
        const ctx = resolveRuntimeSingleBrandContext({ category: 'Foam' });
        expect(ctx?.brands).toEqual(['Foam']);
    });

    it('does not synthesize context from implicit defaults', () => {
        expect(resolveRuntimeSingleBrandContext({})).toBeNull();
    });

    it('injects runtime brand_context onto legacy snapshot for display', () => {
        const patched = applyRuntimeBrandFallbackToSnapshot(LEGACY_SNAPSHOT, {
            own_brand: 'BrandA',
            testing_protocol: 'blind',
            blind_codes: { BrandA: 'SAMPLE-A' },
        });
        expect(patched.brand_context?.brands).toEqual(['BrandA']);
        expect(patched.brand_context?._source).toBe('runtime_fallback');
    });
});
