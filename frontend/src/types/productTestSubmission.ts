/**
 * Stable Phase 5 contract for product test respondent → DB → reports pipeline.
 * Keep field names stable — analytics and exports filter on these keys.
 */

export type ProductTestValueKind =
    | 'scalar_numeric'
    | 'scalar_text'
    | 'media_reference'
    | 'packaging_heatmap'
    | 'open_end'
    | 'unknown';

export interface ProductTestFlatEvaluation {
    question_id: string;
    /** Internal brand key when brand-looped; null for packaging / legacy single-pass. */
    brand: string | null;
    /** Respondent-facing label at submit time (e.g. blind sample code). */
    brand_display: string | null;
    /** Bank question id without `{brand}_` prefix. */
    canonical_question_id: string;
    section_id: string;
    section_title: string;
    attribute: string;
    timing: string;
    module: string;
    diagnostic_tag: string | null;
    question_text: string;
    /** Classified at submit — drives analytics / export routing. */
    value_kind?: ProductTestValueKind;
    /** Present when value_kind === 'media_reference'. */
    media_asset_id?: string | null;
    media_type?: 'image' | 'video' | null;
    question_type?: string | null;
    value: unknown;
}

export interface ProductTestSubmissionPhaseSection {
    sectionId: string;
    title: string;
    module: string;
    timing: string;
    answers: Record<string, unknown>;
}

export interface ProductTestSubmissionPhase {
    timing: string;
    label: string;
    sections: ProductTestSubmissionPhaseSection[];
}

export interface ProductTestSubmissionMeta {
    language: string;
    totalAnswers: number;
    duration_seconds: number;
    submitted_at?: string;
}

export interface ProductTestAttributeRegistryEntry {
    question_id: string;
    brand: string | null;
    canonical_question_id: string;
    section_id: string;
    section_title: string;
    timing: string;
    module: string;
    diagnostic_tag: string | null;
    question_text: string;
    question_type: string;
}

/** Stored under answers.__structured.product_test */
export interface ProductTestStructuredSubmission {
    phases: ProductTestSubmissionPhase[];
    flat_evaluations: ProductTestFlatEvaluation[];
    meta: ProductTestSubmissionMeta;
    attribute_registry: ProductTestAttributeRegistryEntry[];
}

export interface ProductTestSubmissionOptions {
    durationSeconds?: number;
    submittedAt?: string;
    /** Resolve respondent-facing brand label at submit (blind codes vs named brands). */
    resolveBrandDisplay?: (brandKey: string) => string;
}
