import type { ProductTestConfig, ProductTestTrialMediaCapture } from '../types/productTest';
import type {
    ProductTestRespondentPhase,
    ProductTestRespondentQuestion,
    ProductTestRespondentSection,
    ProductTestTimingPhase,
} from '../types/productTestRespondent';
import { PRODUCT_TEST_TIMING_PHASES } from '../types/productTestRespondent';
import type { QuestionMeta } from '../types/tasteTest';
import {
    DEFAULT_TRIAL_MEDIA_CAPTURE,
    normalizeTrialMediaCapture,
    type TrialMediaCaptureTiming,
} from './trialMediaCaptureConfig';

/** Stable canonical id — one upload per survey (not brand-scoped). */
export const TRIAL_MEDIA_CANONICAL_QUESTION_ID = 'pt_trial_media_upload';
export const TRIAL_MEDIA_SECTION_ID = 'trial_media_capture';

const PHASE_LABELS: Record<ProductTestTimingPhase, { en: string; ar: string }> = {
    before_use: { en: 'Before Use', ar: 'قبل الاستخدام' },
    during_use: { en: 'During Use', ar: 'أثناء الاستخدام' },
    after_use: { en: 'After Use', ar: 'بعد الاستخدام' },
    packaging: { en: 'Packaging & Presentation', ar: 'التعبئة والتغليف' },
};

function phaseLabel(phase: ProductTestTimingPhase, language: 'en' | 'ar'): string {
    return PHASE_LABELS[phase][language];
}

export interface TrialMediaCaptureSnapshotMeta {
    enabled: boolean;
    accepted_media: ProductTestTrialMediaCapture['accepted_media'];
    required: boolean;
    timing: TrialMediaCaptureTiming;
    max_video_duration_seconds: number;
    max_image_mb: number;
    max_video_mb: number;
    question_id: string;
}

export function buildTrialMediaCaptureQuestion(
    capture: ProductTestTrialMediaCapture,
    language: 'en' | 'ar',
): ProductTestRespondentQuestion {
    const isArabic = language === 'ar';
    const questionMeta: QuestionMeta & {
        acceptedMedia: ProductTestTrialMediaCapture['accepted_media'];
        maxVideoDurationSeconds: number;
        maxImageMb: number;
        maxVideoMb: number;
    } = {
        nature: 'fixed',
        inputType: 'media-upload',
        canonicalQuestionId: TRIAL_MEDIA_CANONICAL_QUESTION_ID,
        acceptedMedia: capture.accepted_media,
        maxVideoDurationSeconds: capture.max_video_duration_seconds,
        maxImageMb: capture.max_image_mb,
        maxVideoMb: capture.max_video_mb,
    };

    return {
        id: TRIAL_MEDIA_CANONICAL_QUESTION_ID,
        text: isArabic ? capture.prompt_ar : capture.prompt_en,
        type: 'media-upload',
        options: [],
        required: capture.required,
        timing: capture.timing,
        diagnostic_tag: null,
        questionMeta,
    };
}

export function buildTrialMediaCaptureSection(
    capture: ProductTestTrialMediaCapture,
    language: 'en' | 'ar',
): ProductTestRespondentSection | null {
    if (!capture.enabled) return null;

    const isArabic = language === 'ar';
    return {
        id: TRIAL_MEDIA_SECTION_ID,
        title: isArabic ? 'رفع وسائط التجربة' : 'Trial Media Upload',
        module: 'trial_media_capture',
        timing: capture.timing,
        questions: [buildTrialMediaCaptureQuestion(capture, language)],
    };
}

export function buildTrialMediaCaptureSnapshotMeta(
    config: ProductTestConfig,
): TrialMediaCaptureSnapshotMeta | null {
    const capture = normalizeTrialMediaCapture(config.trial_media_capture);
    if (!capture.enabled) return null;

    return {
        enabled: true,
        accepted_media: capture.accepted_media,
        required: capture.required,
        timing: capture.timing,
        max_video_duration_seconds: capture.max_video_duration_seconds,
        max_image_mb: capture.max_image_mb,
        max_video_mb: capture.max_video_mb,
        question_id: TRIAL_MEDIA_CANONICAL_QUESTION_ID,
    };
}

function sortPhases(phases: ProductTestRespondentPhase[]): ProductTestRespondentPhase[] {
    return [...phases].sort(
        (a, b) => PRODUCT_TEST_TIMING_PHASES.indexOf(a.timing) - PRODUCT_TEST_TIMING_PHASES.indexOf(b.timing),
    );
}

/**
 * Inject one survey-level media-upload section into the configured timing phase.
 * Creates the phase when missing so analysts can enable upload-only flows.
 */
export function appendTrialMediaCaptureToPhases(
    phases: ProductTestRespondentPhase[],
    config: ProductTestConfig,
    language: 'en' | 'ar',
): ProductTestRespondentPhase[] {
    const capture = normalizeTrialMediaCapture(config.trial_media_capture ?? DEFAULT_TRIAL_MEDIA_CAPTURE);
    const section = buildTrialMediaCaptureSection(capture, language);
    if (!section) return phases;

    const timing = capture.timing as ProductTestTimingPhase;
    const next = phases.map((phase) => ({
        ...phase,
        sections: [...phase.sections],
    }));

    const target = next.find((phase) => phase.timing === timing);
    if (target) {
        target.sections.push(section);
    } else {
        next.push({
            timing,
            label: phaseLabel(timing, language),
            sections: [section],
        });
    }

    return sortPhases(next);
}

export function enrichSnapshotWithTrialMediaCaptureMeta<T extends { meta?: Record<string, unknown> }>(
    snapshot: T,
    config: ProductTestConfig,
): T {
    const tmMeta = buildTrialMediaCaptureSnapshotMeta(config);
    if (!tmMeta) return snapshot;

    return {
        ...snapshot,
        meta: {
            ...(snapshot.meta || {}),
            trial_media_capture: tmMeta,
        },
    };
}
