import type { ProductTestConfig } from '../types/productTest';
import {
    DEFAULT_TRIAL_MEDIA_CAPTURE,
    withNormalizedTrialMediaCapture,
} from './trialMediaCaptureConfig';
import type { ProductTestTrialMediaCapture } from '../types/productTest';

/** Pure toggle — used by ProductTestConfigModal and Phase 7 tests. */
export function toggleTrialMediaCaptureEnabled(config: ProductTestConfig): ProductTestConfig {
    const current = config.trial_media_capture ?? DEFAULT_TRIAL_MEDIA_CAPTURE;
    return {
        ...config,
        trial_media_capture: {
            ...current,
            enabled: !current.enabled,
        },
    };
}

/** Merge partial trial media settings. */
export function patchTrialMediaCaptureConfig(
    config: ProductTestConfig,
    patch: Partial<ProductTestTrialMediaCapture>,
): ProductTestConfig {
    return {
        ...config,
        trial_media_capture: {
            ...(config.trial_media_capture ?? DEFAULT_TRIAL_MEDIA_CAPTURE),
            ...patch,
        },
    };
}

/** Final config payload before save — normalizes trial_media_capture block. */
export function buildFinalProductTestConfigWithTrialMedia(
    config: ProductTestConfig,
    fixedQuestionIds: string[],
): ProductTestConfig {
    return withNormalizedTrialMediaCapture({
        ...config,
        fixed_questions: fixedQuestionIds,
    });
}
