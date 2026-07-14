import type { ProductTestSnapshot } from '../types/productTestRespondent';
import type { ProductTestAttributeRegistryEntry } from '../types/productTestSubmission';
import { flattenSnapshotToLegacySections } from './productTestSnapshotBuilder';
import { resolveCanonicalQuestionId } from './productTestSubmissionBrand';

export interface ProductTestSnapshotStats {
    phaseCount: number;
    sectionCount: number;
    questionCount: number;
    brandCount: number;
    questionsPerBrand: number;
}

/** Read product_test_snapshot from composed schema (builder) or survey payload. */
export function resolveBlueprintProductTestSnapshot(source: {
    product_test_snapshot?: ProductTestSnapshot | null;
    schema?: { product_test_snapshot?: ProductTestSnapshot | null };
} | null | undefined): ProductTestSnapshot | null {
    if (!source) return null;
    return source.product_test_snapshot
        || source.schema?.product_test_snapshot
        || null;
}

export function countProductTestSnapshotStats(
    snapshot: ProductTestSnapshot | null | undefined,
): ProductTestSnapshotStats {
    if (!snapshot?.phases?.length) {
        return { phaseCount: 0, sectionCount: 0, questionCount: 0 };
    }
    const sectionCount = snapshot.phases.reduce((sum, p) => sum + p.sections.length, 0);
    const questionCount = snapshot.meta?.totalQuestions
        ?? snapshot.phases.reduce(
            (sum, p) => sum + p.sections.reduce((s, sec) => s + sec.questions.length, 0),
            0,
        );
    const brandCount = snapshot.brand_context?.brands?.length
        ?? snapshot.meta?.brandCount
        ?? 0;
    const questionsPerBrand = snapshot.meta?.questionsPerBrand
        ?? (brandCount > 0 ? Math.round(questionCount / brandCount) : questionCount);

    return {
        phaseCount: snapshot.phases.length,
        sectionCount,
        questionCount,
        brandCount,
        questionsPerBrand,
    };
}

/** Flatten timing-phase snapshot into architect-friendly section list. */
export function flattenSnapshotForArchitectPreview(snapshot: ProductTestSnapshot) {
    return flattenSnapshotToLegacySections(snapshot).map((section) => ({
        ...section,
        phaseTiming: section.questions[0]?.timing,
        brand: section.brand,
        displayBrand: section.displayBrand,
    }));
}

/** Stable attribute registry for analytics / export (timing + diagnostic_tag). */
export function buildProductTestAttributeRegistry(
    snapshot: ProductTestSnapshot | null | undefined,
): ProductTestAttributeRegistryEntry[] {
    if (!snapshot?.phases?.length) return [];

    const entries: ProductTestAttributeRegistryEntry[] = [];
    snapshot.phases.forEach((phase) => {
        phase.sections.forEach((section) => {
            section.questions.forEach((question) => {
                const brand = section.brand ?? question.brand ?? null;
                entries.push({
                    question_id: question.id,
                    brand,
                    canonical_question_id:
                        question.canonicalQuestionId
                        ?? resolveCanonicalQuestionId(question.id, brand),
                    section_id: section.id,
                    section_title: section.title,
                    timing: phase.timing,
                    module: section.module,
                    diagnostic_tag: question.diagnostic_tag ?? null,
                    question_text: question.text,
                    question_type: question.type,
                });
            });
        });
    });
    return entries;
}

export function snapshotHasBlueprintContent(snapshot: ProductTestSnapshot | null | undefined): boolean {
    const stats = countProductTestSnapshotStats(snapshot);
    return stats.questionCount > 0;
}

/** Apply architect-step edits back into the dedicated product test snapshot. */
export function patchProductTestSnapshotQuestion(
    snapshot: ProductTestSnapshot,
    questionId: string,
    patch: Record<string, unknown>,
): ProductTestSnapshot {
    const next: ProductTestSnapshot = JSON.parse(JSON.stringify(snapshot));
    for (const phase of next.phases) {
        for (const section of phase.sections) {
            const idx = section.questions.findIndex((q) => q.id === questionId);
            if (idx >= 0) {
                section.questions[idx] = {
                    ...section.questions[idx],
                    ...patch,
                } as typeof section.questions[number];
                return next;
            }
        }
    }
    return next;
}
