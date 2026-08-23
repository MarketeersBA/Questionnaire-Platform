/**
 * Phase 9 — 5-module sequence permutations (PublicSurvey navigation contract).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_MODULE_SEQUENCE } from '../constants/surveyModules';
import {
    getNextPhaseStep,
    isRuntimeModuleEnabled,
    resolveRuntimeModuleSequence,
} from './surveyFlowOrchestration';

// Registry has grown since this suite was written (product_test and
// brand_analyzer added later) — kept in sync with DEFAULT_MODULE_SEQUENCE.
const ALL_MODULES = [
    'screening',
    'taste_test',
    'product_test',
    'purchase_funnel',
    'brand_usage',
    'brand_pricing_behavior',
    'brand_analyzer',
];

function surveyForSequence(sequence: string[]) {
    return {
        module_sequence: sequence,
        module_snapshots: {
            purchase_funnel: { sections: [{ questions: [{ question_id: 'pf_q1' }] }] },
            brand_usage: { sections: [{ questions: [{ question_id: 'us_q1' }] }] },
            brand_pricing_behavior: { sections: [{ questions: [{ question_id: 'cb_q1' }] }] },
        },
        purchase_funnel: { is_enabled: true },
        brand_usage: { is_enabled: true },
        brand_pricing_behavior: { is_enabled: true },
        // `module` marks this as a taste-test section (vs. a product-test one) —
        // required by hasTasteTestLayer2Sections for the module to be considered active.
        layer2_questions: { sections: [{ module: 'taste_test', questions: [{ id: 'tt_q1' }] }] },
    };
}

/** Walk the full sequence from screening and collect phase types. */
function walkSequence(sequence: string[]): string[] {
    const survey = surveyForSequence(sequence);
    const phases: string[] = ['screening'];
    let current = 'screening';
    const completed = new Set<string>();

    for (let guard = 0; guard < 20; guard++) {
        const next = getNextPhaseStep(survey, current, completed);
        if (next.type === 'submitAll') {
            phases.push('submitAll');
            break;
        }
        if (next.type === 'layer2') {
            phases.push('taste_test');
            current = 'taste_test';
            completed.add('taste_test');
            continue;
        }
        if (next.type === 'module' && next.moduleId) {
            phases.push(next.moduleId);
            current = next.moduleId;
            completed.add(next.moduleId);
            continue;
        }
        break;
    }
    return phases;
}

describe('moduleSequencePermutations', () => {
    it('default module sequence matches registry order', () => {
        expect(DEFAULT_MODULE_SEQUENCE).toEqual(ALL_MODULES);
    });

    it('walks default sequence end-to-end', () => {
        // product_test is skipped here — it only activates for
        // isProductTestSurvey() surveys, which this fixture isn't. brand_analyzer
        // activates purely from being present in module_sequence (see
        // isBrandAnalyzerEnabled's sequence-inclusion fallback), so it does appear.
        const phases = walkSequence([...DEFAULT_MODULE_SEQUENCE]);
        expect(phases).toEqual([
            'screening',
            'taste_test',
            'purchase_funnel',
            'brand_usage',
            'brand_pricing_behavior',
            'brand_analyzer',
            'submitAll',
        ]);
    });

    const permutations = [
        {
            name: 'usage before pf',
            sequence: ['screening', 'brand_usage', 'purchase_funnel', 'taste_test', 'brand_pricing_behavior'],
        },
        {
            name: 'pf before usage',
            sequence: ['screening', 'purchase_funnel', 'brand_usage', 'brand_pricing_behavior', 'taste_test'],
        },
        {
            name: 'pricing first among modules',
            sequence: ['screening', 'brand_pricing_behavior', 'brand_usage', 'purchase_funnel', 'taste_test'],
        },
    ];

    it.each(permutations)('respects custom order: $name', ({ sequence }) => {
        const resolved = resolveRuntimeModuleSequence(surveyForSequence(sequence));
        expect(resolved).toEqual(sequence);

        const phases = walkSequence(sequence);
        expect(phases[0]).toBe('screening');
        expect(phases[phases.length - 1]).toBe('submitAll');

        const configurable = sequence.filter((m) =>
            ['purchase_funnel', 'brand_usage', 'brand_pricing_behavior'].includes(m)
        );
        for (const mod of configurable) {
            expect(phases).toContain(mod);
        }
    });

    it('skips disabled taste_test when layer2 empty', () => {
        const survey = surveyForSequence(['screening', 'brand_usage', 'purchase_funnel']);
        survey.layer2_questions = { sections: [] };
        expect(isRuntimeModuleEnabled(survey, 'taste_test')).toBe(false);
        expect(getNextPhaseStep(survey, 'screening')).toEqual({
            type: 'module',
            moduleId: 'brand_usage',
        });
    });
});
