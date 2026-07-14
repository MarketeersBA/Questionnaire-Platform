/**
 * Phase 5 — stable structured submission envelope for product test surveys.
 * Respondent → DB → reports / exports share this contract.
 */

import type { ProductTestSnapshot } from '../types/productTestRespondent';
import type {
    ProductTestStructuredSubmission,
} from '../types/productTestSubmission';
import { buildProductTestAttributeRegistry } from './productTestBlueprintUtils';
import {
    buildProductTestSubmission,
    type ProductTestAnswers,
    type ProductTestSubmissionOptions,
} from './productTestFlowOrchestration';

export interface Phase5StructuredEnvelope {
    product_test: ProductTestStructuredSubmission;
}

export interface BuildPhase5SubmissionInput {
    snapshot: ProductTestSnapshot | null;
    answers: ProductTestAnswers;
    options?: ProductTestSubmissionOptions;
}

/** Enrich legacy question_map with snapshot question metadata (timing, diagnostic_tag, module). */
export function enrichQuestionMapFromProductTestSnapshot(
    questionMap: Record<string, Record<string, unknown>>,
    snapshot: ProductTestSnapshot,
): void {
    snapshot.phases.forEach((phase) => {
        phase.sections.forEach((section) => {
            section.questions.forEach((question) => {
                if (questionMap[question.id]) return;
                questionMap[question.id] = {
                    text: question.text,
                    type: question.type,
                    attribute: section.title,
                    timing: phase.timing,
                    diagnostic_tag: question.diagnostic_tag ?? null,
                    module: section.module,
                    brand: section.brand ?? question.brand ?? null,
                    canonical_question_id: question.canonicalQuestionId ?? question.id,
                };
            });
        });
    });
}

/**
 * Build the Phase 5 `__structured.product_test` block.
 * Always emits when a snapshot exists — phases + attribute_registry remain stable even with zero answers.
 */
export function buildPhase5ProductTestBlock(
    input: BuildPhase5SubmissionInput,
): ProductTestStructuredSubmission | null {
    const { snapshot, answers, options = {} } = input;
    if (!snapshot?.phases?.length) return null;

    const payload = buildProductTestSubmission(answers, snapshot, options);

    return {
        phases: payload.phases,
        flat_evaluations: payload.flat_evaluations,
        attribute_registry: payload.attribute_registry.length
            ? payload.attribute_registry
            : buildProductTestAttributeRegistry(snapshot),
        meta: payload.meta,
    };
}

/** Validate Phase 5 block shape (tests + optional client-side guards). */
export function assertPhase5ProductTestShape(
    block: ProductTestStructuredSubmission,
): void {
    if (!Array.isArray(block.phases)) {
        throw new Error('product_test.phases must be an array');
    }
    if (!Array.isArray(block.flat_evaluations)) {
        throw new Error('product_test.flat_evaluations must be an array');
    }
    if (!Array.isArray(block.attribute_registry)) {
        throw new Error('product_test.attribute_registry must be an array');
    }
    if (!block.meta || typeof block.meta.language !== 'string') {
        throw new Error('product_test.meta.language is required');
    }
    if (typeof block.meta.duration_seconds !== 'number') {
        throw new Error('product_test.meta.duration_seconds must be a number');
    }
}
