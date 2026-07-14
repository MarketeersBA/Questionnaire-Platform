import { describe, expect, it } from 'vitest';
import {
    buildProductTestAttributeRegistry,
    countProductTestSnapshotStats,
    snapshotHasBlueprintContent,
} from './productTestBlueprintUtils';
import type { ProductTestSnapshot } from '../types/productTestRespondent';

const SNAPSHOT: ProductTestSnapshot = {
    version: 1,
    language: 'en',
    phases: [
        {
            timing: 'before_use',
            label: 'Before Use',
            sections: [
                {
                    id: 's1',
                    title: 'Appearance',
                    module: 'product_test',
                    timing: 'before_use',
                    questions: [
                        {
                            id: 'q1',
                            text: 'Look',
                            type: 'scale',
                            options: [],
                            required: true,
                            timing: 'before_use',
                            diagnostic_tag: 'PF',
                            questionMeta: {},
                        },
                    ],
                },
            ],
        },
        {
            timing: 'during_use',
            label: 'During Use',
            sections: [
                {
                    id: 's2',
                    title: 'Prep',
                    module: 'product_test',
                    timing: 'during_use',
                    questions: [
                        {
                            id: 'q2',
                            text: 'Ease',
                            type: 'scale',
                            options: [],
                            required: true,
                            timing: 'during_use',
                            diagnostic_tag: 'PF',
                            questionMeta: {},
                        },
                    ],
                },
            ],
        },
    ],
    meta: { totalQuestions: 2, sectionCount: 2, phaseCount: 2, generatedAt: '2026-01-01' },
};

describe('productTestBlueprintUtils', () => {
    it('counts phases, sections, and questions from snapshot', () => {
        expect(countProductTestSnapshotStats(SNAPSHOT)).toEqual({
            phaseCount: 2,
            sectionCount: 2,
            questionCount: 2,
            brandCount: 0,
            questionsPerBrand: 2,
        });
    });

    it('builds stable attribute registry for analytics', () => {
        const registry = buildProductTestAttributeRegistry(SNAPSHOT);
        expect(registry).toHaveLength(2);
        expect(registry[0]).toMatchObject({
            question_id: 'q1',
            timing: 'before_use',
            diagnostic_tag: 'PF',
            module: 'product_test',
        });
    });

    it('snapshotHasBlueprintContent detects empty vs populated', () => {
        expect(snapshotHasBlueprintContent(SNAPSHOT)).toBe(true);
        expect(snapshotHasBlueprintContent({ version: 1, language: 'en', phases: [], meta: { totalQuestions: 0, sectionCount: 0, phaseCount: 0, generatedAt: '' } })).toBe(false);
    });
});
