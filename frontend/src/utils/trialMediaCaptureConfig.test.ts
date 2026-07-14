import { describe, expect, it } from 'vitest';
import {
    DEFAULT_TRIAL_MEDIA_CAPTURE,
    formatTrialMediaCaptureSummary,
    normalizeTrialMediaCapture,
    withNormalizedTrialMediaCapture,
} from './trialMediaCaptureConfig';
import type { ProductTestConfig } from '../types/productTest';

describe('trialMediaCaptureConfig', () => {
    it('returns conservative defaults when input is missing', () => {
        const normalized = normalizeTrialMediaCapture(undefined);
        expect(normalized.enabled).toBe(false);
        expect(normalized.accepted_media).toBe('image_or_video');
        expect(normalized.required).toBe(false);
        expect(normalized.timing).toBe('after_use');
        expect(normalized.max_video_duration_seconds).toBe(60);
    });

    it('clamps invalid numeric limits', () => {
        const normalized = normalizeTrialMediaCapture({
            ...DEFAULT_TRIAL_MEDIA_CAPTURE,
            enabled: true,
            max_video_duration_seconds: 999,
            max_image_mb: 0,
            max_video_mb: 200,
        });
        expect(normalized.max_video_duration_seconds).toBe(120);
        expect(normalized.max_image_mb).toBe(1);
        expect(normalized.max_video_mb).toBe(100);
    });

    it('withNormalizedTrialMediaCapture merges into product test config', () => {
        const config = withNormalizedTrialMediaCapture({
            version: 1,
            language: 'en',
            selected_attributes: [],
            fixed_questions: [],
            optional_questions: [],
            package_test_enabled: false,
            package_test_attributes: [],
            packaging_heatmap_enabled: false,
            packaging_heatmap_images: { front: null, back: null },
            status: 'draft',
        } as ProductTestConfig);

        expect(config.trial_media_capture).toEqual(DEFAULT_TRIAL_MEDIA_CAPTURE);
    });

    it('formatTrialMediaCaptureSummary reflects enabled state', () => {
        expect(formatTrialMediaCaptureSummary(DEFAULT_TRIAL_MEDIA_CAPTURE)).toContain('Disabled');
        expect(
            formatTrialMediaCaptureSummary({
                ...DEFAULT_TRIAL_MEDIA_CAPTURE,
                enabled: true,
            }),
        ).toContain('Optional');
    });
});
