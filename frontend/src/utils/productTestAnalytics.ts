import type {
    ProductTestAttributeRegistryEntry,
    ProductTestFlatEvaluation,
    ProductTestStructuredSubmission,
    ProductTestValueKind,
} from '../types/productTestSubmission';
import { buildProductTestAttributeRegistry } from './productTestBlueprintUtils';
import {
    brandKeyForAnalytics,
    evaluationMatchesBrand,
    PRODUCT_TEST_UNSCOPED_BRAND_KEY,
} from './productTestSubmissionBrand';
import type { ProductTestSnapshot } from '../types/productTestRespondent';
import { isProductTestMediaAnswerReference } from './productTestMediaAnswer';
import {
    classifyProductTestEvaluationValue,
    isScalarProductTestValueKind,
} from './productTestValueClassification';

export type { ProductTestAttributeRegistryEntry, ProductTestFlatEvaluation, ProductTestValueKind };

/** Extract product_test block from a stored response answers blob. */
export function extractProductTestStructured(
    answers: Record<string, unknown> | null | undefined,
): ProductTestStructuredSubmission | null {
    const structured = answers?.__structured as Record<string, unknown> | undefined;
    const block = structured?.product_test as ProductTestStructuredSubmission | undefined;
    return block?.flat_evaluations ? block : null;
}

export function extractProductTestFlatEvaluations(
    answers: Record<string, unknown> | null | undefined,
): ProductTestFlatEvaluation[] {
    return extractProductTestStructured(answers)?.flat_evaluations ?? [];
}

export function resolveRowValueKind(row: ProductTestFlatEvaluation): ProductTestValueKind {
    if (row.value_kind) return row.value_kind;
    return classifyProductTestEvaluationValue(row.value, {
        module: row.module,
        questionType: undefined,
    });
}

export function filterEvaluationsByTiming(
    evaluations: ProductTestFlatEvaluation[],
    timing: string,
): ProductTestFlatEvaluation[] {
    return evaluations.filter((row) => row.timing === timing);
}

export function filterEvaluationsByDiagnosticTag(
    evaluations: ProductTestFlatEvaluation[],
    tag: string,
): ProductTestFlatEvaluation[] {
    return evaluations.filter((row) => row.diagnostic_tag === tag);
}

export function filterEvaluationsByModule(
    evaluations: ProductTestFlatEvaluation[],
    module: string,
): ProductTestFlatEvaluation[] {
    return evaluations.filter((row) => row.module === module);
}

export function filterEvaluationsByBrand(
    evaluations: ProductTestFlatEvaluation[],
    brandKey: string,
): ProductTestFlatEvaluation[] {
    return evaluations.filter((row) => evaluationMatchesBrand(row, brandKey));
}

export function filterTrialMediaEvaluations(
    evaluations: ProductTestFlatEvaluation[],
): ProductTestFlatEvaluation[] {
    return evaluations.filter(
        (row) => row.module === 'trial_media_capture' || resolveRowValueKind(row) === 'media_reference',
    );
}

export function filterScalarEvaluations(
    evaluations: ProductTestFlatEvaluation[],
): ProductTestFlatEvaluation[] {
    return evaluations.filter((row) => isScalarProductTestValueKind(resolveRowValueKind(row)));
}

export interface ProductTestBrandSummaryBucket {
    count: number;
    /** Latest resolved display label seen for this brand key (blind code or name). */
    brand_display: string | null;
}

export interface ProductTestTrialMediaSummary {
    responseCount: number;
    responsesWithMedia: number;
    uploadCount: number;
    byMediaType: Record<string, number>;
    byTiming: Record<string, number>;
    totalBytes: number;
    avgDurationSeconds: number | null;
}

export interface ProductTestResponseSummary {
    responseCount: number;
    totalAnswers: number;
    scalarAnswerCount: number;
    mediaReferenceCount: number;
    byTiming: Record<string, number>;
    byDiagnosticTag: Record<string, number>;
    byModule: Record<string, number>;
    byBrand: Record<string, ProductTestBrandSummaryBucket>;
    scalarByTiming: Record<string, number>;
    scalarByDiagnosticTag: Record<string, number>;
    trialMedia: ProductTestTrialMediaSummary;
}

export { PRODUCT_TEST_UNSCOPED_BRAND_KEY };

function summarizeTrialMediaResponses(
    responses: Array<{ answers?: Record<string, unknown> }>,
): ProductTestTrialMediaSummary {
    const summary: ProductTestTrialMediaSummary = {
        responseCount: responses.length,
        responsesWithMedia: 0,
        uploadCount: 0,
        byMediaType: {},
        byTiming: {},
        totalBytes: 0,
        avgDurationSeconds: null,
    };

    let durationTotal = 0;
    let durationCount = 0;

    for (const response of responses) {
        const rows = filterTrialMediaEvaluations(extractProductTestFlatEvaluations(response.answers));
        if (!rows.length) continue;

        summary.responsesWithMedia += 1;
        for (const row of rows) {
            const value = row.value;
            if (!isProductTestMediaAnswerReference(value)) continue;

            summary.uploadCount += 1;
            const mediaType = value.media_type || 'unknown';
            const timing = row.timing || 'unknown';
            summary.byMediaType[mediaType] = (summary.byMediaType[mediaType] ?? 0) + 1;
            summary.byTiming[timing] = (summary.byTiming[timing] ?? 0) + 1;
            summary.totalBytes += value.size_bytes || 0;

            if (typeof value.duration_seconds === 'number') {
                durationTotal += value.duration_seconds;
                durationCount += 1;
            }
        }
    }

    summary.avgDurationSeconds = durationCount ? Math.round((durationTotal / durationCount) * 100) / 100 : null;
    return summary;
}

/** Aggregate flat_evaluations across multiple stored responses (export / report v1). */
export function summarizeProductTestResponses(
    responses: Array<{ answers?: Record<string, unknown> }>,
): ProductTestResponseSummary {
    const summary: ProductTestResponseSummary = {
        responseCount: responses.length,
        totalAnswers: 0,
        scalarAnswerCount: 0,
        mediaReferenceCount: 0,
        byTiming: {},
        byDiagnosticTag: {},
        byModule: {},
        byBrand: {},
        scalarByTiming: {},
        scalarByDiagnosticTag: {},
        trialMedia: summarizeTrialMediaResponses(responses),
    };

    for (const response of responses) {
        for (const row of extractProductTestFlatEvaluations(response.answers)) {
            summary.totalAnswers += 1;
            const timing = row.timing || 'unknown';
            const tag = row.diagnostic_tag ?? 'none';
            const module = row.module || 'unknown';
            const brandBucket = brandKeyForAnalytics(row.brand);
            const valueKind = resolveRowValueKind(row);

            summary.byTiming[timing] = (summary.byTiming[timing] ?? 0) + 1;
            summary.byDiagnosticTag[tag] = (summary.byDiagnosticTag[tag] ?? 0) + 1;
            summary.byModule[module] = (summary.byModule[module] ?? 0) + 1;

            if (valueKind === 'media_reference') {
                summary.mediaReferenceCount += 1;
            } else if (isScalarProductTestValueKind(valueKind)) {
                summary.scalarAnswerCount += 1;
                summary.scalarByTiming[timing] = (summary.scalarByTiming[timing] ?? 0) + 1;
                summary.scalarByDiagnosticTag[tag] = (summary.scalarByDiagnosticTag[tag] ?? 0) + 1;
            }

            const existing = summary.byBrand[brandBucket];
            if (existing) {
                existing.count += 1;
                if (row.brand_display?.trim()) {
                    existing.brand_display = row.brand_display;
                }
            } else {
                summary.byBrand[brandBucket] = {
                    count: 1,
                    brand_display: row.brand_display ?? null,
                };
            }
        }
    }

    return summary;
}

/** Registry from snapshot (builder) or from stored submission (respondent). */
export function resolveProductTestAttributeRegistry(
    source: {
        product_test_snapshot?: ProductTestSnapshot | null;
        answers?: Record<string, unknown>;
    },
): ProductTestAttributeRegistryEntry[] {
    const fromSubmission = extractProductTestStructured(source.answers)?.attribute_registry;
    if (fromSubmission?.length) return fromSubmission;
    return buildProductTestAttributeRegistry(source.product_test_snapshot);
}

/** Build authenticated analyst stream URL for trial media review. */
export function buildTrialMediaAnalystStreamPath(surveyId: string, assetId: string): string {
    return `/surveys/${surveyId}/product-test/media/${assetId}/stream`;
}

export function buildTrialMediaAnalystDownloadPath(surveyId: string, assetId: string): string {
    return `/surveys/${surveyId}/product-test/media/${assetId}/download`;
}
