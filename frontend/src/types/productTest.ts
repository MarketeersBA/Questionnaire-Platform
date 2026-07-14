export type DiagnosticTag = 'PF' | 'EM' | null;

export type PackagingImageSide = 'front' | 'back';
export type PackagingHeatmapIntent = 'attraction' | 'dislikes' | 'improve';

/** GridFS-backed packaging photo reference stored on product_test_config. */
export interface PackagingImageAsset {
    asset_id: string;
    side: PackagingImageSide;
    survey_id: string;
    width: number;
    height: number;
    mime: string;
    filename?: string | null;
    uploaded_at: string;
}

export interface PackagingHeatmapImages {
    front?: PackagingImageAsset | null;
    back?: PackagingImageAsset | null;
}

export interface PackagingHeatmapClick {
    x: number;
    y: number;
    ts?: number;
    /** Per-pin respondent feedback used by analytics and AI/MI follow-up. */
    feedback?: RegionFeedback & {
        /** True once the initial AI/MI request has been attempted for the latest feedback. */
        follow_up_requested?: boolean;
    };
    /** @deprecated Use feedback.comment. */
    comment?: string;
}

/** A selected region on the packaging image (normalized 0..1 coordinates). */
export interface PackagingHeatmapRegion {
    /** Top-left corner X (0..1) */
    x1: number;
    /** Top-left corner Y (0..1) */
    y1: number;
    /** Bottom-right corner X (0..1) */
    x2: number;
    /** Bottom-right corner Y (0..1) */
    y2: number;
    ts: number;
    /** Post-selection feedback — populated in Phase 2 */
    feedback?: RegionFeedback;
}

export interface RegionFeedback {
    sentiment: 'like' | 'dislike' | 'recommend';
    comment?: string;
    /** GridFS asset ID for voice note — populated in Phase 3 */
    voice_note_asset_id?: string;
}

export interface PackagingHeatmapAnswer {
    image_side: PackagingImageSide;
    intent: PackagingHeatmapIntent;
    ref_width: number;
    ref_height: number;
    /** Legacy single-point clicks (kept for backward compat) or new pin taps */
    clicks?: PackagingHeatmapClick[];
    /** New area-based selections */
    regions: PackagingHeatmapRegion[];
    /** Overall comment across all pins */
    overall_comment?: string;
    overall_voice_note_id?: string;
}

export interface PackagingHeatmapAggregate {
    survey_id: string;
    question_id: string;
    image_side: PackagingImageSide;
    intent: PackagingHeatmapIntent;
    grid_size: number;
    bins: number[];
    total_clicks: number;
    response_count: number;
    updated_at: string;
}

export interface ProductTestQuestion {
    question_id: string;
    attribute: string;
    attribute_type: 'sub' | 'main' | '';
    parent_attribute: string | null;
    diagnostic_tag: DiagnosticTag;             // PF = Performance, EM = Emotional
    question_type: string;
    ar_text: string;
    en_text: string;
    ar_options: string | null;
    en_options: string | null;
    timing: 'Before Use' | 'During Use' | 'After Use';
    question_status: 'fixed' | 'optional';
    order: number;
}

export interface PackageTestQuestion extends Omit<ProductTestQuestion, 'diagnostic_tag'> { }

/** Respondent trial / IHUT media upload settings (configured at Parameters stage). */
export type TrialMediaAcceptedType = 'image' | 'video' | 'image_or_video';

export type TrialMediaCaptureTiming = 'before_use' | 'during_use' | 'after_use';

export interface ProductTestTrialMediaCapture {
    enabled: boolean;
    accepted_media: TrialMediaAcceptedType;
    required: boolean;
    timing: TrialMediaCaptureTiming;
    prompt_en: string;
    prompt_ar: string;
    max_video_duration_seconds: number;
    max_image_mb: number;
    max_video_mb: number;
}

export interface ProductTestConfig {
    config_id?: string;
    family_id?: string;
    version: number;
    language: 'en' | 'ar';
    selected_attributes: string[];
    fixed_questions: string[];
    optional_questions: string[];
    package_test_enabled: boolean;
    package_test_attributes: string[];
    packaging_heatmap_enabled: boolean;
    packaging_heatmap_images: PackagingHeatmapImages;
    trial_media_capture: ProductTestTrialMediaCapture;
    status: string;
}
