import { describe, expect, it } from 'vitest';
import {
    brandKeyForAnalytics,
    evaluationMatchesBrand,
    PRODUCT_TEST_UNSCOPED_BRAND_KEY,
    resolveCanonicalQuestionId,
    resolveProductTestEvaluationBrandFields,
} from './productTestSubmissionBrand';

describe('productTestSubmissionBrand', () => {
    it('strips brand prefix for canonical question id', () => {
        expect(resolveCanonicalQuestionId('BrandA_pt_q01', 'BrandA')).toBe('pt_q01');
        expect(resolveCanonicalQuestionId('pt_q01', null)).toBe('pt_q01');
    });

    it('resolves brand_display via submit-time resolver (blind)', () => {
        const fields = resolveProductTestEvaluationBrandFields(
            { brand: 'BrandA', displayBrand: 'BrandA' },
            { id: 'BrandA_pt_q01', canonicalQuestionId: 'pt_q01' },
            { resolveBrandDisplay: (key) => (key === 'BrandA' ? 'SAMPLE-123' : key) },
        );
        expect(fields).toEqual({
            brand: 'BrandA',
            brand_display: 'SAMPLE-123',
            canonical_question_id: 'pt_q01',
        });
    });

    it('marks unscoped rows for analytics bucket', () => {
        expect(brandKeyForAnalytics(null)).toBe(PRODUCT_TEST_UNSCOPED_BRAND_KEY);
        expect(evaluationMatchesBrand({ brand: null }, PRODUCT_TEST_UNSCOPED_BRAND_KEY)).toBe(true);
        expect(evaluationMatchesBrand({ brand: 'BrandA' }, 'BrandA')).toBe(true);
    });
});
