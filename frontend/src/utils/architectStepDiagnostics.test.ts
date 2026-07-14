import { describe, expect, it } from 'vitest';
import {
    buildProductTestBlueprintSnapshot,
    resolveLayerEmptyDiagnostic,
} from './architectStepDiagnostics';
import { SurveyFormData, DEFAULT_TASTE_CONFIG } from '../pages/CreateSurvey/types';

const productTestForm = {
    survey_type: 'product_test',
    config: { ...DEFAULT_TASTE_CONFIG, category: 'Foam' },
    product_test_config: {
        version: 1,
        language: 'en',
        selected_attributes: ['Product Appearance', 'Ease of Use', 'Core Performance', 'Overall Liking', 'Pack Shape'],
        fixed_questions: [],
        optional_questions: [],
        package_test_enabled: true,
        package_test_attributes: ['Pack Shape'],
        status: 'draft',
    },
    schema: {
        layer1_structure: { sections: [{ questions: [{ id: 'q1' }, { id: 'q2' }] }] },
        layer2_structure: { sections: [] },
    },
} as SurveyFormData;

describe('architectStepDiagnostics', () => {
    it('buildProductTestBlueprintSnapshot aggregates schema and config', () => {
        const snap = buildProductTestBlueprintSnapshot(productTestForm);
        expect(snap.l1QuestionCount).toBe(2);
        expect(snap.sectionCount).toBe(0);
        expect(snap.hasSnapshot).toBe(false);
        expect(snap.selectedAttributeCount).toBe(5);
        expect(snap.packageTestEnabled).toBe(true);
        expect(snap.packageAttributeCount).toBe(1);
    });

    it('buildProductTestBlueprintSnapshot reads product_test_snapshot stats', () => {
        const snap = buildProductTestBlueprintSnapshot({
            ...productTestForm,
            schema: {
                ...productTestForm.schema,
                product_test_snapshot: {
                    version: 1,
                    language: 'en',
                    phases: [
                        {
                            timing: 'before_use',
                            label: 'Before',
                            sections: [{
                                id: 's1',
                                title: 'A',
                                module: 'product_test',
                                timing: 'before_use',
                                questions: [{ id: 'q1', text: 'Q', type: 'scale', options: [], required: true, timing: 'before_use', questionMeta: {} }],
                            }],
                        },
                    ],
                    meta: { totalQuestions: 1, sectionCount: 1, phaseCount: 1, generatedAt: '2026-01-01' },
                },
            },
        });
        expect(snap.hasSnapshot).toBe(true);
        expect(snap.phaseCount).toBe(1);
        expect(snap.questionCount).toBe(1);
    });

    it('resolveLayerEmptyDiagnostic for product_test with empty bank', () => {
        const diag = resolveLayerEmptyDiagnostic('product_test', productTestForm, {
            product_count: 0,
            package_count: 0,
            fixed_count: 0,
            seeded: false,
        }, false);
        expect(diag.message).toContain('Question bank is empty');
        expect(diag.statsLine).toContain('5 attributes selected');
    });

    it('resolveLayerEmptyDiagnostic for product_test with bank data but empty L2', () => {
        const diag = resolveLayerEmptyDiagnostic('product_test', productTestForm, {
            product_count: 41,
            package_count: 7,
            fixed_count: 18,
            seeded: true,
        }, false);
        expect(diag.message).toContain('No questions matched your attribute selections');
        expect(diag.statsLine).toContain('18 fixed in bank');
    });

    it('resolveLayerEmptyDiagnostic for product_test while bank loading', () => {
        const diag = resolveLayerEmptyDiagnostic('product_test', productTestForm, null, true);
        expect(diag.message).toContain('have not been generated yet');
        expect(diag.statsLine).toContain('bank status loading');
    });

    it('resolveLayerEmptyDiagnostic for empty screening layer', () => {
        const diag = resolveLayerEmptyDiagnostic('screening', {
            ...productTestForm,
            schema: { layer1_structure: { sections: [] }, layer2_structure: { sections: [] } },
        }, null, false);
        expect(diag.message).toContain('Screening layer not built');
    });
});
