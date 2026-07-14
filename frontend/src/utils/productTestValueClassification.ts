import { isProductTestMediaAnswerReference } from './productTestMediaAnswer';

/** Stable value classification for analytics / exports — mirrors backend contract. */
export type ProductTestValueKind =
    | 'scalar_numeric'
    | 'scalar_text'
    | 'media_reference'
    | 'packaging_heatmap'
    | 'open_end'
    | 'unknown';

export interface ProductTestEvaluationContext {
    module?: string;
    questionType?: string;
}

export function classifyProductTestEvaluationValue(
    value: unknown,
    context: ProductTestEvaluationContext = {},
): ProductTestValueKind {
    const { module, questionType } = context;

    if (module === 'trial_media_capture' || questionType === 'media-upload') {
        return isProductTestMediaAnswerReference(value) ? 'media_reference' : 'unknown';
    }

    if (module === 'packaging_heatmap') {
        return 'packaging_heatmap';
    }

    if (value === null || value === undefined) return 'unknown';

    if (typeof value === 'number' && !Number.isNaN(value)) {
        return 'scalar_numeric';
    }

    if (typeof value === 'string') {
        return value.trim().length > 0 ? 'scalar_text' : 'unknown';
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        if (isProductTestMediaAnswerReference(obj)) {
            return 'media_reference';
        }
        if ('text' in obj || 'voice_feedback_id' in obj) {
            return 'open_end';
        }
        if ('clicks' in obj || 'regions' in obj || 'image_side' in obj) {
            return 'packaging_heatmap';
        }
    }

    return 'unknown';
}

export function isScalarProductTestValueKind(kind: ProductTestValueKind): boolean {
    return kind === 'scalar_numeric' || kind === 'scalar_text';
}

export function isNumericScoreProductTestValueKind(kind: ProductTestValueKind): boolean {
    return kind === 'scalar_numeric';
}

export function shouldExcludeFromNumericAggregation(kind: ProductTestValueKind): boolean {
    return kind === 'media_reference' || kind === 'packaging_heatmap' || kind === 'open_end' || kind === 'unknown';
}

export function extractMediaReferenceFields(value: unknown): {
    media_asset_id: string | null;
    media_type: 'image' | 'video' | null;
} {
    if (!isProductTestMediaAnswerReference(value)) {
        return { media_asset_id: null, media_type: null };
    }
    return {
        media_asset_id: value.asset_id,
        media_type: value.media_type,
    };
}
