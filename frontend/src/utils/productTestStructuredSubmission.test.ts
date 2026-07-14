import { describe, expect, it } from 'vitest';
import type { ProductTestSnapshot } from '../types/productTestRespondent';
import {
    assertPhase5ProductTestShape,
    buildPhase5ProductTestBlock,
    enrichQuestionMapFromProductTestSnapshot,
} from './productTestStructuredSubmission';

const MOCK_SNAPSHOT: ProductTestSnapshot = {
    version: 1,
    language: 'en',
    phases: [
        {
            timing: 'before_use',
            label: 'Before Use',
            sections: [
                {
                    id: 'before_use_appearance',
                    title: 'Product Appearance',
                    module: 'product_test',
                    timing: 'before_use',
                    questions: [
                        {
                            id: 'pt_q01',
                            text: 'Product Look',
                            type: 'scale',
                            options: [],
                            required: true,
                            timing: 'before_use',
                            diagnostic_tag: 'PF',
                            canonicalQuestionId: 'pt_q01',
                        },
                    ],
                },
            ],
        },
    ],
    meta: { totalQuestions: 1, sectionCount: 1, phaseCount: 1, generatedAt: '2026-01-01' },
};

describe('productTestStructuredSubmission', () => {
    it('builds Phase 5 block with phases, flat_evaluations, attribute_registry, meta', () => {
        const block = buildPhase5ProductTestBlock({
            snapshot: MOCK_SNAPSHOT,
            answers: { pt_q01: 4 },
            options: { durationSeconds: 120, submittedAt: '2026-06-30T12:00:00.000Z' },
        });

        expect(block).not.toBeNull();
        assertPhase5ProductTestShape(block!);
        expect(block!.phases).toHaveLength(1);
        expect(block!.phases[0].sections[0].answers.pt_q01).toBe(4);
        expect(block!.flat_evaluations).toHaveLength(1);
        expect(block!.flat_evaluations[0]).toMatchObject({
            question_id: 'pt_q01',
            timing: 'before_use',
            diagnostic_tag: 'PF',
            module: 'product_test',
        });
        expect(block!.attribute_registry.length).toBeGreaterThan(0);
        expect(block!.meta.duration_seconds).toBe(120);
    });

    it('emits stable registry and empty flat_evaluations when no answers yet', () => {
        const block = buildPhase5ProductTestBlock({
            snapshot: MOCK_SNAPSHOT,
            answers: {},
            options: { durationSeconds: 0 },
        });

        expect(block!.flat_evaluations).toHaveLength(0);
        expect(block!.attribute_registry).toHaveLength(1);
        expect(block!.phases[0].sections[0].answers).toEqual({});
    });

    it('enriches question_map from snapshot metadata', () => {
        const map: Record<string, Record<string, unknown>> = {};
        enrichQuestionMapFromProductTestSnapshot(map, MOCK_SNAPSHOT);
        expect(map.pt_q01).toMatchObject({
            timing: 'before_use',
            diagnostic_tag: 'PF',
            module: 'product_test',
        });
    });
});
