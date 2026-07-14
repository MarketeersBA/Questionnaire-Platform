import { describe, expect, it } from 'vitest';
import {
    extractProductTestFlatEvaluations,
    filterEvaluationsByBrand,
    filterEvaluationsByDiagnosticTag,
    filterEvaluationsByTiming,
    filterScalarEvaluations,
    filterTrialMediaEvaluations,
    PRODUCT_TEST_UNSCOPED_BRAND_KEY,
    summarizeProductTestResponses,
} from './productTestAnalytics';
import type { ProductTestStructuredSubmission } from '../types/productTestSubmission';

const MOCK_BLOCK: ProductTestStructuredSubmission = {
    phases: [],
    flat_evaluations: [
        {
            question_id: 'BrandA_pt_q01',
            brand: 'BrandA',
            brand_display: 'SAMPLE-123',
            canonical_question_id: 'pt_q01',
            section_id: 's1',
            section_title: 'Appearance',
            attribute: 'Appearance',
            timing: 'before_use',
            module: 'product_test',
            diagnostic_tag: 'PF',
            question_text: 'Look',
            value: 4,
        },
        {
            question_id: 'BrandB_pt_q01',
            brand: 'BrandB',
            brand_display: 'SAMPLE-456',
            canonical_question_id: 'pt_q01',
            section_id: 's2',
            section_title: 'Appearance',
            attribute: 'Appearance',
            timing: 'before_use',
            module: 'product_test',
            diagnostic_tag: 'PF',
            question_text: 'Look',
            value: 3,
        },
        {
            question_id: 'pt_pkg_q01',
            brand: null,
            brand_display: null,
            canonical_question_id: 'pt_pkg_q01',
            section_id: 's3',
            section_title: 'Packaging',
            attribute: 'Packaging',
            timing: 'after_use',
            module: 'product_test',
            diagnostic_tag: null,
            question_text: 'Package',
            value: 5,
        },
        {
            question_id: 'pt_trial_media_upload',
            brand: null,
            brand_display: null,
            canonical_question_id: 'pt_trial_media_upload',
            section_id: 's4',
            section_title: 'Trial Media',
            attribute: 'Trial Media',
            timing: 'after_use',
            module: 'trial_media_capture',
            diagnostic_tag: null,
            question_text: 'Upload photo',
            value_kind: 'media_reference',
            media_asset_id: 'asset-1',
            media_type: 'image',
            value: {
                asset_id: 'asset-1',
                media_type: 'image',
                mime: 'image/jpeg',
                size_bytes: 1024,
                uploaded_at: '2026-01-01T00:00:00Z',
            },
        },
    ],
    attribute_registry: [],
    meta: { language: 'en', totalAnswers: 4, duration_seconds: 90 },
};

describe('productTestAnalytics', () => {
    it('extracts flat_evaluations from __structured.product_test', () => {
        const rows = extractProductTestFlatEvaluations({
            __structured: { product_test: MOCK_BLOCK },
        });
        expect(rows).toHaveLength(4);
    });

    it('filters scalar and trial media rows', () => {
        const rows = MOCK_BLOCK.flat_evaluations;
        expect(filterScalarEvaluations(rows)).toHaveLength(3);
        expect(filterTrialMediaEvaluations(rows)).toHaveLength(1);
    });

    it('summarizes responses across timing phases and brands', () => {
        const summary = summarizeProductTestResponses([
            { answers: { __structured: { product_test: MOCK_BLOCK } } },
            { answers: { __structured: { product_test: MOCK_BLOCK } } },
        ]);
        expect(summary.responseCount).toBe(2);
        expect(summary.totalAnswers).toBe(8);
        expect(summary.scalarAnswerCount).toBe(6);
        expect(summary.mediaReferenceCount).toBe(2);
        expect(summary.byTiming.before_use).toBe(4);
        expect(summary.byTiming.after_use).toBe(4);
        expect(summary.trialMedia.uploadCount).toBe(2);
        expect(summary.byBrand.BrandA).toEqual({ count: 2, brand_display: 'SAMPLE-123' });
        expect(summary.byBrand.BrandB).toEqual({ count: 2, brand_display: 'SAMPLE-456' });
        expect(summary.byBrand[PRODUCT_TEST_UNSCOPED_BRAND_KEY]).toEqual({
            count: 4,
            brand_display: null,
        });
    });
});
