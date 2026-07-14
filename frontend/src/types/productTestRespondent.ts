import type { DiagnosticTag } from './productTest';
import type { QuestionMeta } from './tasteTest';
import type { PackagingHeatmapSnapshotMeta } from '../utils/packagingHeatmapSnapshot';
import type { TrialMediaCaptureSnapshotMeta } from '../utils/trialMediaCaptureSnapshot';

/** Conditional visibility for product-test questions (e.g. why-recommend open-end). */
export interface ProductTestVisibilityCondition {
    dependsOnQuestionId: string;
    min?: number;
    max?: number;
}

/** Canonical timing phases for the respondent product-test wizard. */
export type ProductTestTimingPhase =
    | 'before_use'
    | 'during_use'
    | 'after_use'
    | 'packaging';

export const PRODUCT_TEST_TIMING_PHASES: ProductTestTimingPhase[] = [
    'before_use',
    'during_use',
    'after_use',
    'packaging',
];

export type ProductTestRespondentModule =
    | 'product_test'
    | 'package_test'
    | 'packaging_heatmap'
    | 'trial_media_capture';

export type ProductTestTestingProtocol = 'branded' | 'blind';

/**
 * Brand evaluation context stored on the snapshot root.
 * Canonical keys are internal + competitive brand names from Parameters.
 */
export interface ProductTestBrandContext {
    brands: string[];
    own_brand?: string;
    category: string;
    testing_protocol: ProductTestTestingProtocol;
    blind_codes: Record<string, string>;
    /** Set when brand_context is synthesized at runtime for legacy snapshots. */
    _source?: 'runtime_fallback' | string;
}

/** Input for compose-time brand context (Parameters / survey config). */
export interface ProductTestBrandContextInput {
    brands: string[];
    own_brand?: string;
    category?: string;
    testing_protocol?: ProductTestTestingProtocol;
    blind_codes?: Record<string, string>;
}

/** Mapped question ready for respondent rendering. */
export interface ProductTestRespondentQuestion {
    id: string;
    text: string;
    type: string;
    options: string[];
    required: boolean;
    timing: ProductTestTimingPhase;
    diagnostic_tag: DiagnosticTag;
    questionMeta: QuestionMeta;
    /** Canonical brand key from Parameters (absent on legacy single-product snapshots). */
    brand?: string;
    /** Compose-time branded label cache; render-time blind codes override display. */
    displayBrand?: string;
    /** Bank question_id without brand prefix. */
    canonicalQuestionId?: string;
    /** When set, question is shown only when the dependency answer is within min..max. */
    visibilityCondition?: ProductTestVisibilityCondition;
}

/** Attribute group within a timing phase. */
export interface ProductTestRespondentSection {
    id: string;
    title: string;
    module: ProductTestRespondentModule;
    timing: ProductTestTimingPhase;
    questions: ProductTestRespondentQuestion[];
    brand?: string;
    displayBrand?: string;
}

/** One wizard step group (Before Use, During Use, etc.). */
export interface ProductTestRespondentPhase {
    timing: ProductTestTimingPhase;
    label: string;
    sections: ProductTestRespondentSection[];
}

export interface ProductTestSnapshotMeta {
    totalQuestions: number;
    sectionCount: number;
    phaseCount: number;
    generatedAt: string;
    /** Number of brands in brand_context (0 for legacy snapshots). */
    brandCount?: number;
    /** Average questions per brand when brand loop is active. */
    questionsPerBrand?: number;
    /** Packaging heatmap image metadata for respondent clients. */
    packaging_heatmap?: PackagingHeatmapSnapshotMeta;
    /** Trial media upload settings embedded for respondent clients. */
    trial_media_capture?: TrialMediaCaptureSnapshotMeta;
}

/**
 * Immutable respondent payload for product test surveys.
 * Stored on survey documents as `product_test_snapshot`.
 */
export interface ProductTestSnapshot {
    version: 1;
    language: 'en' | 'ar';
    phases: ProductTestRespondentPhase[];
    meta: ProductTestSnapshotMeta;
    /** Present on brand-looped snapshots; omitted on legacy surveys until migration. */
    brand_context?: ProductTestBrandContext;
}
