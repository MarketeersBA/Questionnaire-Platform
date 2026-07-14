import { describe, expect, it } from 'vitest';
import {
    countPackagingHeatmapQuestions,
    hasPackagingFrontImage,
    packagingHeatmapQuestionSummary,
    validatePackagingHeatmapPreflight,
    validatePackagingImageFile,
} from './packagingHeatmapConfig';
import type { ProductTestConfig } from '../types/productTest';
import { DEFAULT_TRIAL_MEDIA_CAPTURE } from './trialMediaCaptureConfig';

const baseConfig: ProductTestConfig = {
    version: 1,
    language: 'en',
    selected_attributes: [],
    fixed_questions: [],
    optional_questions: [],
    package_test_enabled: false,
    package_test_attributes: [],
    packaging_heatmap_enabled: true,
    packaging_heatmap_images: { front: null, back: null },
    trial_media_capture: { ...DEFAULT_TRIAL_MEDIA_CAPTURE },
    status: 'draft',
};

describe('packagingHeatmapConfig', () => {
    it('validatePackagingHeatmapPreflight passes when disabled', () => {
        const result = validatePackagingHeatmapPreflight(
            { ...baseConfig, packaging_heatmap_enabled: false },
            undefined,
        );
        expect(result.ok).toBe(true);
    });

    it('validatePackagingHeatmapPreflight requires target brand when enabled', () => {
        const result = validatePackagingHeatmapPreflight(baseConfig, '');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.scrollTargetId).toBe('brand-architecture-section');
        }
    });

    it('validatePackagingHeatmapPreflight requires front image when enabled', () => {
        const result = validatePackagingHeatmapPreflight(baseConfig, 'Acme', {});
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('front image');
        }
    });

    it('accepts staged front file as satisfying preflight', () => {
        const file = new File([new Uint8Array([1, 2, 3])], 'front.png', { type: 'image/png' });
        const result = validatePackagingHeatmapPreflight(baseConfig, 'Acme', { front: file });
        expect(result.ok).toBe(true);
    });

    it('accepts uploaded front asset as satisfying preflight', () => {
        const config: ProductTestConfig = {
            ...baseConfig,
            packaging_heatmap_images: {
                front: {
                    asset_id: 'abc123',
                    side: 'front',
                    survey_id: 's1',
                    width: 100,
                    height: 200,
                    mime: 'image/png',
                    uploaded_at: '2026-06-30T00:00:00Z',
                },
                back: null,
            },
        };
        expect(hasPackagingFrontImage(config)).toBe(true);
        expect(validatePackagingHeatmapPreflight(config, 'Acme')).toEqual({ ok: true });
    });

    it('summarizes question counts by image count', () => {
        expect(packagingHeatmapQuestionSummary(baseConfig, {})).toContain('front image');
        expect(
            packagingHeatmapQuestionSummary(baseConfig, { front: new File([], 'f.png', { type: 'image/png' }) }),
        ).toBe('3 questions × 1 image');
        expect(
            packagingHeatmapQuestionSummary(baseConfig, {
                front: new File([], 'f.png', { type: 'image/png' }),
                back: new File([], 'b.png', { type: 'image/png' }),
            }),
        ).toBe('3 questions × 2 images = 6 heatmap questions');
        expect(countPackagingHeatmapQuestions(baseConfig, {
            front: new File([], 'f.png', { type: 'image/png' }),
            back: new File([], 'b.png', { type: 'image/png' }),
        })).toBe(6);
    });

    it('validatePackagingImageFile rejects unsupported mime', () => {
        const file = new File([], 'x.gif', { type: 'image/gif' });
        expect(validatePackagingImageFile(file)).toContain('Allowed formats');
    });
});
