import type {
    ProductTestRespondentQuestion,
    ProductTestRespondentSection,
} from '../types/productTestRespondent';
import type { ProductTestSubmissionOptions } from '../types/productTestSubmission';

/** Analytics bucket key when a question has no brand scope (packaging, legacy). */
export const PRODUCT_TEST_UNSCOPED_BRAND_KEY = '__unscoped__';

export interface ProductTestEvaluationBrandFields {
    brand: string | null;
    brand_display: string | null;
    canonical_question_id: string;
}

/** Strip `{brand}_` prefix from a scoped question id. */
export function resolveCanonicalQuestionId(
    questionId: string,
    brandKey: string | null | undefined,
): string {
    if (brandKey && questionId.startsWith(`${brandKey}_`)) {
        return questionId.slice(brandKey.length + 1);
    }
    return questionId;
}

/**
 * Resolve brand metadata for a flat evaluation row at submit time.
 * `brand_display` is resolved via caller-supplied blind/branded resolver.
 */
export function resolveProductTestEvaluationBrandFields(
    section: Pick<ProductTestRespondentSection, 'brand' | 'displayBrand'>,
    question: Pick<
        ProductTestRespondentQuestion,
        'id' | 'brand' | 'displayBrand' | 'canonicalQuestionId'
    >,
    options: Pick<ProductTestSubmissionOptions, 'resolveBrandDisplay'>,
): ProductTestEvaluationBrandFields {
    const brand = section.brand ?? question.brand ?? null;
    const canonical_question_id =
        question.canonicalQuestionId ?? resolveCanonicalQuestionId(question.id, brand);

    let brand_display: string | null = null;
    if (brand) {
        brand_display =
            options.resolveBrandDisplay?.(brand)
            ?? section.displayBrand
            ?? question.displayBrand
            ?? brand;
    }

    return { brand, brand_display, canonical_question_id };
}

/** Stable bucket key for summarizeProductTestResponses.byBrand. */
export function brandKeyForAnalytics(brand: string | null | undefined): string {
    return brand?.trim() || PRODUCT_TEST_UNSCOPED_BRAND_KEY;
}

/** Match evaluations by internal brand key (not display label). */
export function evaluationMatchesBrand(
    row: { brand?: string | null },
    brandKey: string,
): boolean {
    if (brandKey === PRODUCT_TEST_UNSCOPED_BRAND_KEY) {
        return !row.brand?.trim();
    }
    return row.brand === brandKey;
}
