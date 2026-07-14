import { describe, expect, it } from 'vitest';
import {
    buildStructuredModuleSubmission,
    canReturnToPreviousPublicPhase,
    getNextPhaseStep,
    getPreviousPhaseStep,
    isRuntimeModuleEnabled,
    resolveRuntimeModuleSequence,
} from './surveyFlowOrchestration';

const baseSurvey = (overrides: Record<string, unknown> = {}) => ({
    module_sequence: ['screening', 'brand_usage', 'brand_pricing_behavior', 'taste_test', 'purchase_funnel'],
    module_snapshots: {
        brand_usage: { sections: [{ questions: [{ question_id: 'us_q1' }] }] },
        brand_pricing_behavior: { sections: [{ questions: [{ question_id: 'cb_q1' }] }] },
        purchase_funnel: { sections: [{ questions: [{ question_id: 'pf_q1' }] }] },
    },
    brand_usage: { is_enabled: true },
    brand_pricing_behavior: { is_enabled: true },
    purchase_funnel: { is_enabled: true },
    layer2_questions: {
        sections: [{ module: 'taste_test', brand: 'BrandA', questions: [{ id: 'q1' }] }],
    },
    ...overrides,
});

describe('surveyFlowOrchestration', () => {
    it('resolves custom module_sequence from survey root', () => {
        expect(resolveRuntimeModuleSequence({ module_sequence: ['screening', 'brand_usage'] })).toEqual([
            'screening',
            'brand_usage',
        ]);
    });

    it('routes screening → brand_usage → pricing → taste → funnel', () => {
        const survey = baseSurvey();
        expect(getNextPhaseStep(survey, 'screening')).toEqual({ type: 'module', moduleId: 'brand_usage' });
        expect(getNextPhaseStep(survey, 'brand_usage')).toEqual({
            type: 'module',
            moduleId: 'brand_pricing_behavior',
        });
        expect(getNextPhaseStep(survey, 'brand_pricing_behavior')).toEqual({ type: 'layer2' });
        expect(getNextPhaseStep(survey, 'taste_test')).toEqual({ type: 'module', moduleId: 'purchase_funnel' });
        expect(getNextPhaseStep(survey, 'purchase_funnel')).toEqual({ type: 'submitAll' });
    });

    it('supports usage-only path before submit', () => {
        const survey = baseSurvey({
            module_sequence: ['screening', 'brand_usage'],
            layer2_questions: { sections: [] },
            purchase_funnel: { is_enabled: false },
            brand_pricing_behavior: { is_enabled: false },
        });
        expect(getNextPhaseStep(survey, 'screening')).toEqual({ type: 'module', moduleId: 'brand_usage' });
        expect(getNextPhaseStep(survey, 'brand_usage')).toEqual({ type: 'submitAll' });
    });

    it('detects enabled modules from snapshots', () => {
        const survey = baseSurvey();
        expect(isRuntimeModuleEnabled(survey, 'brand_usage')).toBe(true);
        expect(isRuntimeModuleEnabled(survey, 'taste_test')).toBe(true);
    });

    it('handles screening-only path to taste_test when PF disabled', () => {
        const survey = baseSurvey({
            module_sequence: ['screening', 'taste_test', 'brand_usage'],
            purchase_funnel: { is_enabled: false },
        });
        expect(getNextPhaseStep(survey, 'screening')).toEqual({ type: 'layer2' });
        expect(getNextPhaseStep(survey, 'taste_test')).toEqual({ type: 'module', moduleId: 'brand_usage' });
    });

    it('builds legacy purchase_funnel alias on submit', () => {
        const { topLevel, structured } = buildStructuredModuleSubmission({
            purchase_funnel: { pf_q1: 'Nike', pf_q4: ['Nike'] },
            brand_usage: { us_q1: 'today' },
        });
        expect(topLevel.aw_q1).toBe('Nike');
        expect(structured.module_answers.brand_usage.us_q1).toBe('today');
        expect(structured.purchase_funnel.pf_q1).toBe('Nike');
        expect(structured.purchase_funnel.pb_q1).toEqual(['Nike']);
    });

    it('getPreviousPhaseStep walks module_sequence backwards from product_test', () => {
        const survey = baseSurvey({
            module_sequence: ['screening', 'taste_test', 'product_test', 'purchase_funnel'],
            survey_type: 'product_test',
            layer2_questions: {
                sections: [{ module: 'taste_test', brand: 'BrandA', questions: [{ id: 'q1' }] }],
            },
            product_test_snapshot: {
                version: 1,
                language: 'en',
                phases: [{
                    timing: 'before_use',
                    label: 'Before',
                    sections: [{
                        id: 's1',
                        title: 'S',
                        module: 'product_test',
                        timing: 'before_use',
                        questions: [{ id: 'q1', text: 'Q', type: 'scale', options: [], required: true, timing: 'before_use', diagnostic_tag: 'PF', questionMeta: {} }],
                    }],
                }],
                meta: { totalQuestions: 1, sectionCount: 1, phaseCount: 1, generatedAt: '2026-01-01' },
            },
        });
        expect(getPreviousPhaseStep(survey, 'product_test', null)).toEqual({ type: 'layer2' });
        expect(canReturnToPreviousPublicPhase(survey, 'product_test', null)).toBe(true);
    });

    it('getPreviousPhaseStep returns boundary at screening layer1', () => {
        const survey = baseSurvey({ module_sequence: ['screening', 'brand_usage'] });
        expect(getPreviousPhaseStep(survey, 'layer1', null)).toEqual({ type: 'boundary' });
        expect(getPreviousPhaseStep(survey, 'module', 'brand_usage')).toEqual({ type: 'layer1' });
    });
});
