import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PRODUCT_TEST_CONFIG,
    resolveBrandArchitecture,
    validateProductTestPreflight,
    validateProductTestPostGeneration,
    countLayerQuestions,
} from './blueprintGenerationGuards';
import { SurveyFormData, DEFAULT_TASTE_CONFIG } from '../pages/CreateSurvey/types';

const baseFormData = {
    survey_type: 'product_test',
    config: { ...DEFAULT_TASTE_CONFIG, category: 'Foam', internal_brands_data: [{ name: 'Brand A' }] },
} as SurveyFormData;

describe('blueprintGenerationGuards', () => {
    it('resolveBrandArchitecture reads from config and top-level', () => {
        const fromConfig = resolveBrandArchitecture({
            ...baseFormData,
            internal_brands_data: [],
            competitor_brands_data: [],
        });
        expect(fromConfig.hasBrands).toBe(true);

        const fromTop = resolveBrandArchitecture({
            ...baseFormData,
            config: null,
            internal_brands_data: [{ name: 'Top Brand' }],
            competitor_brands_data: [],
        } as SurveyFormData);
        expect(fromTop.hasBrands).toBe(true);
        expect(fromTop.internalBrands).toHaveLength(1);
    });

    it('validateProductTestPreflight rejects empty bank', () => {
        const result = validateProductTestPreflight(baseFormData, {
            product_count: 0,
            package_count: 0,
            fixed_count: 0,
            seeded: false,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('question bank is empty');
        }
    });

    it('validateProductTestPreflight passes seeded bank', () => {
        const result = validateProductTestPreflight(baseFormData, {
            product_count: 41,
            package_count: 7,
            fixed_count: 18,
            seeded: true,
        });
        expect(result.ok).toBe(true);
    });

    it('validateProductTestPostGeneration rejects empty snapshot when bank has fixed questions', () => {
        const result = validateProductTestPostGeneration(
            { layer1_structure: { sections: [] }, layer2_structure: { sections: [] }, product_test_snapshot: null },
            { product_count: 41, package_count: 7, fixed_count: 18, seeded: true },
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('No questions matched');
        }
    });

    it('validateProductTestPostGeneration passes populated snapshot', () => {
        const result = validateProductTestPostGeneration(
            {
                layer1_structure: { sections: [] },
                layer2_structure: { sections: [] },
                product_test_snapshot: {
                    version: 1,
                    language: 'en',
                    phases: [{
                        timing: 'before_use',
                        label: 'Before',
                        sections: [{
                            id: 's1',
                            title: 'Test',
                            module: 'product_test',
                            timing: 'before_use',
                            questions: [{ id: 'q1', text: 'Q', type: 'scale', options: [], required: true, timing: 'before_use', questionMeta: {} }],
                        }],
                    }],
                    meta: { totalQuestions: 1, sectionCount: 1, phaseCount: 1, generatedAt: '2026-01-01' },
                },
            },
            { product_count: 41, package_count: 7, fixed_count: 18, seeded: true },
        );
        expect(result.ok).toBe(true);
    });

    it('validateProductTestPostGeneration still accepts legacy L2 during rollout', () => {
        const result = validateProductTestPostGeneration(
            {
                layer1_structure: { sections: [] },
                layer2_structure: { sections: [{ title: 'Test', questions: [{ id: 'q1' }] }] },
            },
            { product_count: 41, package_count: 7, fixed_count: 18, seeded: true },
        );
        expect(result.ok).toBe(true);
    });

    it('countLayerQuestions sums question counts', () => {
        const schema = {
            layer1_structure: { sections: [{ questions: [{ id: 'a' }, { id: 'b' }] }] },
            layer2_structure: { sections: [{ questions: [{ id: 'c' }] }] },
        };
        expect(countLayerQuestions(schema as any, 'layer1_structure')).toBe(2);
        expect(countLayerQuestions(schema as any, 'layer2_structure')).toBe(1);
    });

    it('DEFAULT_PRODUCT_TEST_CONFIG has expected shape', () => {
        expect(DEFAULT_PRODUCT_TEST_CONFIG.language).toBe('en');
        expect(DEFAULT_PRODUCT_TEST_CONFIG.selected_attributes).toEqual([]);
        expect(DEFAULT_PRODUCT_TEST_CONFIG.package_test_enabled).toBe(false);
    });
});
