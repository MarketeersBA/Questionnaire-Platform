import type { ProductTestConfig, ProductTestTrialMediaCapture } from '../types/productTest';

/** Respondent timing phases eligible for trial media upload. */
export type TrialMediaCaptureTiming = ProductTestTrialMediaCapture['timing'];

export type TrialMediaAcceptedType = ProductTestTrialMediaCapture['accepted_media'];

export const TRIAL_MEDIA_CAPTURE_TIMING_OPTIONS: Array<{
    value: TrialMediaCaptureTiming;
    labelEn: string;
    labelAr: string;
}> = [
    { value: 'before_use', labelEn: 'Before Use', labelAr: 'قبل الاستخدام' },
    { value: 'during_use', labelEn: 'During Use', labelAr: 'أثناء الاستخدام' },
    { value: 'after_use', labelEn: 'After Use', labelAr: 'بعد الاستخدام' },
];

export const TRIAL_MEDIA_ACCEPTED_OPTIONS: Array<{
    value: TrialMediaAcceptedType;
    labelEn: string;
    labelAr: string;
}> = [
    { value: 'image', labelEn: 'Image only', labelAr: 'صورة فقط' },
    { value: 'video', labelEn: 'Video only', labelAr: 'فيديو فقط' },
    { value: 'image_or_video', labelEn: 'Image or video', labelAr: 'صورة أو فيديو' },
];

/** Conservative defaults — feature off until explicitly enabled. */
export const DEFAULT_TRIAL_MEDIA_CAPTURE: ProductTestTrialMediaCapture = {
    enabled: false,
    accepted_media: 'image_or_video',
    required: false,
    timing: 'after_use',
    prompt_en: 'Please upload a photo or short video showing your experience with the product during the trial.',
    prompt_ar: 'يرجى رفع صورة أو فيديو قصير يوضح تجربتك مع المنتج أثناء التجربة.',
    max_video_duration_seconds: 60,
    max_image_mb: 5,
    max_video_mb: 25,
};

const ACCEPTED_MEDIA_SET = new Set<TrialMediaAcceptedType>(['image', 'video', 'image_or_video']);
const TIMING_SET = new Set<TrialMediaCaptureTiming>(['before_use', 'during_use', 'after_use']);

/**
 * Normalize partial / legacy trial_media_capture payloads from API, clones, or drafts.
 */
export function normalizeTrialMediaCapture(
    raw?: Partial<ProductTestTrialMediaCapture> | null,
): ProductTestTrialMediaCapture {
    if (!raw || typeof raw !== 'object') {
        return { ...DEFAULT_TRIAL_MEDIA_CAPTURE };
    }

    const accepted = raw.accepted_media;
    const timing = raw.timing;

    return {
        enabled: Boolean(raw.enabled),
        accepted_media: ACCEPTED_MEDIA_SET.has(accepted as TrialMediaAcceptedType)
            ? (accepted as TrialMediaAcceptedType)
            : DEFAULT_TRIAL_MEDIA_CAPTURE.accepted_media,
        required: Boolean(raw.required),
        timing: TIMING_SET.has(timing as TrialMediaCaptureTiming)
            ? (timing as TrialMediaCaptureTiming)
            : DEFAULT_TRIAL_MEDIA_CAPTURE.timing,
        prompt_en: (raw.prompt_en || DEFAULT_TRIAL_MEDIA_CAPTURE.prompt_en).trim(),
        prompt_ar: (raw.prompt_ar || DEFAULT_TRIAL_MEDIA_CAPTURE.prompt_ar).trim(),
        max_video_duration_seconds: clampInt(
            raw.max_video_duration_seconds,
            DEFAULT_TRIAL_MEDIA_CAPTURE.max_video_duration_seconds,
            5,
            120,
        ),
        max_image_mb: clampInt(
            raw.max_image_mb,
            DEFAULT_TRIAL_MEDIA_CAPTURE.max_image_mb,
            1,
            20,
        ),
        max_video_mb: clampInt(
            raw.max_video_mb,
            DEFAULT_TRIAL_MEDIA_CAPTURE.max_video_mb,
            5,
            100,
        ),
    };
}

/** Ensure product_test_config always carries a normalized trial_media_capture block. */
export function withNormalizedTrialMediaCapture(config: ProductTestConfig): ProductTestConfig {
    return {
        ...config,
        trial_media_capture: normalizeTrialMediaCapture(config.trial_media_capture),
    };
}

export function formatTrialMediaAcceptedLabel(
    accepted: TrialMediaAcceptedType,
    language: 'en' | 'ar' = 'en',
): string {
    const option = TRIAL_MEDIA_ACCEPTED_OPTIONS.find((o) => o.value === accepted);
    if (!option) return accepted;
    return language === 'ar' ? option.labelAr : option.labelEn;
}

export function formatTrialMediaTimingLabel(
    timing: TrialMediaCaptureTiming,
    language: 'en' | 'ar' = 'en',
): string {
    const option = TRIAL_MEDIA_CAPTURE_TIMING_OPTIONS.find((o) => o.value === timing);
    if (!option) return timing;
    return language === 'ar' ? option.labelAr : option.labelEn;
}

export function formatTrialMediaCaptureSummary(
    capture: ProductTestTrialMediaCapture | undefined | null,
    language: 'en' | 'ar' = 'en',
): string {
    const normalized = normalizeTrialMediaCapture(capture);
    if (!normalized.enabled) {
        return language === 'ar' ? 'معطل' : 'Disabled';
    }

    const requiredLabel = normalized.required
        ? (language === 'ar' ? 'إلزامي' : 'Required')
        : (language === 'ar' ? 'اختياري' : 'Optional');

    const accepted = formatTrialMediaAcceptedLabel(normalized.accepted_media, language);
    const timing = formatTrialMediaTimingLabel(normalized.timing, language);
    const duration = `${normalized.max_video_duration_seconds}s`;

    return language === 'ar'
        ? `${requiredLabel} · ${accepted} · ${timing} · حد الفيديو ${duration}`
        : `${requiredLabel} · ${accepted} · ${timing} · ${duration} video max`;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
}
