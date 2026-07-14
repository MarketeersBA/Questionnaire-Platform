import type { ApiError } from '../services/api';
import type { ProductTestMediaAnswerReference } from '../types/productTestMediaAnswer';
import type { ProductTestRespondentQuestion } from '../types/productTestRespondent';

export type AcceptedMediaMode = 'image' | 'video' | 'image_or_video';

export interface TrialMediaClientLimits {
    acceptedMedia: AcceptedMediaMode;
    maxImageMb: number;
    maxVideoMb: number;
    maxVideoDurationSeconds: number;
}

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

export function resolveTrialMediaClientLimits(
    question: ProductTestRespondentQuestion,
): TrialMediaClientLimits {
    const meta = question.questionMeta as Record<string, unknown> | undefined;
    return {
        acceptedMedia: (meta?.acceptedMedia as AcceptedMediaMode) || 'image_or_video',
        maxImageMb: Number(meta?.maxImageMb) || 5,
        maxVideoMb: Number(meta?.maxVideoMb) || 25,
        maxVideoDurationSeconds: Number(meta?.maxVideoDurationSeconds) || 60,
    };
}

export function isProductTestMediaAnswerReference(
    value: unknown,
): value is ProductTestMediaAnswerReference {
    if (!value || typeof value !== 'object') return false;
    const obj = value as ProductTestMediaAnswerReference;
    return typeof obj.asset_id === 'string' && obj.asset_id.length > 0
        && (obj.media_type === 'image' || obj.media_type === 'video');
}

export function isProductTestMediaAnswerComplete(value: unknown): boolean {
    return isProductTestMediaAnswerReference(value);
}

export function classifyFileMediaType(file: File): 'image' | 'video' | null {
    if (IMAGE_MIMES.has(file.type)) return 'image';
    if (VIDEO_MIMES.has(file.type)) return 'video';

    const name = file.name.toLowerCase();
    if (/\.(jpe?g|png|webp)$/.test(name)) return 'image';
    if (/\.(mp4|webm|mov)$/.test(name)) return 'video';
    return null;
}

export function validateTrialMediaFile(
    file: File,
    limits: TrialMediaClientLimits,
    language: 'en' | 'ar' = 'en',
): string | null {
    const isArabic = language === 'ar';
    const mediaType = classifyFileMediaType(file);
    if (!mediaType) {
        return isArabic
            ? 'نوع الملف غير مدعوم. استخدم JPEG أو PNG أو WebP للصور، أو MP4 أو WebM أو MOV للفيديو.'
            : 'Unsupported file type. Use JPEG, PNG, or WebP for images, or MP4, WebM, or MOV for videos.';
    }

    if (limits.acceptedMedia === 'image' && mediaType !== 'image') {
        return isArabic ? 'هذا الاستبيان يقبل الصور فقط.' : 'This survey accepts images only.';
    }
    if (limits.acceptedMedia === 'video' && mediaType !== 'video') {
        return isArabic ? 'هذا الاستبيان يقبل الفيديو فقط.' : 'This survey accepts videos only.';
    }

    const maxBytes = (mediaType === 'image' ? limits.maxImageMb : limits.maxVideoMb) * 1024 * 1024;
    if (file.size > maxBytes) {
        const capMb = mediaType === 'image' ? limits.maxImageMb : limits.maxVideoMb;
        return isArabic
            ? `الملف كبير جداً. الحد الأقصى ${capMb} ميجابايت.`
            : `File is too large. Maximum ${capMb}MB allowed.`;
    }

    return null;
}

export function mapTrialMediaUploadError(
    error: unknown,
    language: 'en' | 'ar' = 'en',
): string {
    const isArabic = language === 'ar';
    const apiError = error as ApiError;
    const detail = apiError?.actionable_message || apiError?.message;

    if (typeof detail === 'string' && detail.trim()) {
        if (/too long|duration/i.test(detail)) {
            return isArabic
                ? 'الفيديو أطول من المدة المسموح بها.'
                : detail;
        }
        if (/too large|413/i.test(detail) || apiError?.status === 413) {
            return isArabic ? 'الملف أكبر من الحد المسموح.' : detail;
        }
        if (/unsupported|415/i.test(detail) || apiError?.status === 415) {
            return isArabic ? 'نوع الملف غير مدعوم.' : detail;
        }
        if (/not enabled|403/i.test(detail) || apiError?.status === 403) {
            return isArabic ? 'رفع الوسائط غير مفعّل لهذا الاستبيان.' : detail;
        }
        return detail;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
        return isArabic ? 'تم إلغاء الرفع.' : 'Upload cancelled.';
    }

    return isArabic
        ? 'تعذر رفع الملف. يرجى المحاولة مرة أخرى.'
        : 'Could not upload file. Please try again.';
}

export function formatMediaFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
