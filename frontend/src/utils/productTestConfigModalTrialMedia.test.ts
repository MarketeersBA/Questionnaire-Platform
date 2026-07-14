import { describe, expect, it } from 'vitest';
import type { ProductTestConfig } from '../types/productTest';
import { DEFAULT_TRIAL_MEDIA_CAPTURE } from './trialMediaCaptureConfig';
import {
    buildFinalProductTestConfigWithTrialMedia,
    patchTrialMediaCaptureConfig,
    toggleTrialMediaCaptureEnabled,
} from './productTestConfigModalTrialMedia';

const baseConfig: ProductTestConfig = {
    version: 1,
    language: 'en',
    selected_attributes: [],
    fixed_questions: [],
    optional_questions: [],
    package_test_enabled: false,
    package_test_attributes: [],
    packaging_heatmap_enabled: false,
    packaging_heatmap_images: { front: null, back: null },
    trial_media_capture: { ...DEFAULT_TRIAL_MEDIA_CAPTURE },
    status: 'draft',
};

describe('productTestConfigModalTrialMedia', () => {
    it('toggleTrialMediaCaptureEnabled flips enabled flag', () => {
        expect(toggleTrialMediaCaptureEnabled(baseConfig).trial_media_capture.enabled).toBe(true);
        const enabled = toggleTrialMediaCaptureEnabled({
            ...baseConfig,
            trial_media_capture: { ...DEFAULT_TRIAL_MEDIA_CAPTURE, enabled: true },
        });
        expect(enabled.trial_media_capture.enabled).toBe(false);
    });

    it('patchTrialMediaCaptureConfig persists timing and required', () => {
        const patched = patchTrialMediaCaptureConfig(baseConfig, {
            enabled: true,
            timing: 'during_use',
            required: true,
        });
        expect(patched.trial_media_capture).toMatchObject({
            enabled: true,
            timing: 'during_use',
            required: true,
        });
    });

    it('buildFinalProductTestConfigWithTrialMedia normalizes before save', () => {
        const finalConfig = buildFinalProductTestConfigWithTrialMedia(
            patchTrialMediaCaptureConfig(baseConfig, { enabled: true }),
            ['pt_q01'],
        );
        expect(finalConfig.fixed_questions).toEqual(['pt_q01']);
        expect(finalConfig.trial_media_capture.enabled).toBe(true);
        expect(finalConfig.trial_media_capture.max_video_duration_seconds).toBe(60);
    });
});
